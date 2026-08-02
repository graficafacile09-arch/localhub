import { test, expect, Page } from "@playwright/test";

// URL pubbliche con SLUG (architettura URL ufficiale LocalHub).
// I dati demo sono seedati da supabase/migrations/20260802_seed_demo_completo.sql
// (negozio demo-beauty-1 → prodotto trattamento-glow-viso "Trattamento Glow Viso").
const PRODOTTO_SLUG = "trattamento-glow-viso";
const NEGOZIO_SLUG = "demo-beauty-1";

test.describe("Acquista Flow E2E", () => {
  let page: Page;
  let jsErrors: string[] = [];
  let apiErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    page.on("pageerror", (error) => {
      jsErrors.push(`JavaScript Error: ${error.message}\n${error.stack}`);
    });

    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400) {
        const url = response.url();
        if (!url.includes("favicon") && !url.includes("logo.png")) {
          apiErrors.push(`API Error: ${status} - ${url}`);
        }
      }
    });

    page.on("requestfailed", (request) => {
      const url = request.url();
      if (!url.includes("favicon") && !url.includes("logo.png")) {
        apiErrors.push(`Request Failed: ${request.method()} ${url} - ${request.failure()?.errorText}`);
      }
    });
  });

  test.afterEach(async () => {
    jsErrors = [];
    apiErrors = [];
  });

  test("Step 1-2: Open product page and verify content", async () => {
    const response = await page.goto(`/prodotto/${PRODOTTO_SLUG}`, { timeout: 30000 });
    await page.screenshot({ path: "screenshots/01-product-page.png", fullPage: true });

    expect(response?.status()).toBe(200);

    const title = await page.textContent("h1");
    expect(title).toContain("Trattamento Glow Viso");

    // Verify NO opening hours on product page
    const orariText = await page.locator("text=Orari").count();
    expect(orariText).toBe(0);
    console.log("✓ No opening hours on product page.");

    // Verify ACQUISTA button is visible
    const acquistaButton = page.locator("text=ACQUISTA").or(page.locator("text=Acquista").first());
    await expect(acquistaButton.first()).toBeVisible();
    console.log("✓ ACQUISTA button is visible.");

    // Verify button is clickable
    await expect(acquistaButton.first()).toBeEnabled();
    console.log("✓ ACQUISTA button is clickable.");

    // Verify click navigates to /prodotto/<slug>/acquista
    await acquistaButton.first().click();
    await page.waitForURL(new RegExp(`/prodotto/${PRODOTTO_SLUG}/acquista`), { timeout: 15000 });
    expect(page.url()).toContain("/acquista");
    console.log("✓ Click navigates to /prodotto/<slug>/acquista.");

    expect(jsErrors.length).toBe(0);
  });

  test("Step 3-4: Navigate to acquista choice page", async () => {
    const response = await page.goto(`/prodotto/${PRODOTTO_SLUG}/acquista`, { timeout: 30000 });
    await page.screenshot({ path: "screenshots/02-acquista-choice.png", fullPage: true });

    expect(response?.status()).toBe(200);

    const heading = await page.textContent("h1");
    expect(heading).toContain("Completa l'acquisto");

    const ritiroCard = page.locator("text=Ritiro in negozio");
    const spedizioneCard = page.locator("text=Spedizione a domicilio");

    expect(await ritiroCard.isVisible()).toBeTruthy();
    expect(await spedizioneCard.isVisible()).toBeTruthy();

    expect(jsErrors.length).toBe(0);
  });

  test("Step 5-6: Click Ritiro and verify page", async () => {
    await page.goto(`/prodotto/${PRODOTTO_SLUG}/acquista`, { timeout: 30000 });

    await page.click("text=Ritiro in negozio");
    await page.waitForURL(/\/acquista\/ritiro/, { timeout: 15000 });
    await page.screenshot({ path: "screenshots/03-ritiro-page.png", fullPage: true });

    expect(page.url()).toContain("/acquista/ritiro");

    const confermaButton = page.locator("text=Conferma ritiro");
    expect(await confermaButton.isVisible()).toBeTruthy();

    expect(jsErrors.length).toBe(0);
  });

  test("Step 7-9: Click Spedizione and verify page", async () => {
    await page.goto(`/prodotto/${PRODOTTO_SLUG}/acquista`, { timeout: 30000 });

    await page.click("text=Spedizione a domicilio");
    await page.waitForURL(/\/acquista\/spedizione/, { timeout: 15000 });
    await page.screenshot({ path: "screenshots/04-spedizione-page.png", fullPage: true });

    expect(page.url()).toContain("/acquista/spedizione");

    const submitButton = page.locator("text=Procedi al pagamento");
    expect(await submitButton.isVisible()).toBeTruthy();

    const indirizzoSection = page.locator("text=Indirizzo di spedizione");
    expect(await indirizzoSection.isVisible()).toBeTruthy();

    expect(jsErrors.length).toBe(0);
  });

  test("Step 10-13: Verify no errors on all acquista pages", async () => {
    const routes = [
      `/prodotto/${PRODOTTO_SLUG}/acquista`,
      `/prodotto/${PRODOTTO_SLUG}/acquista/ritiro`,
      `/prodotto/${PRODOTTO_SLUG}/acquista/spedizione`,
    ];

    for (const route of routes) {
      jsErrors = [];
      apiErrors = [];

      const response = await page.goto(route, { timeout: 30000 });
      await page.screenshot({ path: `screenshots/route-${route.replace(/\//g, "-")}.png`, fullPage: true });

      expect(response?.status()).toBe(200);

      expect(jsErrors.length).toBe(0);
    }
  });

  test("Verify orari appear on negozio page but NOT on product page", async () => {
    // Go to negozio page - opening hours SHOULD be visible
    await page.goto(`/negozio/${NEGOZIO_SLUG}`, { timeout: 30000 });
    const negozioOrari = await page.locator("text=Orari").count();
    expect(negozioOrari).toBeGreaterThan(0);
    console.log("✓ Opening hours ARE visible on negozio page.");

    // Go to product page - opening hours should NOT be visible
    await page.goto(`/prodotto/${PRODOTTO_SLUG}`, { timeout: 30000 });
    const prodottoOrari = await page.locator("text=Orari").count();
    expect(prodottoOrari).toBe(0);
    console.log("✓ No opening hours on product page.");
  });

  test("Verify no orari on acquista pages", async () => {
    const routes = [
      `/prodotto/${PRODOTTO_SLUG}/acquista`,
      `/prodotto/${PRODOTTO_SLUG}/acquista/ritiro`,
      `/prodotto/${PRODOTTO_SLUG}/acquista/spedizione`,
    ];

    for (const route of routes) {
      await page.goto(route, { timeout: 30000 });

      const orariText = await page.locator('text="Orari"').count();
      expect(orariText).toBe(0);
    }
  });
});
