import { test, expect } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

test.describe("SISTEMA DI ACCESSO E RUOLI", () => {
  test("anonimo: /amministratore, /merchant e /cliente reindirizzano a /login; header mostra Accedi", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);

    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);

    await page.goto(`${BASE}/cliente`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);

    // Homepage: niente più "Aggiungi Prodotto", ma il pulsante Accedi.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("link", { name: /Accedi/ })
    ).toBeVisible();
    await expect(page.getByText("Aggiungi Prodotto")).toHaveCount(0);
  });

  test("admin puro: login → / (homepage); menu con Area Amministratore; /cliente negato", async ({
    page,
  }) => {
    await loginUtente(page, UTENTI.admin, { waitFor: `${BASE}/` });

    // Un admin puro (senza ruolo customer) NON entra nell'Area Clienti.
    await page.goto(`${BASE}/cliente`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${BASE}/`);

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Menu utente di/ }).click();

    await expect(
      page.getByRole("menuitem", { name: "Area Amministratore" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Vai al sito" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Impostazioni" })
    ).toBeVisible();
    // Nessuna voce per le altre aree (admin puro): l'unica voce
    // "Area Amministratore" è quella dell'area admin (FASE 1 rename).
    await expect(
      page.getByRole("menuitem", { name: "Area Amministratore" })
    ).toHaveCount(1);
    await expect(
      page.getByRole("menuitem", { name: "Area Clienti" })
    ).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Esci" })).toBeVisible();
  });

  test("customer: login → homepage; /merchant e /amministratore negati; Area Clienti OK", async ({
    page,
  }) => {
    // Account dedicato (customerA): nessun altro test concorrente lo usa.
    await loginUtente(page, UTENTI.customerA, { waitFor: `${BASE}/` });

    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${BASE}/`);

    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${BASE}/`);

    // L'Area Clienti è accessibile al customer.
    await page.goto(`${BASE}/cliente`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/cliente/);
    await expect(page.locator("body")).toContainText("Area Clienti");

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Menu utente di/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Area Clienti" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Profilo" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Preferiti" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Ordini" })
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Esci" })).toBeVisible();
  });

  test("merchant: login → / (homepage); menu da commerciante; /cliente negato", async ({
    page,
  }) => {
    // Account dedicato (merchantD): nessun altro test concorrente fa signOut
    // su questo account (merchantA/B/C sono usati dalle altre suite).
    await loginUtente(page, UTENTI.merchantD, { waitFor: `${BASE}/` });

    // Un merchant puro (senza ruolo customer) NON entra nell'Area Clienti.
    await page.goto(`${BASE}/cliente`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${BASE}/`);

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Menu utente di/ }).click();

    await expect(
      page.getByRole("menuitem", { name: "Area Commerciante" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Vai al sito" })
    ).toBeVisible();
    // Nessuna voce per le altre aree (merchant puro): la voce dell'area
    // merchant è quella chiamata "Area Commerciante".
    await expect(
      page.getByRole("menuitem", { name: "Area Clienti" })
    ).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Esci" })).toBeVisible();
  });

  test("Esci dal menu utente riporta a /login", async ({ page }) => {
    // Account dedicato (customerB): il signOut GLOBALE di questo test non
    // può invalidare la sessione di altri test (customerA/C sono separati).
    await loginUtente(page, UTENTI.customerB, { waitFor: `${BASE}/` });

    await page.getByRole("button", { name: /Menu utente di/ }).click();
    await page.getByRole("menuitem", { name: "Esci" }).click();

    await page.waitForURL(`${BASE}/login`, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("il pulsante Accedi porta alla pagina di login con il form", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /Accedi/ }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("#email")).toBeVisible();
    await expect(
      page.locator('form[action="/api/auth/login"] button[type="submit"]')
    ).toBeVisible();
  });
});
