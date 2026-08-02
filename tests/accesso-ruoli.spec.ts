import { test, expect } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

test.describe("SISTEMA DI ACCESSO E RUOLI", () => {
  test("anonimo: /amministratore e /merchant reindirizzano a /login; header mostra Accedi", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);

    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);

    // Homepage: niente più "Aggiungi Prodotto", ma il pulsante Accedi.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("link", { name: /Accedi/ })
    ).toBeVisible();
    await expect(page.getByText("Aggiungi Prodotto")).toHaveCount(0);
  });

  test("admin: login → /amministratore; menu utente da amministratore", async ({
    page,
  }) => {
    await loginUtente(page, UTENTI.admin, { waitFor: `${BASE}/amministratore` });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Menu utente di/ }).click();

    await expect(
      page.getByRole("menuitem", { name: "Pannello Amministratore" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Vai al sito" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Impostazioni" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Profilo" })
    ).toBeVisible();
    // L'admin di test non possiede negozi → nessuna voce "Area Commerciante".
    await expect(
      page.getByRole("menuitem", { name: "Area Commerciante" })
    ).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Esci" })).toBeVisible();
  });

  test("customer: login → homepage; /merchant e /amministratore negati; menu acquirente", async ({
    page,
  }) => {
    // Account dedicato (customerA): nessun altro test concorrente lo usa,
    // quindi la sessione non può essere revocata da un signOut altrui.
    await loginUtente(page, UTENTI.customerA, { waitFor: `${BASE}/` });

    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${BASE}/`);

    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(`${BASE}/`);

    await page.getByRole("button", { name: /Menu utente di/ }).click();
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

  test("merchant: login → /merchant; menu utente da commerciante", async ({
    page,
  }) => {
    // Account dedicato (merchantD): nessun test concorrente fa signOut su
    // questo account (merchantA/B/C sono usati dalle altre suite).
    await loginUtente(page, UTENTI.merchantD, { waitFor: /\/merchant/ });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Menu utente di/ }).click();

    for (const voce of [
      "Il mio negozio",
      "Prodotti",
      "Offerte",
      "Eventi",
      "Statistiche",
      "Profilo",
    ]) {
      await expect(
        page.getByRole("menuitem", { name: voce })
      ).toBeVisible();
    }
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
