import { test, expect } from "@playwright/test";

const BASE = process.env.SHARE_BASE_URL || "http://localhost:3100";

/**
 * Verifica REALE nel browser del pulsante "Condividi" nella card negozio.
 * Non si basa su build/READY: apre la pagina, clicca davvero il pulsante e
 * controlla il comportamento del menu e della card.
 */
test.describe("CONDIVIDI card negozio", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: BASE,
    });
  });

  test("il pulsante apre il menu fuori dalla card, Copia link funziona e la card continua a navigare", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    // La card negozio deve esistere (identificata per href, non per nome).
    const card = page.locator('a[href^="/negozio/"]').first();
    await expect(card).toBeVisible();

    const hrefCard = await card.getAttribute("href");
    expect(hrefCard).toMatch(/^\/negozio\/.+/);

    // Il pulsante Condividi è un FRATELLO del <Link> (non annidato).
    const shareBtn = page.locator('button[aria-label^="Condividi "]').first();
    await expect(shareBtn).toBeVisible();

    await expect(page.getByRole("menu")).toHaveCount(0);

    // Click reale sul pulsante.
    await shareBtn.click();

    // 1) Il menu compare.
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // 2) Il menu è un portal fixed: esce dalla card senza essere tagliato.
    const posizione = await menu.evaluate((el) => getComputedStyle(el).position);
    expect(posizione, "il menu deve essere posizionato fixed (portal)").toBe("fixed");

    // 3) Cliccare Condividi NON deve aprire il negozio.
    await expect(page).toHaveURL(`${BASE}/`);

    // 4) "Copia link" esiste ed è cliccabile.
    const copia = page.getByRole("menuitem", { name: /Copia link|Link copiato/ });
    await expect(copia).toBeVisible();
    await copia.click();

    // 5) Feedback di copia avvenuto.
    await expect(page.getByRole("menuitem", { name: "Link copiato" })).toBeVisible();

    // 6) Il link copiato è la scheda negozio (non la homepage).
    const negliAppunti = await page.evaluate(() => navigator.clipboard.readText());
    expect(negliAppunti).toContain(hrefCard!);

    // 7) ESC chiude il menu.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // 8) Cliccare il resto della card apre ancora il negozio.
    await card.click();
    await expect(page).toHaveURL(new RegExp(hrefCard!.replace("/", "\\/")), {
      timeout: 10000,
    });
    await expect(page.locator("h1")).toBeVisible();
  });
});
