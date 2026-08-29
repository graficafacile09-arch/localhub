/**
 * FASE 6d — TEST API PRENOTAZIONI.
 *
 * Copre i 24 punti della fase (pubblico + merchant) senza creare ordini e con
 * pulizia completa dei dati QA. Usa un negozio/merchant QA dedicato creato
 * via service role (mai dati reali). Le route pubbliche sono testate con il
 * contesto `request` di Playwright; le route merchant dopo login via page
 * (fetch stesso-origine → cookie di sessione).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// Playwright NON carica .env.local: la carichiamo manualmente per usare la
// service role nello setup/cleanup (stesso pattern di trash-cestino.spec.ts).
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

// ── dati QA isolati (per run) ──────────────────────────────────────────────
const ts = Date.now();
const SERVIZIO = {
  id: `svc-${ts}`,
  nome: "Pulizia dentale (QA)",
  durata_min: 30,
  attivo: true,
};
const ORARI = (() => {
  const day = { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" };
  return {
    lunedì: day, martedì: day, mercoledì: day, giovedì: day, venerdì: day,
    sabato: day, domenica: { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" },
  };
})();
const MERCHANT = {
  email: `pren-merchant-${ts}@localhub.it`,
  password: "PrenTest123!",
};
const SLUG = `qa-pren-${ts}`;
const NOME = `QA Prenotazioni ${ts}`;

// giorno futuro "corretto": un lunedì..sabato tra +2 e +7 giorni
function giornoFuturo(): string {
  const d = new Date();
  for (let i = 2; i < 12; i++) {
    const t = new Date(d.getTime() + i * 86_400_000);
    const dow = t.getDay(); // 0 = domenica
    if (dow !== 0 && dow !== 6) {
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    }
  }
  return "2030-01-07";
}
const GIORNO = giornoFuturo();

// stato condiviso tra i test della suite (creato una volta)
let qaStoreId = "";
let qaStoreSlug = SLUG;
let qaUserId = "";

async function setupQA() {
  const db = adminDb();
  // merchant QA
  const { data: u, error: uErr } = await db.auth.admin.createUser({
    email: MERCHANT.email,
    password: MERCHANT.password,
    email_confirm: true,
    user_metadata: { full_name: "Merchant QA Prenotazioni" },
  });
  expect(uErr, "create QA user").toBeNull();
  if (!u?.user) throw new Error("QA user non creato");
  qaUserId = u.user.id;
  await db.from("user_roles").upsert({ user_id: qaUserId, role: "merchant" }, { onConflict: "user_id,role" });
  // negozio QA con servizio, orari, config prenotazioni attiva
  const { data: s, error: sErr } = await db.from("negozi").insert({
    owner_user_id: qaUserId,
    nome: NOME,
    slug: SLUG,
    categoria: "Beauty",
    citta: "Castrovillari",
    attivo: true,
    moduli_attivi: ["prenotazioni", "servizi", "orari", "contatti"],
    orari: ORARI,
    data: {
      servizi_strutturati: [SERVIZIO],
      prenotazioni_config: {
        attiva: true,
        anticipo_min_ore: 0,
        anticipo_max_giorni: 60,
        buffer_min: 0,
        limite_giornaliero: null,
        passo_slot_min: 30,
      },
    },
  }).select("id").single();
  expect(sErr, "create QA negozio").toBeNull();
  qaStoreId = s!.id;
}

async function cleanupQA() {
  const db = adminDb();
  // prenotazioni prima (FK restrict su negozi), poi negozio, ruoli, utente
  if (qaStoreId) {
    await db.from("prenotazioni").delete().eq("negozio_id", qaStoreId);
    await db.from("negozi").delete().eq("id", qaStoreId);
  }
  if (qaUserId) {
    await db.from("user_roles").delete().eq("user_id", qaUserId);
    await db.auth.admin.deleteUser(qaUserId);
  }
}

/** Header x-forwarded-for univoci per isolare il rate limit pubblico. */
async function postPubblico(ctx: APIRequestContext, path: string, body: unknown, ip: string) {
  return ctx.post(path, { data: body, headers: { "x-forwarded-for": ip } });
}
async function getPubblico(ctx: APIRequestContext, path: string, ip: string) {
  return ctx.get(path, { headers: { "x-forwarded-for": ip } });
}

test.describe.configure({ mode: "serial" });

test.describe("PRENOTAZIONI — API pubblico e merchant (Fase 6d)", () => {
  test.beforeAll(async () => {
    await setupQA();
  });
  test.afterAll(async () => {
    await cleanupQA();
  });

  function payloadPrenotazione(over = {}) {
    return {
      idempotencyKey: `qa-${ts}-${Math.random().toString(36).slice(2, 8)}`,
      servizioId: SERVIZIO.id,
      giorno: GIORNO,
      oraInizio: "10:00",
      nome: "Mario",
      cognome: "Rossi",
      email: "mario.rossi@example.com",
      ...over,
    };
  }

  test("1. GET disponibilità negozio valido → slot", async ({ request }) => {
    const r = await getPubblico(
      request,
      `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(SERVIZIO.id)}&giorno=${GIORNO}`,
      "198.51.100.1"
    );
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.success).toBe(true);
    expect(j.data.servizioId).toBe(SERVIZIO.id);
    expect(j.data.durataMin).toBe(30);
    expect(Array.isArray(j.data.slot)).toBe(true);
    expect(j.data.slot.length).toBeGreaterThan(0);
    expect(j.data.slot[0]).toHaveProperty("oraInizio");
    expect(j.data.slot[0]).toHaveProperty("oraFine");
  });

  test("2. servizio inesistente → 404", async ({ request }) => {
    const r = await getPubblico(
      request,
      `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=inesistente&giorno=${GIORNO}`,
      "198.51.100.2"
    );
    expect(r.status()).toBe(404);
  });

  test("3. servizio disattivato → 403", async ({ request, page }) => {
    // disattiva via service role, verifica, riattiva
    const db = adminDb();
    const negozio = (await db.from("negozi").select("data").eq("id", qaStoreId).single()).data;
    const negozioData = (negozio?.data ?? {}) as Record<string, unknown>;
    const servizi: Array<Record<string, unknown>> = Array.isArray(negozioData.servizi_strutturati)
      ? (negozioData.servizi_strutturati as Array<Record<string, unknown>>)
      : [];
    const idx = servizi.findIndex((s) => s.id === SERVIZIO.id);
    if (idx >= 0) servizi[idx] = { ...servizi[idx], attivo: false };
    await db.from("negozi").update({ data: { ...negozioData, servizi_strutturati: servizi } }).eq("id", qaStoreId);

    const r = await getPubblico(
      request,
      `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(SERVIZIO.id)}&giorno=${GIORNO}`,
      "198.51.100.3"
    );
    expect(r.status()).toBe(403);
    void page;

    // riattiva
    const n2 = (await db.from("negozi").select("data").eq("id", qaStoreId).single()).data;
    const n2Data = (n2?.data ?? {}) as Record<string, unknown>;
    const servizi2: Array<Record<string, unknown>> = Array.isArray(n2Data.servizi_strutturati)
      ? (n2Data.servizi_strutturati as Array<Record<string, unknown>>)
      : [];
    const idx2 = servizi2.findIndex((s) => s.id === SERVIZIO.id);
    if (idx2 >= 0) servizi2[idx2] = { ...servizi2[idx2], attivo: true };
    await db.from("negozi").update({ data: { ...n2Data, servizi_strutturati: servizi2 } }).eq("id", qaStoreId);
  });

  test("4. modulo prenotazioni disattivato → 403", async ({ request, page }) => {
    const db = adminDb();
    await db.from("negozi").update({ moduli_attivi: ["servizi"] }).eq("id", qaStoreId);
    const r = await getPubblico(
      request,
      `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(SERVIZIO.id)}&giorno=${GIORNO}`,
      "198.51.100.4"
    );
    expect(r.status()).toBe(403);
    void page;
    await db.from("negozi").update({ moduli_attivi: ["prenotazioni", "servizi", "orari", "contatti"] }).eq("id", qaStoreId);
  });

  test("5. giorno chiuso → 0 slot", async ({ request }) => {
    // domenica prossima
    const d = new Date();
    const offset = ((7 - d.getDay()) % 7) || 7; // prossima domenica
    const dom = new Date(d.getTime() + offset * 86_400_000);
    const giornoDom = `${dom.getFullYear()}-${String(dom.getMonth() + 1).padStart(2, "0")}-${String(dom.getDate()).padStart(2, "0")}`;
    const r = await getPubblico(
      request,
      `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(SERVIZIO.id)}&giorno=${giornoDom}`,
      "198.51.100.5"
    );
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.data.slot.length).toBe(0);
  });

  test("6. giorno fuori finestra (passato) → 0 slot", async ({ request }) => {
    const r = await getPubblico(
      request,
      `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(SERVIZIO.id)}&giorno=2020-01-06`,
      "198.51.100.6"
    );
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.data.slot.length).toBe(0);
  });

  test("7. slot occupato → 409", async ({ request }) => {
    const chiave = payloadPrenotazione().idempotencyKey;
    const p1 = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ idempotencyKey: chiave, oraInizio: "10:00" }), "198.51.100.7");
    expect(p1.status()).toBe(201);
    // stesso negozio/giorno/ora con chiave diversa
    const p2 = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ oraInizio: "10:00" }), "198.51.100.8");
    expect(p2.status()).toBe(409);
    const j2 = await p2.json();
    expect(j2.error.code).toBe("SLOT_OCCUPATO");
  });

  test("8. prenotazione valida guest → 201", async ({ request }) => {
    const r = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ oraInizio: "11:00" }), "198.51.100.9");
    expect(r.status()).toBe(201);
    const j = await r.json();
    expect(j.success).toBe(true);
    expect(j.data.prenotazione.servizioNome).toBe(SERVIZIO.nome);
    expect(j.data.prenotazione.stato).toBe("confermata");
    expect(j.data.prenotazione.clienteUserId).toBeNull();
  });

  test("9. prenotazione valida autenticata → clienteUserId", async ({ page }) => {
    await loginUtente(page, { chiave: "qa", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA", ruolo: "merchant" });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const ris = await page.evaluate(async (args) => {
      const r = await fetch(`/api/negozi/${args.slug}/prenotazioni`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: args.key, servizioId: args.svc, giorno: args.giorno, oraInizio: "12:00",
          nome: "Anna", cognome: "Bianchi", email: "anna@example.com",
        }),
      });
      return { status: r.status, json: await r.json() };
    }, { slug: qaStoreSlug, key: payloadPrenotazione().idempotencyKey, svc: SERVIZIO.id, giorno: GIORNO });
    expect(ris.status).toBe(201);
    expect(ris.json.data.prenotazione.clienteUserId).toBe(qaUserId);
    // logout per non interferire con gli altri test merchant
    await page.context().clearCookies();
  });

  test("10. idempotencyKey ripetuta → stessa prenotazione, nessun duplicato", async ({ request }) => {
    const chiave = payloadPrenotazione().idempotencyKey;
    const a = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ idempotencyKey: chiave, oraInizio: "18:00" }), "198.51.100.10");
    expect(a.status()).toBe(201);
    const id1 = (await a.json()).data.prenotazione.id;
    const b = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ idempotencyKey: chiave, oraInizio: "18:00" }), "198.51.100.11");
    expect(b.status()).toBe(201);
    const jb = await b.json();
    expect(jb.data.giaEsistente).toBe(true);
    expect(jb.data.prenotazione.id).toBe(id1);
    const db = adminDb();
    const { count } = await db.from("prenotazioni").select("id", { count: "exact", head: true }).eq("idempotency_key", chiave);
    expect(count).toBe(1);
  });

  test("11. honeypot → 400", async ({ request }) => {
    const r = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ website: "http://spam" }), "198.51.100.12");
    expect(r.status()).toBe(400);
  });

  test("12. rate limit → 429 dopo soglia", async ({ request }) => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const r = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ oraInizio: "15:00" }), ip);
      lastStatus = r.status();
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });

  test("13-17. merchant collection + detail + sposta + annulla", async ({ page }) => {
    await loginUtente(page, { chiave: "qa2", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA", ruolo: "merchant" });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    // 13. GET elenco
    const listJson = await page.evaluate(async (storeId) => {
      const r = await fetch(`/api/merchant/stores/${storeId}/prenotazioni`);
      return { status: r.status, json: await r.json() };
    }, qaStoreId);
    expect(listJson.status).toBe(200);
    expect(Array.isArray(listJson.json.data.prenotazioni)).toBe(true);

    // 15. merchant POST manuale
    const postJson = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.storeId}/prenotazioni`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: args.key, servizioId: args.svc, giorno: args.giorno, oraInizio: "16:00",
          nome: "Giovanni", cognome: "Verdi", telefono: "3331234567",
        }),
      });
      return { status: r.status, json: await r.json() };
    }, { storeId: qaStoreId, key: payloadPrenotazione().idempotencyKey, svc: SERVIZIO.id, giorno: GIORNO });
    expect(postJson.status).toBe(201);
    const prenId: string = postJson.json.data.prenotazione.id;

    // 14. GET dettaglio
    const det = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.storeId}/prenotazioni/${args.id}`);
      return { status: r.status, json: await r.json() };
    }, { storeId: qaStoreId, id: prenId });
    expect(det.status).toBe(200);
    expect(det.json.data.prenotazione.id).toBe(prenId);

    // 16. sposta a 16:30 (stesso giorno, interno orario)
    const sposta = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.storeId}/prenotazioni/${args.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "sposta", nuovoGiorno: args.giorno, nuovaOra: "16:30" }),
      });
      return { status: r.status, json: await r.json() };
    }, { storeId: qaStoreId, id: prenId, giorno: GIORNO });
    expect(sposta.status).toBe(200);
    expect(String(sposta.json.data.prenotazione.oraInizio).slice(0, 5)).toBe("16:30");
    expect(sposta.json.data.prenotazione.id).toBe(prenId);

    // 17. cancellazione via PUT annulla
    const annulla = await page.evaluate(async (args) => {
      const r = await fetch(`/api/merchant/stores/${args.storeId}/prenotazioni/${args.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "annulla", motivo: "test" }),
      });
      return { status: r.status, json: await r.json() };
    }, { storeId: qaStoreId, id: prenId });
    expect(annulla.status).toBe(200);
    expect(annulla.json.data.prenotazione.stato).toBe("cancellata");

    await page.context().clearCookies();
  });

  test("18. merchant su negozio altrui → 403", async ({ page }) => {
    // login come merchantC (diverso da qaStore owner) e prova a leggere
    await loginUtente(page, UTENTI.merchantC);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const r = await page.evaluate(async (storeId) => {
      const res = await fetch(`/api/merchant/stores/${storeId}/prenotazioni`);
      return res.status;
    }, qaStoreId);
    expect(r).toBe(403);
    await page.context().clearCookies();
  });

  test("19. DELETE non deve hard-delete", async ({ request, page }) => {
    const chiave = payloadPrenotazione().idempotencyKey;
    const create = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ idempotencyKey: chiave, oraInizio: "17:00" }), "198.51.100.13");
    expect(create.status()).toBe(201);
    const id: string = (await create.json()).data.prenotazione.id;

    await loginUtente(page, { chiave: "qa3", email: MERCHANT.email, password: MERCHANT.password, fullName: "Merchant QA", ruolo: "merchant" });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    // DELETE con body motivo (ambiguo GET/DELETE body: per essere sicuri mandiamo via POST-like? Playwright fetch con DELETE + body)
    const r = await page.evaluate(async (args) => {
      const res = await fetch(`/api/merchant/stores/${args.storeId}/prenotazioni/${args.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "cleanup" }),
      });
      return { status: res.status, json: await res.json() };
    }, { storeId: qaStoreId, id });
    expect(r.status).toBe(200);
    expect(r.json.data.prenotazione.stato).toBe("cancellata");

    // riga ancora presente (soft delete)
    const db = adminDb();
    const { count } = await db.from("prenotazioni").select("id", { count: "exact", head: true }).eq("id", id);
    expect(count).toBe(1);
    await page.context().clearCookies();
  });

  test("20. errori SQL non esposti", async ({ request }) => {
    // durata non viene mai accettata dal client; body privo di recapito → 422 pulito
    const r = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ email: "", telefono: "" }), "198.51.100.14");
    expect(r.status()).toBe(422);
    const j = await r.json();
    expect(j.error.message).not.toMatch(/PGRST|postgres|sql|constraint|violat/i);
  });

  test("21-24. solo confermata blocca; cancellata/effettuata/no_show non bloccano", async ({ request }) => {
    const db = adminDb();
    // crea una confermata
    const giornoValido = GIORNO;
    const p = await postPubblico(request, `/api/negozi/${qaStoreSlug}/prenotazioni`, payloadPrenotazione({ oraInizio: "09:00" }), "198.51.100.15");
    expect(p.status()).toBe(201);
    const idConfermata: string = (await p.json()).data.prenotazione.id;

    // 21. GET disponibilità considera solo confermata → lo slot 09:00 non c'è
    const disp = await getPubblico(
      request,
      `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(SERVIZIO.id)}&giorno=${giornoValido}`,
      "198.51.100.16"
    );
    const dispJson = await disp.json();
    const inizioSlot = dispJson.data.slot.map((s: { oraInizio: string }) => s.oraInizio);
    expect(inizioSlot).not.toContain("09:00");

    // 22/23/24. porta quella prenotazione a cancellata/effettuata/no_show →
    // lo slot 09:00 torna disponibile (non blocca)
    for (const stato of ["cancellata", "effettuata", "no_show"]) {
      await db.from("prenotazioni").update({ stato }).eq("id", idConfermata);
      const disp2 = await getPubblico(
        request,
        `/api/negozi/${qaStoreSlug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(SERVIZIO.id)}&giorno=${giornoValido}`,
        "198.51.100.17"
      );
      const j2 = await disp2.json();
      const ini = j2.data.slot.map((s: { oraInizio: string }) => s.oraInizio);
      expect(ini, `slot 09:00 free when stato=${stato}`).toContain("09:00");
    }
  });
});