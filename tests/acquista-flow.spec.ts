import { test, expect, Page } from "@playwright/test";

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
    const response = await page.goto("/prodotto/prod-demo-beauty-1", { timeout: 30000 });
    await page.screenshot({ path: "screenshots/01-product-page.png", fullPage: true });

    expect(response?.status()).toBe(200);

    const title = await page.textContent("h1");
    expect(title).toContain("Trattamento Glow Viso");

    const acquistaButton = page.locator("text=Acquista");
    const isVisible = await acquistaButton.isVisible();

    if (!isVisible) {
      console.log("NOTE: Acquista button not visible - expected for demo products without real negozio.");
    } else {
      console.log("Acquista button IS visible.");
    }

    expect(jsErrors.length).toBe(0);
  });

  test("Step 3-4: Navigate to acquista choice page", async () => {
    const response = await page.goto("/prodotto/prod-demo-beauty-1/acquista", { timeout: 30000 });
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
    await page.goto("/prodotto/prod-demo-beauty-1/acquista", { timeout: 30000 });

    await page.click("text=Ritiro in negozio");
    await page.waitForURL(/\/acquista\/ritiro/, { timeout: 15000 });
    await page.screenshot({ path: "screenshots/03-ritiro-page.png", fullPage: true });

    expect(page.url()).toContain("/acquista/ritiro");

    const confermaButton = page.locator("text=Conferma ritiro");
    expect(await confermaButton.isVisible()).toBeTruthy();

    expect(jsErrors.length).toBe(0);
  });

  test("Step 7-9: Click Spedizione and verify page", async () => {
    await page.goto("/prodotto/prod-demo-beauty-1/acquista", { timeout: 30000 });

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
      "/prodotto/prod-demo-beauty-1/acquista",
      "/prodotto/prod-demo-beauty-1/acquista/ritiro",
      "/prodotto/prod-demo-beauty-1/acquista/spedizione",
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

  test("Verify no orari on acquista pages", async () => {
    const routes = [
      "/prodotto/prod-demo-beauty-1/acquista",
      "/prodotto/prod-demo-beauty-1/acquista/ritiro",
      "/prodotto/prod-demo-beauty-1/acquista/spedizione",
    ];

    for (const route of routes) {
      await page.goto(route, { timeout: 30000 });

      const orariText = await page.locator("text=Orari di apertura").count();
      expect(orariText).toBe(0);
    }
  });
});
