import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3100";

/** Le 14 voci del menu Amministratore (etichetta → route). */
const VOCI: Array<[string, string]> = [
  ["Panoramica", "/amministratore"],
  ["Attività", "/amministratore/attivita"],
  ["Prodotti", "/amministratore/prodotti"],
  ["Offerte", "/amministratore/offerte"],
  ["Eventi", "/amministratore/eventi"],
  ["Utenti", "/amministratore/utenti"],
  ["Categorie", "/amministratore/categorie"],
  ["Negozi in evidenza", "/amministratore/negozi-in-evidenza"],
  ["Contenuti", "/amministratore/contenuti"],
  ["Assistente AI", "/amministratore/assistente-ai"],
  ["Statistiche", "/amministratore/statistiche"],
  ["Segnalazioni", "/amministratore/segnalazioni"],
  ["Impostazioni", "/amministratore/impostazioni"],
  ["Registro attività", "/amministratore/registro-attivita"],
];

test.describe("PANNELLO AMMINISTRATORE — struttura", () => {
  test("la Panoramica mostra header, menu laterale e badge Modulo in preparazione", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/Amministratore/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Panoramica" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Pannello Amministratore");
    await expect(page.locator("body")).toContainText("Modulo in preparazione");
    await expect(
      page.getByRole("link", { name: "Attività", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Registro attività", exact: true })
    ).toBeVisible();
  });

  test("il menu laterale elenca tutte le 14 voci con le route corrette", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    for (const [label, href] of VOCI) {
      const link = page.getByRole("link", { name: label, exact: true });
      await expect(link, `voce «${label}»`).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
  });

  test("ogni sezione è raggiungibile e mostra titolo e badge", async ({ page }) => {
    for (const [label, href] of VOCI) {
      await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { level: 1 })
      ).toContainText(label);
      await expect(page.locator("body")).toContainText("Modulo in preparazione");
    }
  });

  test("l'header mostra nome utente e ruolo Amministratore", async ({ page }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(page.locator("body")).toContainText("Ruolo: Amministratore");
  });

  test("il menu utente si apre con Il mio profilo ed Esci", async ({ page }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const trigger = page
      .getByRole("button", { name: /Amministratore/ })
      .first();
    await trigger.click();

    await expect(
      page.getByRole("menuitem", { name: "Il mio profilo" })
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Esci" })).toBeVisible();
  });
});

test.describe("PANNELLO AMMINISTRATORE — sidebar collassabile (desktop)", () => {
  test("Comprimi menu nasconde le etichette, Espandi le ripristina", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const etichetta = page.getByText("Attività", { exact: true });
    await expect(etichetta).toBeVisible();

    await page.getByRole("button", { name: "Comprimi il menu" }).click();
    await expect(etichetta).toBeHidden();

    await page.getByRole("button", { name: "Espandi il menu" }).click();
    await expect(etichetta).toBeVisible();
  });
});

test.describe("PANNELLO AMMINISTRATORE — mobile drawer", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("il menu si apre dal drawer e naviga a una sezione", async ({ page }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Apri il menu" }).click();

    await expect(
      page.getByRole("dialog", { name: "Menu Amministratore" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Attività", exact: true })
    ).toBeVisible();

    await page.getByRole("link", { name: "Attività", exact: true }).click();
    await expect(page).toHaveURL(/\/amministratore\/attivita/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Attività" })
    ).toBeVisible();
  });
});
