import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3100";

test.describe("CATEGORIE HOMEPAGE — dinamiche dal catalogo", () => {
  test("la homepage genera le tile dal catalogo (niente più ?q= hardcoded)", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    await expect(page.locator("body")).toContainText("Categorie");

    // Tile dinamiche: link a /ricerca?categoria=<slug>
    const tiles = page.locator('a[href^="/ricerca?categoria="]');
    const count = await tiles.count();
    expect(count, "le tile dinamiche devono essere renderizzate").toBeGreaterThanOrEqual(5);

    // Le vecchie tile hardcoded ?q=... non devono esistere
    const oldTiles = page.locator(
      'a[href="/ricerca?q=Negozi"], a[href="/ricerca?q=Food"], a[href="/ricerca?q=Moda"], a[href="/ricerca?q=Servizi"]'
    );
    await expect(oldTiles).toHaveCount(0);
  });

  test("click su una categoria → /ricerca?categoria=<slug> → negozi filtrati", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    // "Tech & Elettronica" è nel catalogo e ha negozi (storici "elettronica"/"Elettronica")
    const tile = page
      .locator('a[href^="/ricerca?categoria="]')
      .filter({ hasText: "Tech & Elettronica" });
    await expect(tile, "tile Tech & Elettronica deve esistere").toBeVisible();
    await tile.click();

    await expect(page).toHaveURL(/\/ricerca\?categoria=tech-elettronica/);

    // Conteggio per categoria + sezione Negozi con almeno una card
    await expect(page.locator("body")).toContainText("negozi in", { timeout: 10000 });
    await expect(page.locator("h2", { hasText: "Negozi" })).toBeVisible();
    await expect(page.locator('a[href^="/negozio/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("categoria senza negozi → messaggio Nessun negozio trovato", async ({ page }) => {
    await page.goto(`${BASE}/ricerca?categoria=panificio`, { waitUntil: "networkidle" });

    await expect(page.locator("body")).toContainText("Nessun negozio trovato", { timeout: 10000 });
  });
});
