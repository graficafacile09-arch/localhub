/**
 * FASE 6e — TEST MODULO MERCHANT PRENOTAZIONI.
 *
 * Verifica persistenza/coerenza della configurazione `data.prenotazioni_config`
 * (attraverso il PUT settings che il modulo usa), l'elenco prenotazioni, i
 * filtri, annullamento/spostamento e l'autorizzazione merchant. Usa dati QA
 * dedicati via service role; nessun ordine; pulizia completa.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BASE, loginUtente } from "./fixtures/auth";

const envRaw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
for (const m of envRaw.matchAll(/^([A-Za-z0-9_]+)=(.*)$/gm)) {
  if (m[1] && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const ts = Date.now();
const SERVIZIO = { id: `svc-${ts}`, nome: "Massaggio (QA)", durata_min: 30, attivo: true };
const ORARI = (() => {
  const day = { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" };
  return {
    lunedì: day, martedì: day, mercoledì: day, giovedì: day, venerdì: day,
    sabato: day, domenica: { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" },
  };
})();
const MERCHANT = { email: `pren-mod-${ts}@localhub.it`, password: "PrenTest123!" };
const ALTRO = { email: `pren-altro-${ts}@localhub.it`, password: "PrenTest123!" };
const SLUG = `qa-prenmod-${ts}`;
const NOME = `QA Prenotazioni Mod ${ts}`;

function giornoFuturo(): string {
  const d = new Date();
  for (let i = 2; i < 12; i++) {
    const t = new Date(d.getTime() + i * 86_400_000);
    const dow = t.getDay();
    if (dow !== 0 && dow !== 6) {
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    }
  }
  return "2030-01-07";
}
const GIORNO = giornoFuturo();

let storeId = "";
let altroUserId = "";

async function setupQA() {
  const db = adminDb();
  // negozio owner
  const m = await db.auth.admin.createUser({
    email: MERCHANT.email, password: MERCHANT.password, email_confirm: true,
    user_metadata: { full_name: "Merchant QA Mod" },
  });
  if (!m.data?.user) throw new Error("merchant non creato");
  const merchantId = m.data.user.id;
  await db.from("user_roles").upsert({ user_id: merchantId, role: "merchant" }, { onConflict: "user_id,role" });

  // utente "altro" (non autorizzato)
  const a = await db.auth.admin.createUser({
    email: ALTRO.email, password: ALTRO.password, email_confirm: true,
    user_metadata: { full_name: "Altro QA" },
  });
  if (!a.data?.user) throw new Error("altro non creato");
  altroUserId = a.data.user.id;
  await db.from("user_roles").upsert({ user_id: altroUserId, role: "merchant" }, { onConflict: "user_id,role" });

  const s = await db.from("negozi").insert({
    owner_user_id: merchantId, nome: NOME, slug: SLUG, categoria: "Beauty",
    citta: "Castrovillari", attivo: true,
    moduli_attivi: ["prenotazioni", "servizi", "orari", "contatti", "richiesta_info"],
    orari: ORARI,
    data: {
      servizi_strutturati: [SERVIZIO],
      prenotazioni_config: { attiva: false, anticipo_min_ore: 1, anticipo_max_giorni: 30, buffer_min: 0, limite_giornaliero: null, passo_slot_min: 15 },
    },
  }).select("id").single();
  if (s.error || !s.data) throw new Error("negozio non creato");
  storeId = s.data.id;
}

async function cleanupQA() {
  const db = adminDb();
  if (storeId) {
    await db.from("prenotazioni").delete().eq("negozio_id", storeId);
    await db.from("negozi").delete().eq("id", storeId);
  }
  for (const uid of [altroUserId]) {
    await db.from("user_roles").delete().eq("user_id", uid);
    await db.auth.admin.deleteUser(uid);
  }
  const utenti = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of (utenti.data?.users ?? [])) {
    if (u.email && u.email.startsWith("pren-mod-")) {
      await db.from("user_roles").delete().eq("user_id", u.id);
      await db.auth.admin.deleteUser(u.id);
    }
  }
}

/** Legge la config `prenotazioni_config` dal GET settings (come il modulo). */
async function getConfig(page: import("@playwright/test").Page) {
  const r = await page.evaluate(async (id) => {
    const res = await fetch(`/api/merchant/stores/${id}/settings`);
    return res.json();
  }, storeId);
  return ((r.data?.settings?.data ?? {}) as Record<string, unknown>).prenotazioni_config as Record<string, unknown> | undefined;
}

test.describe.configure({ mode: "serial" });

test.describe("FASE 6e — MODULO PRENOTAZIONI (merchant)", () => {
  test.beforeAll(async () => {
    await setupQA();
  });
  test.afterAll(async () => {
    await cleanupQA();
  });

  test("1. modulo non attivo → configurazione coerente (default)", async ({ page }) => {
    await loginUtente(page, { chiave: "e1", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA Mod", ruolo: "merchant" });
    const cfg = await getConfig(page);
    expect(cfg?.attiva).toBe(false);
    expect(cfg?.anticipo_min_ore).toBe(1);
    expect(cfg?.anticipo_max_giorni).toBe(30);
    expect(cfg?.buffer_min).toBe(0);
    expect(cfg?.limite_giornaliero).toBeNull();
    expect(cfg?.passo_slot_min).toBe(15);
  });

  test("2. attivazione modulo → persistenza", async ({ page }) => {
    await loginUtente(page, { chiave: "e2", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA Mod", ruolo: "merchant" });
    const cfg = await getConfig(page);
    const res = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.storeId}/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { prenotazioni_config: { ...args.cfg, attiva: true } } }),
      });
      return { status: r.status, json: await r.json() };
    }, { storeId, cfg });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
  });

  test("3. reload → configurazione mantenuta", async ({ page }) => {
    await loginUtente(page, { chiave: "e3", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA Mod", ruolo: "merchant" });
    const cfg = await getConfig(page);
    expect(cfg?.attiva).toBe(true);
  });

  test("4-9. modifica parametri (ant min, ant max, buffer, passo, limiti)", async ({ page }) => {
    await loginUtente(page, { chiave: "e4", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA Mod", ruolo: "merchant" });
    const patch = {
      attiva: true, anticipo_min_ore: 4, anticipo_max_giorni: 60,
      buffer_min: 10, passo_slot_min: 30, limite_giornaliero: 25,
    };
    const res = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.storeId}/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { prenotazioni_config: args.patch } }),
      });
      return r.json();
    }, { storeId, patch });
    expect(res.success).toBe(true);

    const cfg = await getConfig(page);
    expect(cfg?.anticipo_min_ore).toBe(4);
    expect(cfg?.anticipo_max_giorni).toBe(60);
    expect(cfg?.buffer_min).toBe(10);
    expect(cfg?.passo_slot_min).toBe(30);
    expect(cfg?.limite_giornaliero).toBe(25);

    // 8. limite giornaliero null
    const patchNull = { ...patch, limite_giornaliero: null };
    await page.evaluate(async (args) => {
      await fetch(`/api/merchant/stores/${args.storeId}/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { prenotazioni_config: args.patch } }),
      });
    }, { storeId, patch: patchNull });
    const cfgNull = await getConfig(page);
    expect(cfgNull?.limite_giornaliero).toBeNull();
  });

  test("10-14. elenco prenotazioni, filtri, annulla, sposta", async ({ request, page }) => {
    // crea 2 prenotazioni via POST pubblico (con orari aperti)
    const p1 = await request.post(`/api/negozi/${SLUG}/prenotazioni`, {
      headers: { "x-forwarded-for": "198.51.100.30" },
      data: {
        idempotencyKey: `m-${ts}-1`, servizioId: SERVIZIO.id, giorno: GIORNO, oraInizio: "10:00",
        nome: "Luca", cognome: "Neri", email: "luca@example.com",
      },
    });
    expect(p1.status()).toBe(201);
    const p2 = await request.post(`/api/negozi/${SLUG}/prenotazioni`, {
      headers: { "x-forwarded-for": "198.51.100.31" },
      data: {
        idempotencyKey: `m-${ts}-2`, servizioId: SERVIZIO.id, giorno: GIORNO, oraInizio: "11:00",
        nome: "Elena", cognome: "Verdi", email: "elena@example.com",
      },
    });
    expect(p2.status()).toBe(201);

    await loginUtente(page, { chiave: "e5", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA Mod", ruolo: "merchant" });

    // 10. elenco
    const listJson = await page.evaluate(async (id) => {
      const r = await fetch(`/api/merchant/stores/${id}/prenotazioni`);
      return r.json();
    }, storeId);
    expect(listJson.success).toBe(true);
    expect(Array.isArray(listJson.data.prenotazioni)).toBe(true);

    // 11. filtro giorno
    const byDay = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.id}/prenotazioni?giorno=${args.giorno}`);
      return r.json();
    }, { id: storeId, giorno: GIORNO });
    expect(byDay.data.prenotazioni.length).toBeGreaterThanOrEqual(2);

    // 12. filtro stato
    const byStato = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.id}/prenotazioni?stato=confermata`);
      return r.json();
    }, { id: storeId });
    const confermate = byStato.data.prenotazioni.filter((p: { stato: string }) => p.stato === "confermata");
    expect(confermate.length).toBeGreaterThanOrEqual(2);

    // 13. annulla (una prenotazione)
    const prima = byDay.data.prenotazioni[0];
    const annulla = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.id}/prenotazioni/${args.pid}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "annulla", motivo: "qa" }),
      });
      return r.json();
    }, { id: storeId, pid: prima.id });
    expect(annulla.success).toBe(true);
    expect(annulla.data.prenotazione.stato).toBe("cancellata");

    // 14. sposta (l'altra prenotazione)
    const seconda = (byDay.data.prenotazioni.find((p: { id: string }) => p.id !== prima.id) ?? byDay.data.prenotazioni[1]);
    const sposta = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.id}/prenotazioni/${args.pid}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "sposta", nuovoGiorno: args.giorno, nuovaOra: "16:00" }),
      });
      return r.json();
    }, { id: storeId, pid: seconda.id, giorno: GIORNO });
    expect(sposta.success).toBe(true);
    expect(String(sposta.data.prenotazione.oraInizio).slice(0, 5)).toBe("16:00");

    // 15. cambio stato (effettuata)
    const st = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.id}/prenotazioni/${args.pid}`);
      return r.json();
    }, { id: storeId, pid: seconda.id });
    expect(st.success).toBe(true);
    expect(st.data.prenotazione.stato).toBe("confermata");
    const db = adminDb();
    await db.from("prenotazioni").update({ stato: "effettuata" }).eq("id", seconda.id);
    const st2 = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.id}/prenotazioni/${args.pid}`);
      return r.json();
    }, { id: storeId, pid: seconda.id });
    expect(st2.data.prenotazione.stato).toBe("effettuata");
  });

  test("16. negozio/profilo non autorizzato → accesso negato", async ({ page }) => {
    await loginUtente(page, { chiave: "e6", email: ALTRO.email, password: ALTRO.password, fullName: "Altro QA", ruolo: "merchant" });
    const r = await page.evaluate(async (id) => {
      const res = await fetch(`/api/merchant/stores/${id}/prenotazioni`);
      return res.status;
    }, storeId);
    expect(r).toBe(403);
  });

  test("17. profilo senza prenotazioni → preset invariato", async () => {
    const { PROFILI_ATTIVITA } = await import("../lib/profili-attivita");
    const ecommerce = PROFILI_ATTIVITA.find((p) => p.id === "ecommerce");
    const altroP = PROFILI_ATTIVITA.find((p) => p.id === "altro");
    expect(ecommerce?.moduli_attivi).not.toContain("prenotazioni");
    expect(altroP?.moduli_attivi).not.toContain("prenotazioni");
  });
});