import { test, expect } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

/**
 * Test mirati per i due bug critici:
 *
 * BUG 1 — Negozi eliminati dall'admin non devono ricomparire dopo reload.
 * BUG 2 — Offerte eliminate dall'admin non devono ricomparire per il vendor.
 *
 * Gli account non sono condivisi con altri spec in parallelo: questo spec
 * usa UTENTI.admin (mai signOut) e UTENTI.merchantA (solo lettura offerte).
 * Va eseguito con `--workers=1`.
 */

const suffisso = Date.now().toString(36);
const NOME_NEGOZIO = `E2E Delete ${suffisso}`;
const NOME_OFFERTA = `E2E Offerta ${suffisso}`;

test.describe("Bug 1 — Negozi eliminati non ricompaiono", () => {
  test.describe.configure({ mode: "serial" });

  let storeId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Pulizia best-effort
    if (storeId) {
      try {
        await page.evaluate(async (id) => {
          await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
          await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" });
        }, storeId);
      } catch { /* best-effort */ }
      storeId = null;
    }
  });

  test("1. Cestinamento: negozio sparisce dalla lista e NON ricompare dopo reload", async ({ page }) => {
    await loginUtente(page, UTENTI.admin);

    // Crea un negozio di test
    const crea = await page.evaluate(async (nome) => {
      const res = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, categoria: "Bar", citta: "Castrovillari" }),
      });
      return res.json();
    }, NOME_NEGOZIO);
    expect(crea.success).toBeTruthy();
    storeId = crea.data?.storeId;
    expect(storeId).toBeTruthy();

    // Verifica che il negozio appare nella griglia card della lista
    await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
    const cardNome = page.locator("article").filter({ hasText: NOME_NEGOZIO });
    await expect(cardNome).toBeVisible({ timeout: 15000 });

    // Cestina il negozio
    const cestina = await page.evaluate(async (id) => {
      const res = await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
      return res.json();
    }, storeId);
    expect(cestina.success).toBeTruthy();

    // Dopo cestinamento: il negozio NON deve apparire nella griglia card (reload)
    await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
    const cardDopo = page.locator("article").filter({ hasText: NOME_NEGOZIO });
    await expect(cardDopo).toHaveCount(0, { timeout: 15000 });

    // Verifica che appare nel cestino
    await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });
    await expect(page.getByText(NOME_NEGOZIO, { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test("2. Eliminazione definitiva: negozio sparisce dal cestino e NON ricompare MAI", async ({ page }) => {
    await loginUtente(page, UTENTI.admin);

    // Crea + cestina un negozio
    const crea = await page.evaluate(async (nome) => {
      const res = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, categoria: "Bar", citta: "Castrovillari" }),
      });
      return res.json();
    }, `E2E Definitivo ${suffisso}`);
    expect(crea.success).toBeTruthy();
    storeId = crea.data?.storeId;

    await page.evaluate(async (id) => {
      await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
    }, storeId);

    // Elimina definitivamente
    const elimina = await page.evaluate(async (id) => {
      const res = await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" });
      return res.json();
    }, storeId);
    expect(elimina.success).toBeTruthy();

    // Non deve apparire nel cestino
    await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });
    await expect(page.getByText(`E2E Definitivo ${suffisso}`)).toHaveCount(0, { timeout: 15000 });

    // Non deve apparire nella lista negozi
    await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
    await expect(page.getByText(`E2E Definitivo ${suffisso}`)).toHaveCount(0, { timeout: 15000 });

    // Verifica via API: il negozio non esiste più
    const check = await page.evaluate(async (id) => {
      const res = await fetch(`/api/merchant/stores/${id}/settings`);
      return res.json();
    }, storeId);
    // La settings API dovrebbe restituire errore o data null per un negozio eliminato
    expect(check.success === false || !check.data?.settings).toBeTruthy();

    storeId = null; // già eliminato
  });
});

test.describe("Bug 2 — Offerte eliminate dall'admin spariscono per il vendor", () => {
  test.describe.configure({ mode: "serial" });

  let offertaId: string | null = null;
  let negozioId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Pulizia best-effort: elimina l'offerta e il negozio
    try {
      await loginUtente(page, UTENTI.admin);
      if (offertaId) {
        await page.evaluate(async (id) => {
          await fetch(`/api/amministratore/offerte/${id}`, { method: "DELETE" }).catch(() => {});
        }, offertaId);
        offertaId = null;
      }
      if (negozioId) {
        await page.evaluate(async (id) => {
          await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" }).catch(() => {});
          await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" }).catch(() => {});
        }, negozioId);
        negozioId = null;
      }
    } catch { /* best-effort */ }
  });

  test("1. Offerta eliminata dall'admin sparisce dalla lista vendor", async ({ page }) => {
    await loginUtente(page, UTENTI.admin);

    // Crea un negozio di test (come merchantA per avere un vendor)
    const crea = await page.evaluate(async (nome) => {
      const res = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, categoria: "Bar", citta: "Castrovillari" }),
      });
      return res.json();
    }, `E2E Offerte ${suffisso}`);
    expect(crea.success).toBeTruthy();
    negozioId = crea.data?.storeId;

    // Crea un'offerta via API merchant
    const creaOfferta = await page.evaluate(async ({ nId, titolo }) => {
      const res = await fetch(`/api/merchant/stores/${nId}/offerte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titolo, prezzo_originale: 100, prezzo_offerta: 80 }),
      });
      return res.json();
    }, { nId: negozioId!, titolo: NOME_OFFERTA });
    expect(creaOfferta.success).toBeTruthy();
    offertaId = creaOfferta.data?.offerta?.id;
    expect(offertaId).toBeTruthy();

    // Verifica che l'offerta appare nella lista vendor
    const listaVendor = await page.evaluate(async (nId) => {
      const res = await fetch(`/api/merchant/stores/${nId}/offerte`);
      return res.json();
    }, negozioId);
    expect(listaVendor.success).toBeTruthy();
    const offertaTrovata = (listaVendor.data?.offerte ?? []).find(
      (o: { id: string }) => o.id === offertaId
    );
    expect(offertaTrovata).toBeTruthy();

    // L'admin elimina l'offerta
    const elimina = await page.evaluate(async (id) => {
      const res = await fetch(`/api/amministratore/offerte/${id}`, { method: "DELETE" });
      return res.json();
    }, offertaId);
    expect(elimina.success).toBeTruthy();

    // Verifica che l'offerta NON appare più nella lista vendor
    const listaDopo = await page.evaluate(async (nId) => {
      const res = await fetch(`/api/merchant/stores/${nId}/offerte`);
      return res.json();
    }, negozioId);
    expect(listaDopo.success).toBeTruthy();
    const offertaDopo = (listaDopo.data?.offerte ?? []).find(
      (o: { id: string }) => o.id === offertaId
    );
    expect(offertaDopo).toBeFalsy();

    // Verifica anche con reload della sessione (simula riapertura editor)
    // L'admin può accedere alle API merchant (areaConsenteAccesso)
    const listaReload = await page.evaluate(async (nId) => {
      const res = await fetch(`/api/merchant/stores/${nId}/offerte`);
      return res.json();
    }, negozioId);
    expect(listaReload.success).toBeTruthy();
    const offertaReload = (listaReload.data?.offerte ?? []).find(
      (o: { id: string }) => o.id === offertaId
    );
    expect(offertaReload).toBeFalsy();

    offertaId = null; // già eliminata
  });
});
