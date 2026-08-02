import { test, expect } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// Fixture merchant dedicata a QUESTA suite (merchantC): nessun altro test
// concorrente la usa, quindi i flussi di delete/restore non confliggono.
async function login(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.merchantC, { waitFor: /\/merchant/ });
  await expect(page).toHaveURL(/\/merchant/);
}

test.describe.configure({ mode: "serial" });

test.describe("CESTINO — soft delete, trash e restore", () => {
  test("create → elimina (soft) → trash → restore", async ({ page }) => {
    test.setTimeout(180_000);

    /* ── 1. Login ─────────────────────────────────────────────────── */
    await login(page);

    /* ── 2. Crea negozio via API ──────────────────────────────────── */
    const nome = `E2E Cestino ${Date.now()}`;
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

    /* ── 3. DELETE → soft delete (deleted_at) ─────────────────────── */
    const del = await page.evaluate(async (id) => {
      const r = await fetch(`/api/merchant/stores/${id}`, { method: "DELETE" });
      return { status: r.status, json: await r.json() };
    }, storeId);
    expect(del.status, "DELETE should be 200").toBe(200);
    expect(del.json.data.deleted).toBe(true);

    /* ── 4. GET /api/merchant/trash → deve contenere il negozio ──── */
    const trashJson = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/trash");
      return r.json();
    });
    expect(trashJson.success).toBe(true);
    const trashIds = (trashJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(trashIds, "trash must contain the deleted store").toContain(storeId);

    /* ── 5. Lista negozi merchant → NON deve contenere il negozio ── */
    const listJson = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/stores");
      return r.json();
    });
    const listIds = (listJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(listIds, "merchant store list must exclude the deleted store").not.toContain(storeId);

    /* ── 6. POST restore → deleted_at = null ──────────────────────── */
    const restore = await page.evaluate(async (id) => {
      const r = await fetch(`/api/merchant/stores/${id}/restore`, { method: "POST" });
      return { status: r.status, json: await r.json() };
    }, storeId);
    expect(restore.status, "restore should be 200").toBe(200);
    expect(restore.json.data.restored).toBe(true);
    expect(restore.json.data.storeId).toBe(storeId);

    /* ── 7. Lista negozi merchant → di nuovo presente ─────────────── */
    const listJson2 = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/stores");
      return r.json();
    });
    const listIds2 = (listJson2.data.stores as { id: string }[]).map((s) => s.id);
    expect(listIds2, "restored store must be back in the merchant list").toContain(storeId);

    /* ── 8. Il negozio ripristinato NON è nel cestino ─────────────── */
    const trashJson2 = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/trash");
      return r.json();
    });
    const trashIds2 = (trashJson2.data.stores as { id: string }[]).map((s) => s.id);
    expect(trashIds2, "restored store must no longer be in trash").not.toContain(storeId);

    /* ── 9. Cleanup: rimetti nel cestino ──────────────────────────── */
    await page.evaluate(async (id) => {
      await fetch(`/api/merchant/stores/${id}`, { method: "DELETE" });
    }, storeId);
  });

  test("UI: pagina /merchant/trash — lista, dati, ripristina, cestino vuoto", async ({ page }) => {
    test.setTimeout(240_000);

    /* ── 1. Login ─────────────────────────────────────────────────── */
    await login(page);

    /* ── 2. Svuota il cestino (restore di tutti i residui E2E) ────── */
    await page.evaluate(async () => {
      const r = await fetch("/api/merchant/trash");
      const json = await r.json();
      const stores = (json.data?.stores ?? []) as { id: string }[];
      for (const s of stores) {
        await fetch(`/api/merchant/stores/${s.id}/restore`, { method: "POST" });
      }
    });

    /* ── 3. Crea e soft-delete un negozio via API ─────────────────── */
    const nome = `E2E Trash UI ${Date.now()}`;
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

    /* ── 4. Naviga a /merchant/trash ──────────────────────────────── */
    await page.goto(`${BASE}/merchant/trash`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/merchant\/trash/);
    await expect(page.locator("body")).toContainText("Cestino");

    /* ── 4b. Desktop: sidebar contiene "Cestino" ed è evidenziata ─── */
    const sidebarCestino = page.locator("aside").getByRole("link", { name: "Cestino", exact: true });
    await expect(sidebarCestino, "sidebar must contain Cestino link").toBeVisible();
    await expect(sidebarCestino, "sidebar Cestino must be highlighted on /merchant/trash").toHaveClass(/bg-blue-50/);

    /* ── 5. Il negozio è in lista con nome, categoria, data ───────── */
    // La card del negozio è il div che contiene sia il nome sia il pulsante Ripristina
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

    /* ── 6. Click Ripristina → sparisce dalla lista ───────────────── */
    await restoreButton.click();
    await expect(page.locator("body")).not.toContainText(nome, { timeout: 10000 });

    /* ── 7. API: negozio di nuovo nella lista merchant ────────────── */
    const listJson = await page.evaluate(async () => {
      const r = await fetch("/api/merchant/stores");
      return r.json();
    });
    const listIds = (listJson.data.stores as { id: string }[]).map((s) => s.id);
    expect(listIds, "restored store must be back in merchant list").toContain(storeId);

    /* ── 8. Cestino di nuovo vuoto → messaggio vuoto ──────────────── */
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText("Il cestino è vuoto", { timeout: 10000 });

    /* ── 9. Cleanup: rimetti nel cestino ──────────────────────────── */
    await page.evaluate(async (id) => {
      await fetch(`/api/merchant/stores/${id}`, { method: "DELETE" });
    }, storeId);
  });

  test("UI mobile: bottom nav contiene Cestino e la pagina si apre", async ({ page }) => {
    test.setTimeout(240_000);

    /* ── 1. Viewport mobile + Login ───────────────────────────────── */
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);

    /* ── 2. Naviga a /merchant/trash ──────────────────────────────── */
    await page.goto(`${BASE}/merchant/trash`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/merchant\/trash/);

    /* ── 3. Bottom nav mobile contiene "Cestino" ──────────────────── */
    const bottomNav = page.locator('nav[aria-label="Navigazione area commercianti mobile"]');
    await expect(bottomNav, "mobile bottom nav must exist").toBeVisible();
    const mobileCestino = bottomNav.getByRole("link", { name: "Cestino", exact: true });
    await expect(mobileCestino, "bottom nav must contain Cestino").toBeVisible();
    await expect(mobileCestino, "Cestino must be highlighted on /merchant/trash").toHaveAttribute("aria-current", "page");

    /* ── 4. Click Cestino → la pagina si apre ─────────────────────── */
    // force: il pulsante flottante "Apri l'Assistente AI" (fixed bottom-right)
    // intercetta i click sul centro del link; il Link Next.js naviga comunque.
    await mobileCestino.click({ force: true });
    await expect(page).toHaveURL(/\/merchant\/trash/);
    await expect(page.locator("h1")).toContainText("Cestino");
  });
});
