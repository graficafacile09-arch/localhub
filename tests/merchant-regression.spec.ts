import { test, expect, Page, Dialog } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// Fixture merchant dedicata a QUESTA suite (nessun altro test concorrente
// usa merchantB, quindi i suoi logout globali non danneggiano altri test).
const MERCHANT = UTENTI.merchantB;
const TS = Date.now();

const log = (msg: string) => console.log(`\n>>> ${msg}`);

/*
  MERCHANT REGRESSION TEST — single strictly-sequential E2E covering the full
  checklist: Login, Dashboard, Creazione negozio, Duplicazione, Template, Editor,
  Informazioni, Immagini, Prodotti, Servizi, Offerte, Eventi, Contatti, Posizione,
  Orari, Social, SEO, AI, Media, Reload, Elimina, Logout (+ Persistenza DB post-run).
  One test = shared session + shared storeId.
*/

test.describe("MERCHANT REGRESSION TEST (DB-synced + build-fixed)", () => {
  let page: Page;
  let storeId: string | null = null; // store A: E2E Panificio (main target of module tests)
  let storeIdDuplicato: string | null = null; // store B: deleted in "Elimina"
  let storeIdTemplate: string | null = null; // store C (reference only)

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.setViewportSize({ width: 1280, height: 800 });
    page.on("pageerror", (err) => console.log("JS ERROR:", err.message));
    page.on("response", (r) => {
      if (r.status() >= 500 && !r.url().includes("favicon")) {
        console.log("5xx:", r.status(), r.url());
      }
    });
    // accept all dialogs (window.confirm on delete flows)
    page.on("dialog", (d: Dialog) => d.accept());
  });

  test.afterAll(async () => {
    await page.close();
  });

  async function saveModule(storeId: string, label = "Salva modifiche") {
    const putPromise = page.waitForResponse(
      (r) => r.url().includes(`/api/merchant/stores/${storeId}/settings`) && r.request().method() === "PUT",
      { timeout: 15000 }
    );
    await page.getByRole("button", { name: label }).click();
    const res = await putPromise;
    expect(res.status(), "settings PUT should be 200").toBe(200);
    const body = await res.json();
    expect(body.success, "settings PUT success").toBe(true);
  }

  test("MERCHANT REGRESSION: login → dashboard → wizard ×3 → editor → 13 moduli → media → reload → elimina → logout", async () => {
    test.setTimeout(1_200_000);

    /* ── 1. Login ─────────────────────────────────────────────────────────── */
    await test.step("1. Login", async () => {
      log("Step 1: Login");
      await loginUtente(page, MERCHANT, { waitFor: /\/merchant/ });
      await expect(page).toHaveURL(/\/merchant/);
    });

    /* ── 2. Dashboard ─────────────────────────────────────────────────────── */
    await test.step("2. Dashboard", async () => {
      log("Step 2: Dashboard");
      await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText("Area Commercianti");
      const m = page.url().match(/\/merchant\/([^/]+)/);
      if (m) {
        storeId = m[1];
      } else {
        // multiple stores → store list; open the original store
        await page.locator(`a[href*="/merchant/"]`).filter({ hasText: "Negozio QA" }).first().click();
        await page.waitForURL(/\/merchant\/[^/]+/, { timeout: 15000 });
        const urlMatch = page.url().match(/\/merchant\/([^/]+)/);
        storeId = urlMatch ? urlMatch[1] : null;
      }
      expect(storeId, "storeId must be captured").toBeTruthy();
      log(`dashboard storeId=${storeId}`);
    });

    /* ── 3. Creazione negozio (da zero) ───────────────────────────────────── */
    await test.step("3. Creazione negozio", async () => {
      log("Step 3: Creazione negozio (da zero)");
      await page.goto(`${BASE}/merchant/nuovo`, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/merchant\/nuovo/);
      await page.getByRole("button", { name: "Da zero" }).click();
      await page.locator('input[placeholder="es. Panificio Rossi"]').fill(`E2E Panificio ${TS}`);
      await page.locator("select").selectOption("Bar");
      await page.locator('input[placeholder="es. Castrovillari"]').fill("Castrovillari");
      const resPromise = page.waitForResponse(
        (r) => r.url().endsWith("/api/merchant/stores") && r.request().method() === "POST",
        { timeout: 15000 }
      );
      await page.locator("button", { hasText: "Crea negozio" }).click();
      const res = await resPromise;
      expect(res.status()).toBe(200);
      const json = await res.json();
      expect(json.data.storeId, "API must return storeId").toBeTruthy();
      await page.waitForURL(/\/merchant\/[^/]+\/edit/, { timeout: 20000 });
      const m = page.url().match(/\/merchant\/([^/]+)\/edit/);
      storeId = m ? m[1] : storeId;
      expect(storeId).toBeTruthy();
      log(`creazione negozio storeId=${storeId}`);
    });

    /* ── 4. Duplicazione ──────────────────────────────────────────────────── */
    await test.step("4. Duplicazione", async () => {
      log("Step 4: Duplicazione");
      await page.goto(`${BASE}/merchant/nuovo`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Duplica negozio" }).click();
      await expect(page.locator("body")).toContainText("Negozio da duplicare");
      const sourceSelect = page.locator("select").first();
      const firstOption = sourceSelect.locator("option").nth(1);
      const val = await firstOption.getAttribute("value");
      if (val) await sourceSelect.selectOption({ value: val });
      await page.locator('input[placeholder="es. Panificio Rossi"]').fill(`E2E Duplicato ${TS}`);
      const catSelects = page.locator("select");
      await catSelects.nth(1).selectOption("Bar");
      await page.locator('input[placeholder="es. Castrovillari"]').fill("Castrovillari");
      await page.locator("button", { hasText: "Crea negozio" }).click();
      await page.waitForResponse(
        (r) => r.url().includes("/duplicate") && r.request().method() === "POST",
        { timeout: 15000 }
      );
      await page.waitForURL(/\/merchant\/[^/]+\/edit/, { timeout: 20000 });
      const m = page.url().match(/\/merchant\/([^/]+)\/edit/);
      storeIdDuplicato = m ? m[1] : null;
      expect(storeIdDuplicato, "duplicato storeId must be captured").toBeTruthy();
      log(`duplicazione storeIdDuplicato=${storeIdDuplicato}`);
    });

    /* ── 5. Template ──────────────────────────────────────────────────────── */
    await test.step("5. Template", async () => {
      log("Step 5: Creazione da Template");
      await page.goto(`${BASE}/merchant/nuovo`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Da Template" }).click();
      await expect(page.locator("body")).toContainText("Scegli un template");
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
      const m = page.url().match(/\/merchant\/([^/]+)\/edit/);
      storeIdTemplate = m ? m[1] : null;
      expect(storeIdTemplate, "template storeId must be captured").toBeTruthy();
      log(`template storeIdTemplate=${storeIdTemplate}`);
    });

    /* ── 6. Editor ────────────────────────────────────────────────────────── */
    await test.step("6. Editor", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 6: Editor");
      const settingsPromise = page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/settings`) && r.request().method() === "GET",
        { timeout: 10000 }
      );
      await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/merchant\/[^/]+\/edit$/);
      await expect(page.locator("body")).toContainText("Completezza profilo");
      const res = await settingsPromise;
      expect(res.status(), "settings GET should be 200").toBe(200);
      // rename store (debounced PUT from the editor dashboard)
      const nomeInput = page.locator('input[placeholder="Nome negozio"]').first();
      await nomeInput.fill(`Negozio Rinominato ${TS}`, { timeout: 15000 });
      const putRes = await page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/settings`) && r.request().method() === "PUT",
        { timeout: 15000 }
      );
      expect(putRes.status(), "settings PUT (nome) should be 200").toBe(200);
      await expect(page.locator("input[placeholder='Nome negozio']")).toHaveValue(`Negozio Rinominato ${TS}`);
    });

    /* ── 7. Informazioni ──────────────────────────────────────────────────── */
    await test.step("7. Informazioni", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 7: Informazioni");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=informazioni`, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toContainText("Informazioni");
      const textareas = page.locator("textarea");
      await textareas.nth(0).fill(`Descrizione aggiornata by E2E ${TS}`);
      await textareas.nth(1).fill(`Descrizione completa E2E ${TS}`);
      await saveModule(storeId);
    });

    /* ── 8. Immagini (logo) ───────────────────────────────────────────────── */
    await test.step("8. Immagini", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 8: Immagini (logo upload)");
      await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "networkidle" });
      const fileInput = page.locator('input[type="file"][accept*="image"]').first();
      await fileInput.setInputFiles("fixtures/logo-test.png");
      const galleryRes = await page.waitForResponse(
        (r) => r.url().includes(`/api/merchant/stores/${storeId}/gallery`) && r.request().method() === "POST",
        { timeout: 15000 }
      );
      expect(galleryRes.status(), "gallery upload should succeed").toBe(200);
      const gBody = await galleryRes.json();
      expect(gBody.success, "gallery POST should be ok").toBe(true);
      await expect(page.locator("body")).toContainText("Completezza profilo");
    });

    /* ── 9. Prodotti ──────────────────────────────────────────────────────── */
    await test.step("9. Prodotti (create + image + reopen + delete)", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 9: Prodotti");
      await page.goto(`${BASE}/merchant/${storeId}/prodotti/nuovo?manual=1`, { waitUntil: "domcontentloaded" });
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

      // edit + image
      await page.locator("a").filter({ hasText: "Modifica" }).first().click();
      await page.waitForURL(/\/merchant\/[^/]+\/prodotti\/[^/]+$/, { timeout: 15000 });
      await expect(page.locator("body")).toContainText("Modifica prodotto");
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

      // reopen: values persisted
      await page.goto(`${BASE}/merchant/${storeId}/prodotti`, { waitUntil: "domcontentloaded" });
      await page.locator("a").filter({ hasText: "Modifica" }).first().click();
      await page.waitForURL(/\/merchant\/[^/]+\/prodotti\/[^/]+$/, { timeout: 15000 });
      await expect(page.locator("#nome")).toHaveValue(`Prodotto E2E ${TS}`, { timeout: 10000 });

      // delete: flusso reale dell'app — il pulsante "Elimina" vive nella LISTA
      // prodotti, NON nella pagina di modifica. Torna alla lista e clicca
      // Elimina sulla riga del prodotto appena verificato.
      await page.goto(`${BASE}/merchant/${storeId}/prodotti`, { waitUntil: "domcontentloaded" });
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
      await expect(cardProdotto).toHaveCount(0, { timeout: 10000 });
    });

    /* ── 10. Servizi ──────────────────────────────────────────────────────── */
    await test.step("10. Servizi", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 10: Servizi");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=servizi`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Servizi");
      const tag = page.getByPlaceholder("Digita un servizio e premi Invio...");
      await tag.fill("Consegna a domicilio");
      await tag.press("Enter");
      await expect(page.locator("body")).toContainText("Consegna a domicilio");
      await saveModule(storeId);
    });

    /* ── 11. Offerte ──────────────────────────────────────────────────────── */
    await test.step("11. Offerte", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 11: Offerte");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=offerte`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Offerte");
      await page.locator('input[placeholder="es. Sconto 20% su tutto"]').fill("Sconto E2E");
      await page.locator("textarea").fill("Offerta di prova E2E");
      await page.locator('input[placeholder="€ 50.00"]').fill("50.00");
      await page.locator('input[placeholder="€ 35.00"]').fill("35.00");
      await page.locator('input[type="date"]').nth(0).fill("2026-08-01");
      await page.locator('input[type="date"]').nth(1).fill("2026-08-31");
      await saveModule(storeId);
    });

    /* ── 12. Eventi ───────────────────────────────────────────────────────── */
    await test.step("12. Eventi", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 12: Eventi");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=eventi`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Eventi");
      await page.locator('input[placeholder="es. Degustazione vini"]').fill("Degustazione E2E");
      await page.locator("textarea").fill("Degustazione di vini locali");
      await page.locator('input[type="date"]').fill("2026-09-10");
      await page.locator('input[type="time"]').fill("18:30");
      await page.locator('input[placeholder="es. Presso il negozio"]').fill("Sede E2E Castrovillari");
      await saveModule(storeId);
    });

    /* ── 13. Contatti ─────────────────────────────────────────────────────── */
    await test.step("13. Contatti", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 13: Contatti");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=contatti`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Contatti");
      await page.locator('div:has(> label:has-text("Telefono")) input').fill("0981 123456");
      await page.locator('div:has(> label:has-text("WhatsApp")) input').fill("+39 333 1234567");
      await page.locator('div:has(> label:has-text("Email")) input').fill("negozio-e2e@localhub.it");
      await page.locator('div:has(> label:has-text("Sito web")) input').fill("https://e2e.localhub.it");
      await saveModule(storeId);
    });

    /* ── 14. Posizione ────────────────────────────────────────────────────── */
    await test.step("14. Posizione", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 14: Posizione");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=posizione`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Posizione");
      await page.locator('div:has(> label:has-text("Indirizzo")) input').fill("Via Roma 1");
      await page.locator('div:has(> label:has-text("Città")) input').fill("Castrovillari");
      await page.locator('div:has(> label:has-text("CAP")) input').fill("87012");
      await page.locator('div:has(> label:has-text("Provincia")) input').fill("CS");
      await page.locator('div:has(> label:has-text("Coordinate")) input').fill("39.8167, 16.2006");
      await saveModule(storeId);
    });

    /* ── 15. Orari ────────────────────────────────────────────────────────── */
    await test.step("15. Orari", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 15: Orari");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=orari`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Orari");
      await page.locator('input[type="time"]').nth(0).fill("08:00");
      await page.locator('input[type="time"]').nth(1).fill("12:00");
      await saveModule(storeId);
    });

    /* ── 16. Social ───────────────────────────────────────────────────────── */
    await test.step("16. Social", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 16: Social");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=social`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Social");
      await page.locator('div:has(> label:has-text("WhatsApp")) input').fill("+39 333 1234567");
      await page.locator('div:has(> label:has-text("Facebook")) input').fill("negozio-e2e");
      await page.locator('div:has(> label:has-text("Instagram")) input').fill("negozio.e2e");
      await page.locator('div:has(> label:has-text("TikTok")) input').fill("negozio_e2e");
      await page.locator('div:has(> label:has-text("YouTube")) input').fill("localhub-e2e");
      await saveModule(storeId);
    });

    /* ── 17. SEO ──────────────────────────────────────────────────────────── */
    await test.step("17. SEO", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 17: SEO");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=seo`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("SEO");
      await page.locator('input[placeholder="Titolo per i motori di ricerca"]').fill("Negozio E2E | LocalHub");
      await page.locator("textarea").fill("Descrizione SEO di test per il negozio E2E");
      const kw = page.getByPlaceholder("Digita una keyword SEO e premi Invio...");
      await kw.fill("pasticceria");
      await kw.press("Enter");
      await expect(page.locator("body")).toContainText("pasticceria");
      await saveModule(storeId);
    });

    /* ── 18. AI ───────────────────────────────────────────────────────────── */
    await test.step("18. AI", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 18: AI");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=ai`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Assistente AI");
      await page.locator("textarea").fill("Rispondi sempre in italiano e sii gentile.");
      await page.locator("select").selectOption("amichevole");
      const faq = page.getByPlaceholder("Domanda frequente (es. Fate consegne a domicilio?)");
      await faq.fill("Fate consegne a domicilio?");
      await faq.press("Enter");
      await expect(page.locator("body")).toContainText("Fate consegne a domicilio?");
      await saveModule(storeId);
    });

    /* ── 19. Media (copertina + galleria) ─────────────────────────────────── */
    await test.step("19. Media", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 19: Media (copertina + galleria)");
      await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=immagini`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Immagini");
      const galleryPosts: string[] = [];
      page.on("response", (r) => {
        if (r.url().includes(`/api/merchant/stores/${storeId}/gallery`) && r.request().method() === "POST") {
          galleryPosts.push(r.url());
        }
      });
      const inputs = page.locator('input[type="file"]');
      await inputs.nth(1).setInputFiles("fixtures/logo-test.png"); // copertina
      await expect.poll(() => galleryPosts.length, { timeout: 20000 }).toBe(1);
      await inputs.nth(2).setInputFiles("fixtures/logo-test.png"); // galleria
      await expect.poll(() => galleryPosts.length, { timeout: 20000 }).toBe(2);
      // both uploads also trigger a settings PUT; verify galleria persisted
      await expect
        .poll(
          async () => {
            const j = await page.evaluate(
              async (u) => (await fetch(u)).json(),
              `/api/merchant/stores/${storeId}/settings`
            );
            return (j.data?.settings?.galleria ?? []).length;
          },
          { timeout: 20000 }
        )
        .toBeGreaterThanOrEqual(1);
      await expect(page.locator("body")).toContainText("Immagini");
    });

    /* ── 20. Reload + verifica persistenza (API) ──────────────────────────── */
    await test.step("20. Reload + persistenza", async () => {
      if (!storeId) { test.skip(true, "requires a store"); return; }
      log("Step 20: Reload + verifica persistenza");
      await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/merchant\/[^/]+\/edit/);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Completezza profilo");
      // fetch the settings API directly (avoids the reload-destroys-response race)
      const s = await page.evaluate(
        async (u) => {
          const r = await fetch(u);
          const j = await r.json();
          return j.data.settings as {
            nome: string;
            descrizione: string;
            servizi: string[];
            data?: {
              offerte?: Array<{ titolo?: string }>;
              eventi?: Array<{ titolo?: string }>;
              ai_data?: { tono?: string };
            };
            telefono?: string;
            indirizzo?: string;
            citta?: string;
            orari?: Record<string, { apertura1?: string }>;
            facebook?: string;
            seo_title?: string;
            logo_url?: string;
            galleria?: string[];
          };
        },
        `/api/merchant/stores/${storeId}/settings`
      );
      expect(s.nome).toMatch(/Rinominato/);
      expect(s.descrizione).toMatch(/Descrizione aggiornata/);
      expect(Array.isArray(s.servizi) && s.servizi.includes("Consegna a domicilio"), "servizi persisted").toBe(true);
      expect(s.data?.offerte?.[0]?.titolo).toBe("Sconto E2E");
      expect(s.data?.eventi?.[0]?.titolo).toBe("Degustazione E2E");
      expect(s.data?.ai_data?.tono).toBe("amichevole");
      expect(s.telefono).toBe("0981 123456");
      expect(s.indirizzo).toBe("Via Roma 1");
      expect(s.citta).toBe("Castrovillari");
      expect(s.orari?.["lunedì"]?.apertura1).toBe("08:00");
      expect(s.facebook).toBe("negozio-e2e");
      expect(s.seo_title).toBe("Negozio E2E | LocalHub");
      expect(s.logo_url).toBeTruthy();
      expect(Array.isArray(s.galleria) && s.galleria.length >= 1).toBe(true);
      log(`persistenza OK — storeId=${storeId}`);
    });

    /* ── 21. Elimina (negozio duplicato) ──────────────────────────────────── */
    await test.step("21. Elimina negozio", async () => {
      test.skip(!storeIdDuplicato, "requires the duplicated store");
      log(`Step 21: Elimina negozio (${storeIdDuplicato})`);
      await page.goto(`${BASE}/merchant/${storeIdDuplicato}/edit?modulo=zona-pericolosa`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("body")).toContainText("Zona Pericolosa");
      const delPromise = page.waitForResponse(
        (r) => r.url().endsWith(`/api/merchant/stores/${storeIdDuplicato}`) && r.request().method() === "DELETE",
        { timeout: 15000 }
      );
      await page.getByRole("button", { name: "Sposta nel Cestino" }).click();
      const delRes = await delPromise;
      expect(delRes.status(), "store DELETE should be 200").toBe(200);
      await page.waitForURL(/\/merchant$/, { timeout: 15000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(`a[href*="/merchant/${storeIdDuplicato}"]`)).toHaveCount(0);
    });

    /* ── 22. Logout ───────────────────────────────────────────────────────── */
    await test.step("22. Logout", async () => {
      log("Step 22: Logout");
      await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
      await page.locator('form[action="/api/auth/signout"] button[type="submit"]').first().click();
      await page.waitForURL(`${BASE}/login`, { timeout: 15000 });
      await expect(page).toHaveURL(/\/login/);
      // reload after logout → session is gone, still on login
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
