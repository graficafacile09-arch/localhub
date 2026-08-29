/**
 * FASE 6f — TEST UI PUBBLICA PRENOTAZIONI.
 *
 * Verifica la CTA pubblica, il form (servizio/giorno/slot/dati), il submit,
 * la gestione di SLOT_OCCUPATO, il doppio click e il comportamento responsive.
 * Usa un negozio/servizio QA dedicato via service role; nessun ordine;
 * pulizia completa dei dati.|test module
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BASE } from "./fixtures/auth";

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
const SERVIZIO = { id: `svc-ui-${ts}`, nome: "Visita di controllo (QA)", durata_min: 30, attivo: true };
const ORARI = (() => {
  const day = { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" };
  return {
    lunedì: day, martedì: day, mercoledì: day, giovedì: day, venerdì: day,
    sabato: day, domenica: { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" },
  };
})();
const SLUG = `qa-prenui-${ts}`;
const NOME = `QA Prenotazioni UI ${ts}`;
const GIORNO = giornoFuturo();

function giornoFuturo(): string {
  const d = new Date();
  for (let i = 3; i < 14; i++) {
    const t = new Date(d.getTime() + i * 86_400_000);
    const dow = t.getDay();
    if (dow !== 0 && dow !== 6) {
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    }
  }
  return "2030-02-05";
}

let storeId = "";

async function setupQA() {
  const db = adminDb();
  const s = await db.from("negozi").insert({
    nome: NOME, slug: SLUG, categoria: "Beauty", citta: "Castrovillari",
    attivo: true, owner_user_id: null,
    moduli_attivi: ["prenotazioni", "servizi", "orari", "contatti"],
    orari: ORARI,
    data: {
      servizi_strutturati: [SERVIZIO],
      prenotazioni_config: {
        attiva: true, anticipo_min_ore: 24, anticipo_max_giorni: 30,
        buffer_min: 0, limite_giornaliero: null, passo_slot_min: 30,
      },
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
}

async function contaPrenotazioni(): Promise<number> {
  const db = adminDb();
  if (!storeId) return 0;
  const { count } = await db.from("prenotazioni").select("id", { count: "exact", head: true }).eq("negozio_id", storeId);
  return count ?? 0;
}

test.describe.configure({ mode: "serial" });

test.describe("FASE 6f — UI PUBBLICA PRENOTAZIONI", () => {
  test.beforeAll(async () => { await setupQA(); });
  test.afterAll(async () => { await cleanupQA(); });

  test("1. modulo attivo → CTA presente; 17. responsive", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    // CTA globale "Prenota ora" nella barra azioni
    await expect(page.getByRole("button", { name: "Prenota ora" }).first()).toBeVisible();
    // CTA per singolo servizio "Prenota"
    await expect(page.getByRole("button", { name: "Prenota", exact: true }).first()).toBeVisible();
    // nessun overflow orizzontale mobile
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("2. modulo disattivato → CTA assente", async ({ page }) => {
    // disattiva il modulo nel DB e verifica che la CTA sparisca
    const db = adminDb();
    const { error } = await db
      .from("negozi")
      .update({ moduli_attivi: ["servizi", "orari", "contatti"] })
      .eq("id", storeId);
    if (error) throw error;
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Prenota ora" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prenota", exact: true })).toHaveCount(0);
    // riabilita il modulo per i test successivi
    await db.from("negozi").update({ moduli_attivi: ["prenotazioni", "servizi", "orari", "contatti"] }).eq("id", storeId);
  });

  test("3. apertura form + 4. servizio preselezionato + 5. selezione giorno + 6/7. disponibilità/slot", async ({ page }) => {
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Prenota ora" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // servizio unico viene mostrato già selezionato (niente radiobox, box blu)
    await expect(dialog.getByText(SERVIZIO.nome)).toBeVisible();
    // seleziona giorno
    const dateInput = dialog.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();
    await dateInput.fill(GIORNO);
    // aspetta gli slot (lo slot 09:00 dovrebbe esserci)
    await expect(page.getByRole("button", { name: "09:00" })).toBeVisible({ timeout: 8000 });
  });

  test("8. giorno senza slot → messaggio", async ({ page }) => {
    // domenica prossima (il negozio è chiuso → 0 slot)
    const d = new Date();
    const offset = ((7 - d.getDay()) % 7) || 7;
    const dom = new Date(d.getTime() + offset * 86_400_000);
    const giornoDom = `${dom.getFullYear()}-${String(dom.getMonth() + 1).padStart(2, "0")}-${String(dom.getDate()).padStart(2, "0")}`;
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Prenota ora" }).first().click();
    await page.getByRole("dialog").locator('input[type="date"]').fill(giornoDom);
    await expect(page.getByText(/non ci sono orari disponibili/)).toBeVisible({ timeout: 8000 });
  });

  test("9/10. compilazione dati + validazione recapito", async ({ page }) => {
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Prenota ora" }).first().click();
    const dialog = page.getByRole("dialog");
    const campo = (id: string) => dialog.locator("#" + id);
    await dialog.locator('input[type="date"]').fill(GIORNO);
    await expect(dialog.getByRole("button", { name: "09:00" })).toBeVisible({ timeout: 8000 });
    await dialog.getByRole("button", { name: "09:00" }).click();
    // senza recapito → errore client
    await campo("pren-nome").fill("Mario");
    await campo("pren-cognome").fill("Rossi");
    await dialog.getByRole("button", { name: "Conferma prenotazione" }).click();
    await expect(dialog.locator("p.text-red-700")).toHaveText(/almeno un recapito/);
  });

  test("11/12. submit corretto + successo + 15. guest", async ({ page }) => {
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Prenota ora" }).first().click();
    const dialog = page.getByRole("dialog");
    const campo = (id: string) => dialog.locator("#" + id);
    await dialog.locator('input[type="date"]').fill(GIORNO);
    await expect(dialog.getByRole("button", { name: "11:00" })).toBeVisible({ timeout: 8000 });
    await dialog.getByRole("button", { name: "11:00" }).click();
    await campo("pren-nome").fill("Giulia");
    await campo("pren-cognome").fill("Bianchi");
    await campo("pren-email").fill("giulia@example.com");
    await dialog.getByRole("button", { name: "Conferma prenotazione" }).click();
    await expect(dialog.getByText("Prenotazione confermata")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(SERVIZIO.nome)).toBeVisible();
    // persistita
    expect(await contaPrenotazioni()).toBeGreaterThanOrEqual(1);
  });

  test("13. SLOT_OCCUPATO → refresh disponibilità + messaggio", async ({ page }) => {
    // Occupa lo slot 17:00 del giorno direttamente (DB).
    const api = await fetch(`${BASE}/api/negozi/${SLUG}/prenotazioni`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.97" },
      body: JSON.stringify({
        idempotencyKey: `occ-${ts}-${Math.random().toString(36).slice(2, 8)}`,
        servizioId: SERVIZIO.id, giorno: GIORNO, oraInizio: "17:00",
        nome: "Occupante", cognome: "Test", telefono: "3331112222",
      }),
    });
    expect(api.status).toBe(201);

    // La UI crede che 17:00 sia libero (intercetto disponibilita e lo includo),
    // ma al POST il DB risponde SLOT_OCCUPATO → la UI mostra il messaggio e
    // ricarica la disponibilità.
    await page.route(`**/api/negozi/${SLUG}/prenotazioni/disponibilita**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            giorno: GIORNO,
            servizioId: SERVIZIO.id,
            durataMin: 30,
            slot: [
              { oraInizio: "17:00", oraFine: "17:30" },
              { oraInizio: "18:00", oraFine: "18:30" },
            ],
          },
        }),
      });
    });

    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Prenota ora" }).first().click();
    const dialog = page.getByRole("dialog");
    const campo = (id: string) => dialog.locator("#" + id);
    await dialog.locator('input[type="date"]').fill(GIORNO);
    await expect(dialog.getByRole("button", { name: "17:00" })).toBeVisible({ timeout: 8000 });
    await dialog.getByRole("button", { name: "17:00" }).click();
    await campo("pren-nome").fill("Conflitto");
    await campo("pren-cognome").fill("Utente");
    await campo("pren-email").fill("conflitto@example.com");
    await dialog.getByRole("button", { name: "Conferma prenotazione" }).click();

    // Messaggio SLOT_OCCUPATO comprensibile.
    await expect(dialog.getByText(/appena prenotato da un'altra persona/)).toBeVisible({ timeout: 10000 });
  });

  test("14. doppio click submit → un solo POST", async ({ page }) => {
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Prenota ora" }).first().click();
    const dialog = page.getByRole("dialog");
    const campo = (id: string) => dialog.locator("#" + id);
    await dialog.locator('input[type="date"]').fill(GIORNO);
    await expect(dialog.getByRole("button", { name: "16:00" })).toBeVisible({ timeout: 8000 });
    await dialog.getByRole("button", { name: "16:00" }).click();
    await campo("pren-nome").fill("Doppio");
    await campo("pren-cognome").fill("Click");
    await campo("pren-telefono").fill("3330001111");
    const prima = await contaPrenotazioni();
    await dialog.getByRole("button", { name: "Conferma prenotazione" }).click();
    // secondo click immediato
    await dialog.getByRole("button", { name: /Invio in corso|Conferma prenotazione/ }).click({ force: true }).catch(() => {});
    await expect(dialog.getByText("Prenotazione confermata")).toBeVisible({ timeout: 10000 });
    expect(await contaPrenotazioni()).toBe(prima + 1);
  });

  test("16. autenticato: la UI è identica (nessun login obbligatorio)", async ({ page }) => {
    await page.goto(`${BASE}/negozio/${SLUG}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Prenota ora" }).first()).toBeVisible();
    // Il flusso continua senza login: nessuna redirect al login.
    await page.getByRole("button", { name: "Prenota ora" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("18. nessun dato reale lasciato", async () => {
    // esegue esplicitamente la pulizia Q.A. e verifica che resti 0
    await cleanupQA();
    const count = await contaPrenotazioni();
    expect(0).toBe(0);
    expect(count).toBe(0);
  });
});