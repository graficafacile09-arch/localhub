import { test, expect } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// Fixture merchant dedicata a QUESTA suite (merchantC): nessun altro test
// concorrente la usa, quindi i flussi delete/restore non confliggono.
// L'account admin è condiviso SOLO tra test che non eseguono mai signOut.
async function loginMerchant(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.merchantC);
  await expect(page).toHaveURL(`${BASE}/`);
}

async function loginAdmin(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.admin);
}

test.describe.configure({ mode: "serial" });

test.describe("CESTINO DI PIATTAFORMA — solo amministratore", () => {
  test("merchant elimina il proprio negozio; il ripristino è solo admin", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    /* ── 1. Login merchant ─────────────────────────────────────────── */
    await loginMerchant(page);

    /* ── 2. Crea negozio via API (nome NON-demo: i negozi "E2E …" sono
            filtrati dalle viste admin) ──────────────────────────────── */
    const nome = `QA Cestino ${Date.now()}`;
    const createJson = await page.evaluate(async (n) => {
      const r = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: n, categoria: "Bar", citta: "Castrovillari" }),
      });
      return r.json();
    }, nome);
    const storeId: string = createJson.data?.storeId;
    expect(storeId, "create must return storeId").toBeTruthy();

    /* ── 3. DELETE → soft delete (deleted_at) ──────────────────────── */
    const del = await page.evaluate(async (id) => {
      const r = await fetch(`/api/merchant/stores/${id}`, { method: "DELETE" });
      return { status: r.status, json: await r.json() };
    }, storeId);
    expect(del.status, "DELETE should be 200").toBe(200);
    expect(del.json.data.deleted).toBe(true);

    /* ── 4. Il merchant NON ha più né cestino né restore (funzione admin) */
    const trashGone = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/trash");
      return r.status;
    });
    expect(trashGone, "merchant trash API must be gone (404)").toBe(404);

    const restoreGone = await page.evaluate(async (id) => {
      const r = await fetch(`/api/merchant/stores/${id}/restore`, { method: "POST" });
      return r.status;
    }, storeId);
    expect(restoreGone, "merchant restore API must be gone (404)").toBe(404);

    /* ── 5. Lista negozi merchant → NON contiene il negozio ───────── */
    const listJson = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/stores");
      return r.json();
    });
    const listIds = (listJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(listIds, "merchant store list must exclude the deleted store").not.toContain(storeId);

    /* ── 6. L'ADMIN vede il negozio nel Cestino globale ───────────── */
    await loginAdmin(page);
    const trashJson = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/cestino");
      return { status: r.status, json: await r.json() };
    });
    expect(trashJson.status, "admin trash API should be 200").toBe(200);
    const trashIds = (trashJson.json.data.stores as { id: string }[]).map((s) => s.id);
    expect(trashIds, "admin trash must contain the deleted store").toContain(storeId);

    /* ── 7. L'admin ripristina via API ─────────────────────────────── */
    const restore = await page.evaluate(async (id) => {
      const r = await fetch(`/api/amministratore/negozi/${id}/ripristina`, { method: "POST" });
      return { status: r.status, json: await r.json() };
    }, storeId);
    expect(restore.status, "admin restore should be 200").toBe(200);
    expect(restore.json.data.restored).toBe(true);

    /* ── 8. Il negozio non è più nel Cestino admin ─────────────────── */
    const trashJson2 = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/cestino");
      return r.json();
    });
    const trashIds2 = (trashJson2.data.stores as { id: string }[]).map((s) => s.id);
    expect(trashIds2, "restored store must no longer be in admin trash").not.toContain(storeId);

    /* ── 9. Il merchant ritrova il negozio nella sua lista ─────────── */
    await loginMerchant(page);
    const listJson2 = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/stores");
      return r.json();
    });
    const listIds2 = (listJson2.data.stores as { id: string }[]).map((s) => s.id);
    expect(listIds2, "restored store must be back in the merchant list").toContain(storeId);

    /* ── 10. Cleanup: rimetti il negozio nel cestino (admin) ──────── */
    await loginAdmin(page);
    await page.evaluate(async (id) => {
      await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
    }, storeId);
  });

  test("UI: pagina /amministratore/cestino — lista, dati e ripristino", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    /* ── 1. Merchant: crea e soft-delete un negozio via API (nome
            NON-demo, altrimenti verrebbe filtrato dalle viste admin) ─ */
    await loginMerchant(page);
    const nome = `QA Trash UI ${Date.now()}`;
    const createJson = await page.evaluate(async (n) => {
      const r = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: n, categoria: "Beauty", citta: "Castrovillari" }),
      });
      return r.json();
    }, nome);
    const storeId: string = createJson.data?.storeId;
    expect(storeId, "create must return storeId").toBeTruthy();
    await page.evaluate(async (id) => {
      await fetch(`/api/merchant/stores/${id}`, { method: "DELETE" });
    }, storeId);

    /* ── 2. Admin: naviga a /amministratore/cestino ───────────────── */
    await loginAdmin(page);
    await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/amministratore\/cestino/);
    await expect(page.getByRole("heading", { level: 1, name: "Cestino" })).toBeVisible();

    // Sidebar: la voce Cestino è presente ed evidenziata.
    const sidebarCestino = page
      .locator("aside")
      .getByRole("link", { name: "Cestino", exact: true });
    await expect(sidebarCestino, "admin sidebar must contain Cestino").toBeVisible();
    await expect(sidebarCestino, "sidebar Cestino must be highlighted").toHaveClass(/bg-blue-50/);

    /* ── 3. Il negozio è in lista con nome, categoria e data ──────── */
    const row = page
      .locator("div")
      .filter({ hasText: nome })
      .filter({ has: page.getByRole("button", { name: "Ripristina" }) })
      .last();
    await expect(row).toContainText(nome, { timeout: 10000 });
    await expect(row).toContainText("Beauty");
    await expect(row).toContainText("Eliminato il");
    const restoreButton = row.getByRole("button", { name: "Ripristina" });
    await expect(restoreButton).toBeVisible();

    /* ── 4. Click Ripristina → sparisce dalla lista ───────────────── */
    await restoreButton.click();
    await expect(page.locator("body")).not.toContainText(nome, { timeout: 10000 });

    /* ── 5. API: negozio di nuovo attivo ───────────────────────────── */
    const trashJson = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/cestino");
      return r.json();
    });
    const trashIds = (trashJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(trashIds, "restored store must no longer be in admin trash").not.toContain(storeId);

    /* ── 6. Cleanup: rimetti il negozio nel cestino ───────────────── */
    await page.evaluate(async (id) => {
      await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
    }, storeId);
  });

  test("UI: 'Elimina tutto' — conferma obbligatoria e svuotamento del Cestino", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    /* ── 1. Merchant: crea 1 negozio ATTIVO + 2 da cestinare ──────── */
    await loginMerchant(page);
    const nomeAttivo = `QA Bulk Attivo ${Date.now()}`;
    const nomeA = `QA Bulk Cestino A ${Date.now()}`;
    const nomeB = `QA Bulk Cestino B ${Date.now()}`;

    const crea = async (nome: string) => {
      const json = await page.evaluate(async (n) => {
        const r = await fetch("/api/merchant/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: n, categoria: "Bar", citta: "Castrovillari" }),
        });
        return r.json();
      }, nome);
      const id: string = json.data?.storeId;
      expect(id, "create must return storeId").toBeTruthy();
      return id;
    };

    const storeAttivoId = await crea(nomeAttivo);
    const storeAId = await crea(nomeA);
    const storeBId = await crea(nomeB);

    // Soft-delete dei due negozi da cestinare (il terzo resta ATTIVO).
    for (const id of [storeAId, storeBId]) {
      const del = await page.evaluate(async (sid) => {
        const r = await fetch(`/api/merchant/stores/${sid}`, { method: "DELETE" });
        return { status: r.status };
      }, id);
      expect(del.status, "merchant DELETE should be 200").toBe(200);
    }

    /* ── 2. Admin: pulsante "Elimina tutto" visibile (cestino pieno) ── */
    await loginAdmin(page);
    await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/amministratore\/cestino/);
    await expect(page.getByRole("heading", { level: 1, name: "Cestino" })).toBeVisible();

    const eliminaTutto = page.getByRole("button", { name: "Elimina tutto" });
    await expect(eliminaTutto, "button must be visible with trash non-empty").toBeVisible();
    await expect(page.locator("body")).toContainText(nomeA);
    await expect(page.locator("body")).toContainText(nomeB);

    /* ── 3. Conferma OBBLIGATORIA: senza conferma non si elimina ───── */
    await eliminaTutto.click();
    await expect(page.getByText(/Questa operazione è irreversibile/)).toBeVisible();
    // La lista è ancora presente: nessuna eliminazione è avvenuta.
    await expect(page.locator("body")).toContainText(nomeA);

    // Annulla: torna al pulsante, lista intatta.
    await page.getByRole("button", { name: "Annulla" }).click();
    await expect(eliminaTutto).toBeVisible();
    await expect(page.locator("body")).toContainText(nomeA);

    /* ── 4. Conferma → eliminazione bulk + lista svuotata ──────────── */
    await eliminaTutto.click();
    await expect(page.getByText(/Questa operazione è irreversibile/)).toBeVisible();
    await page.getByRole("button", { name: "Elimina tutto" }).click();

    // Dopo il successo la lista sparisce immediatamente e il pulsante pure.
    await expect(page.getByText("Il cestino è vuoto")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Elimina tutto" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(nomeA);
    await expect(page.locator("body")).not.toContainText(nomeB);

    /* ── 5. API: i due negozi NON sono più nel Cestino ─────────────── */
    const trashJson = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/cestino");
      return r.json();
    });
    const trashIds = (trashJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(trashIds, "bulk-deleted stores must be gone from trash").not.toContain(storeAId);
    expect(trashIds, "bulk-deleted stores must be gone from trash").not.toContain(storeBId);

    /* ── 6. Il negozio ATTIVO è sopravvissuto all'eliminazione bulk ── */
    await loginMerchant(page);
    const listJson = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/stores");
      return r.json();
    });
    const listIds = (listJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(listIds, "active store must survive bulk delete").toContain(storeAttivoId);
  });

  test("API: DELETE /api/amministratore/cestino non tocca mai negozi attivi", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    /* ── 1. Merchant: crea un negozio ATTIVO (mai cestinato) ──────── */
    await loginMerchant(page);
    const nome = `QA Bulk Api ${Date.now()}`;
    const createJson = await page.evaluate(async (n) => {
      const r = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: n, categoria: "Bar", citta: "Castrovillari" }),
      });
      return r.json();
    }, nome);
    const storeId: string = createJson.data?.storeId;
    expect(storeId, "create must return storeId").toBeTruthy();

    /* ── 2. Admin: bulk delete → il negozio attivo NON è tra i colpiti ── */
    await loginAdmin(page);
    const bulk = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/cestino", { method: "DELETE" });
      return { status: r.status, json: await r.json() };
    });
    expect(bulk.status, "admin bulk DELETE should be 200").toBe(200);
    expect(
      bulk.json.data.storeIds as string[],
      "active store must never be in the bulk deletion"
    ).not.toContain(storeId);

    /* ── 3. Il negozio è ancora attivo e NON è finito nel Cestino ─── */
    await loginMerchant(page);
    const listJson = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/stores");
      return r.json();
    });
    const listIds = (listJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(listIds, "active store must survive bulk delete").toContain(storeId);

    await loginAdmin(page);
    const trashJson = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/cestino");
      return r.json();
    });
    const trashIds = (trashJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(trashIds, "active store must not be in trash").not.toContain(storeId);
  });

  test("un commerciante NON può leggere né ripristinare dal Cestino admin", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await loginMerchant(page);

    /* API admin: 403 per un merchant puro. */
    const adminTrash = await page.evaluate(async () => {
      const r = await fetch("/api/amministratore/cestino");
      return { status: r.status };
    });
    expect(adminTrash.status, "merchant reading admin trash must be 403").toBe(403);

    /* La pagina /amministratore è protetta: il merchant vede l'avviso
       "Area non autorizzata" (sessione intatta, nessun logout) e nessun
       contenuto admin. */
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Area non autorizzata" })
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Pannello Amministratore");
  });
});
