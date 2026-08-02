import { test, expect, Page, Dialog } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// Fixture merchant dedicata a QUESTA suite (nessun altro test concorrente
// usa merchantA, quindi i suoi logout globali non danneggiano altri test).
const MERCHANT = UTENTI.merchantA;
const TS = Date.now();

const log = (msg: string) => console.log(`\n>>> ${msg}`);

/*
  Single, strictly-sequential E2E flow that exercises the full merchant journey
  against the local dev server (port 3100). Keeping it in ONE test guarantees
  shared session state + a shared storeId across every step.
*/

test.describe("Merchant full journey (DB-synced + build-fixed)", () => {
  let page: Page;
  let storeId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.setViewportSize({ width: 1280, height: 800 });
    page.on("pageerror", (err) => console.log("JS ERROR:", err.message));
    page.on("response", (r) => {
      if (r.status() >= 500 && !r.url().includes("favicon")) {
        console.log("5xx:", r.status(), r.url());
      }
    });
    // accept all dialogs (window.confirm on product delete)
    page.on("dialog", (d: Dialog) => d.accept());
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("Full merchant journey: login (recovered account) → wizard → editor → products → logout → re-login", async () => {
    test.setTimeout(900_000);

    /* ── Step 1: Accesso con account di recupero (già registrato via UI) ── */
    await test.step("1. Accesso (account fixture)", async () => {
      log("Step 1: Accesso account fixture");
      await loginUtente(page, MERCHANT, { waitFor: /\/merchant/ });
      await expect(page).toHaveURL(/\/merchant/);
      const m = page.url().match(/\/merchant\/([^/]+)/);
      storeId = m ? m[1] : null;
    });

    /* ── Step 2: Accesso (logout → login again) ───────────────────────────── */
    await test.step("2. Accesso (logout → login again)", async () => {
      log("Step 2: Accesso");
      await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText("Area Commercianti");
      // capture the store id belonging to this merchant (created during signup)
      const m = page.url().match(/\/merchant\/([^/]+)/);
      storeId = m ? m[1] : null;
      // logout via the dedicated form (2 submit buttons exist: header + sidebar)
      await page.locator('form[action="/api/auth/signout"] button[type="submit"]').first().click();
      await page.waitForURL(`${BASE}/login`, { timeout: 15000 });
      await expect(page).toHaveURL(/\/login/);
      await loginUtente(page, MERCHANT, { waitFor: /\/merchant/ });
      await expect(page).toHaveURL(/\/merchant/);
    });

    /* ── Step 3: Apertura area Merchant ───────────────────────────────────── */
    await test.step("3. Apertura area Merchant", async () => {
      log("Step 3: Apertura area Merchant");
      await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText("Area Commercianti");
      // If only one store exists, /merchant auto-redirects to /merchant/{id}
      const m = page.url().match(/\/merchant\/([^/]+)/);
      storeId = m ? m[1] : storeId;
      if (!storeId) {
        // explicit dashboard text + store link click (wait for soft navigation)
        await page.locator(`a[href*="/merchant/"]`).filter({ hasText: "Negozio QA" }).first().click();
        await page.waitForURL(/\/merchant\/[^/]+/, { timeout: 15000 });
        const urlMatch = page.url().match(/\/merchant\/([^/]+)/);
        storeId = urlMatch ? urlMatch[1] : null;
      }
      expect(storeId, "storeId must be captured").toBeTruthy();
    });

    /* ── Step 4: Creazione nuovo negozio da zero ──────────────────────────── */
    await test.step("4. Creazione negozio da zero (wizard)", async () => {
      log("Step 4: Creazione negozio da zero");
      await page.goto(`${BASE}/merchant/nuovo`, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/merchant\/nuovo/);
      await page.getByRole("button", { name: "Da zero" }).click();
      await page.locator('input[placeholder="es. Panificio Rossi"]').fill(`E2E Panificio ${TS}`);
      await page.locator("select").selectOption("Bar");
      await page.locator('input[placeholder="es. Castrovillari"]').fill("Castrovillari");
      await page.locator("button", { hasText: "Crea negozio" }).click();
      const res = await page.waitForResponse(
        (r) => r.url().endsWith("/api/merchant/stores") && r.request().method() === "POST",
        { timeout: 15000 }
      );
      expect(res.status()).toBe(200);
      await page.waitForURL(/\/merchant\/[^/]+\/edit/, { timeout: 20000 });
      const m = page.url().match(/\/merchant\/([^/]+)\/edit/);
      storeId = m ? m[1] : storeId;
      expect(storeId).toBeTruthy();
      log(`step4 storeId=${storeId} url=${page.url()}`);
    });

    /* ── Step 5: Creazione da Template ────────────────────────────────────── */
    await test.step("5. Creazione da Template", async () => {
      log("Step 5: Creazione da Template");
      await page.goto(`${BASE}/merchant/nuovo`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Da Template" }).click();
      await expect(page.locator("body")).toContainText("Scegli un template");
      // pick the first system template (Negozio Base)
      const templateCard = page
        .locator("button")
        .filter({ has: page.locator("text=Negozio Base") })
        .first();
      await templateCard.click();
      await page.locator('input[placeholder="es. Panificio Rossi"]').fill(`E2E Template ${TS}`);
      await page.locator("select").selectOption("Bar");
      await page.locator('input[placeholder="es. Castrovillari"]').fill("Castrovillari");
      await page.locator("button", { hasText: "Crea negozio" }).click();
      await page.waitForResponse((r) => r.url().includes("/api/merchant/templates/") && r.request().method() === "POST", {
        timeout: 15000,
      });
      await page.waitForURL(/\/merchant\/[^/]+\/edit/, { timeout: 20000 });
    });

    /* ── Step 6: Duplicazione negozio ─────────────────────────────────────── */
    await test.step("6. Duplicazione negozio", async () => {
      log("Step 6: Duplicazione negozio");
      await page.goto(`${BASE}/merchant/nuovo`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Duplica negozio" }).click();
      await expect(page.locator("body")).toContainText("Negozio da duplicare");
      // source-store select is the first select; pick the first real option
      const sourceSelect = page.locator("select").first();
      const firstOption = sourceSelect.locator("option").nth(1);
      const val = await firstOption.getAttribute("value");
      if (val) await sourceSelect.selectOption({ value: val });
      await page.locator('input[placeholder="es. Panificio Rossi"]').fill(`E2E Duplicato ${TS}`);
      // the second select is the category
      const catSelects = page.locator("select");
      await catSelects.nth(1).selectOption("Bar");
      await page.locator('input[placeholder="es. Castrovillari"]').fill("Castrovillare");
      await page.locator("button", { hasText: "Crea negozio" }).click();
      await page.waitForResponse(
        (r) => r.url().includes("/duplicate") && r.request().method() === "POST",
        { timeout: 15000 }
      );
      await page.waitForURL(/\/merchant\/[^/]+\/edit/, { timeout: 20000 });
    });

    /* ── Step 7: Apertura Editor ──────────────────────────────────────────── */
    await test.step("7. Apertura Editor", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 7: Apertura Editor");
      log(`step7 storeId=${storeId} url=${page.url()}`);
      const settingsPromise = page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/settings`) && r.request().method() === "GET",
        { timeout: 10000 }
      );
      await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/merchant\/[^/]+\/edit$/);
      log(`step7 after goto url=${page.url()}`);
      await expect(page.locator("body")).toContainText("Completezza profilo");
      const res = await settingsPromise;
      expect(res.status(), "settings GET should be 200").toBe(200);
    });

    /* ── Step 8: Modifica nome (debounced PUT) ────────────────────────────── */
    await test.step("8. Modifica nome negozio", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 8: Modifica nome");
      await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "networkidle" });
      const nomeInput = page.locator('input[placeholder="Nome negozio"]').first();
      await nomeInput.fill(`Negozio Rinominato ${TS}`, { timeout: 15000 });
      const putRes = await page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/settings`) && r.request().method() === "PUT",
        { timeout: 15000 }
      );
      expect(putRes.status(), "settings PUT should be 200").toBe(200);
      const body = await putRes.json();
      expect(body.success, "PUT should report success").toBe(true);
      // success tick appears
      await expect(page.locator("input[placeholder='Nome negozio']")).toHaveValue(`Negozio Rinominato ${TS}`);
    });

    /* ── Step 9: Cambio logo ──────────────────────────────────────────────── */
    await test.step("9. Cambio logo", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 9: Cambio logo");
      // the dashboard logo uploader reads file → gallery POST → settings PUT
      const fileInput = page.locator('input[type="file"][accept*="image"]').first();
      await fileInput.setInputFiles("fixtures/logo-test.png");
      const galleryRes = await page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/gallery`) && r.request().method() === "POST",
        { timeout: 15000 }
      );
      expect(galleryRes.status(), "gallery upload should succeed").toBe(200);
      const gBody = await galleryRes.json();
      expect(gBody.success, "gallery POST should be ok").toBe(true);
    });

    /* ── Step 10: Salvataggio informazioni ────────────────────────────────── */
    await test.step("10. Salvataggio impostazioni (informazioni)", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 10: Salvataggio informazioni");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=informazioni`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText("Informazioni");
      const descInput = page.locator("textarea").first();
      await descInput.fill(`Descrizione aggiornata by E2E ${TS}`);
      await page.getByRole("button", { name: "Salva modifiche" }).click();
      const putRes = await page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/settings`) && r.request().method() === "PUT",
        { timeout: 15000 }
      );
      expect(putRes.status(), "settings PUT (informazioni) should be 200").toBe(200);
      const body = await putRes.json();
      expect(body.success).toBe(true);
    });

    /* ── Step 11: Ricarica pagina ─────────────────────────────────────────── */
    await test.step("11. Ricarica pagina dopo salvataggio", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 11: Ricarica pagina");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/merchant\/[^/]+\/edit/);
    });

    /* ── Step 12: Verifica persistenza ────────────────────────────────────── */
    await test.step("12. Verifica persistenza dati", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 12: Verifica persistenza");
      const nomeResPromise = page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/settings`) && r.request().method() === "GET",
        { timeout: 10000 }
      );
      await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "networkidle" });
      const nomeRes = await nomeResPromise;
      const json = await nomeRes.json();
      expect(json.success).toBe(true);
      expect(json.data.settings.nome).toMatch(/Rinominato/);
      expect(json.data.settings.descrizione).toMatch(/Descrizione aggiornata/);
    });

    /* ── Step 13: Creazione prodotto ──────────────────────────────────────── */
    await test.step("13. Creazione prodotto", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 13: Creazione prodotto");
      await page.goto(`${BASE}/merchant/${storeId}/prodotti/nuovo?manual=1`, {
        waitUntil: "networkidle",
      });
      await page.locator("#nome").fill(`Prodotto E2E ${TS}`);
      await page.locator("#categoria").fill("Elettronica");
      await page.locator("#descrizione").fill("Descrizione prodotto E2E");
      await page.locator("#prezzo").fill("9.99");
      await page.locator('button[type="submit"]', { hasText: "Salva prodotto" }).click();
      const createRes = await page.waitForResponse(
        (r) => r.url().endsWith(`/api/merchant/stores/${storeId}/products`) && r.request().method() === "POST",
        { timeout: 15000 }
      );
      expect(createRes.status(), "product POST should be 200/201").toBeLessThan(300);
      await page.waitForURL(/\/merchant\/[^/]+\/prodotti$/, { timeout: 15000 });
      await expect(page.locator("body")).toContainText(`Prodotto E2E ${TS}`);
    });

    /* ── Step 14: Upload immagine prodotto ────────────────────────────────── */
    await test.step("14. Upload immagine prodotto", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 14: Upload immagine prodotto (edit existing)");
      await page.goto(`${BASE}/merchant/${storeId}/prodotti`, { waitUntil: "domcontentloaded" });
      await page.locator("a").filter({ hasText: "Modifica" }).first().click();
      await page.waitForURL(/\/merchant\/[^/]+\/prodotti\/[^/]+$/, { timeout: 15000 });
      await expect(page.locator("body")).toContainText("Modifica prodotto");
      // hidden file input (accept="image/*") is triggered by "Aggiungi immagine";
      // setInputFiles works on hidden inputs
      await page.locator('input[type="file"][accept*="image"]').first().setInputFiles("fixtures/logo-test.png");
      const putPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/merchant/stores/${storeId}/products/`) &&
          r.request().method() === "PUT",
        { timeout: 15000 }
      );
      await page.locator('button[type="submit"]').filter({ hasText: "Aggiorna prodotto" }).click();
      const putRes = await putPromise;
      expect(putRes.status(), "product PUT should be 200/201").toBeLessThan(300);
      await expect(page).not.toHaveURL(/\/500|\/error/);
    });

    /* ── Step 15: Salvataggio del prodotto ────────────────────────────────── */
    /* (merged with step 14's save; here we just assert the product is listed) */
    await test.step("15. Salvataggio prodotto verificato nella lista", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 15: Verifica salvataggio prodotto");
      await page.goto(`${BASE}/merchant/${storeId}/prodotti`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText(`Prodotto E2E ${TS}`);
    });

    /* ── Step 16: Riapertura prodotto ─────────────────────────────────────── */
    await test.step("16. Riapertura prodotto", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 16: Riapertura prodotto");
      await page.goto(`${BASE}/merchant/${storeId}/prodotti`, { waitUntil: "networkidle" });
      const editLink = page.locator("a").filter({ hasText: "Modifica" }).first();
      await editLink.click();
      await expect(page.locator("#nome")).toHaveValue(`Prodotto E2E ${TS}`, { timeout: 10000 });
    });

    /* ── Step 17: Eliminazione prodotto ───────────────────────────────────── */
    await test.step("17. Eliminazione prodotto", async () => {
      test.skip(!storeId, "requires a store");
      log("Step 17: Eliminazione prodotto");
      // Flusso reale dell'app: il pulsante "Elimina" vive nella LISTA prodotti
      // (per riga), NON nella pagina di modifica. Torna alla lista, individua
      // il prodotto creato dal test e clicca Elimina sulla sua riga
      // (window.confirm auto-accettato dal handler di pagina).
      await page.goto(`${BASE}/merchant/${storeId}/prodotti`, { waitUntil: "networkidle" });
      const cardProdotto = page
        .locator("div")
        .filter({ hasText: `Prodotto E2E ${TS}` })
        .filter({ has: page.getByRole("button", { name: "Elimina" }) })
        .last();
      await expect(cardProdotto).toBeVisible({ timeout: 10000 });
      await cardProdotto.getByRole("button", { name: "Elimina" }).click();
      const delRes = await page.waitForResponse(
        (r) =>
          r.url().includes(`/api/merchant/stores/${storeId}/products`) && r.request().method() === "DELETE",
        { timeout: 15000 }
      );
      expect(delRes.status(), "product DELETE should be 200").toBe(200);
      await expect(page).not.toHaveURL(/\/500|\/error/);
      // dopo il router.refresh() la riga sparisce dalla lista
      await expect(cardProdotto).toHaveCount(0, { timeout: 10000 });
    });

    /* ── Step 18: Logout ──────────────────────────────────────────────────── */
    await test.step("18. Logout", async () => {
      log("Step 18: Logout");
      await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
      await page.locator('form[action="/api/auth/signout"] button[type="submit"]').first().click();
      await page.waitForURL(`${BASE}/login`, { timeout: 15000 });
      await expect(page).toHaveURL(/\/login/);
    });

    /* ── Step 19: Nuovo login ─────────────────────────────────────────────── */
    await test.step("19. Nuovo login", async () => {
      log("Step 19: Nuovo login");
      await loginUtente(page, MERCHANT, { waitFor: /\/merchant/ });
      await expect(page).toHaveURL(/\/merchant/);
    });
  });
});
