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

/** Route che NON mostrano più il placeholder (Panoramica = dashboard, Utenti = modulo). */
const ROUTE_NON_PLACEHOLDER = ["/amministratore", "/amministratore/utenti"];

test.describe("PANNELLO AMMINISTRATORE — struttura", () => {
  test("la Panoramica è una dashboard con riquadri, attività recenti, stato e accesso rapido", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/Amministratore/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Panoramica" })
    ).toBeVisible();

    // Riquadri statistici
    await expect(page.locator("body")).toContainText("Attività");
    await expect(page.locator("body")).toContainText("Prodotti");
    await expect(page.locator("body")).toContainText("Utenti");
    await expect(page.locator("body")).toContainText("Offerte");
    await expect(page.locator("body")).toContainText("Eventi");
    await expect(page.locator("body")).toContainText("Negozi in evidenza");
    await expect(page.locator("body")).toContainText("Segnalazioni");

    // Sezioni sotto i riquadri
    await expect(
      page.getByRole("heading", { name: "Attività recenti" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Stato della piattaforma" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Accesso rapido" })
    ).toBeVisible();

    // Accesso rapido: pulsanti grandi (scoped alla sezione dedicata)
    const sezioneRapida = page
      .getByRole("heading", { name: "Accesso rapido" })
      .locator("xpath=ancestor::section");
    await expect(
      sezioneRapida.getByRole("link", { name: /Gestisci Attività/ })
    ).toBeVisible();
    await expect(
      sezioneRapida.getByRole("link", { name: /Gestisci Prodotti/ })
    ).toBeVisible();
    await expect(
      sezioneRapida.getByRole("link", { name: /Gestisci Utenti/ })
    ).toBeVisible();
    await expect(
      sezioneRapida.getByRole("link", {
        name: /Categorie Organizzazione del catalogo/,
      })
    ).toBeVisible();
  });

  test("il menu laterale elenca tutte le 14 voci con le route corrette", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
    for (const [label, href] of VOCI) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await expect(link, `voce «${label}»`).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
  });

  test("la sezione footer della sidebar ha Torna al sito, Impostazioni e Guida", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const footer = page.getByRole("navigation", {
      name: "Navigazione rapida",
    });

    const tornaAlSito = footer.getByRole("link", {
      name: "Torna al sito",
      exact: true,
    });
    await expect(tornaAlSito).toBeVisible();
    await expect(tornaAlSito).toHaveAttribute("href", "/");

    const impostazioni = footer.getByRole("link", {
      name: "Impostazioni",
      exact: true,
    });
    await expect(impostazioni).toBeVisible();
    await expect(impostazioni).toHaveAttribute(
      "href",
      "/amministratore/impostazioni"
    );

    // Guida è una voce placeholder (non un link)
    await expect(footer.getByText("Guida", { exact: true })).toBeVisible();
  });

  test("ogni sezione placeholder è raggiungibile e mostra titolo e badge", async ({
    page,
  }) => {
    // Dashboard e Utenti non sono più placeholder: si escludono dal loop.
    for (const [label, href] of VOCI) {
      if (ROUTE_NON_PLACEHOLDER.includes(href)) continue;
      await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { level: 1 })
      ).toContainText(label);
      await expect(page.locator("body")).toContainText("Modulo in preparazione");
    }
  });

  test("l'header mostra brand LocalHub, titolo Amministratore e ruolo", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(
      page.getByRole("link", { name: "LocalHub — torna al sito" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Amministratore");
    await expect(page.locator("body")).toContainText("Ruolo: Amministratore");
  });

  test("il menu utente si apre con Il mio profilo, Impostazioni ed Esci", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const trigger = page
      .getByRole("button", { name: /Amministratore/ })
      .first();
    await trigger.click();

    await expect(
      page.getByRole("menuitem", { name: "Il mio profilo" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Impostazioni" })
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Esci" })).toBeVisible();

    // La voce Impostazioni del menu utente punta al modulo esistente.
    await page.getByRole("menuitem", { name: "Impostazioni" }).click();
    await expect(page).toHaveURL(/\/amministratore\/impostazioni/);
  });
});

test.describe("MODULO UTENTI — ruoli e permessi", () => {
  test("mostra le tab Tutti, Amministratori, Commercianti, Utenti con i conteggi", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/utenti`, {
      waitUntil: "networkidle",
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Utenti" })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Tutti/ })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Amministratori/ })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Commercianti/ })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /^Utenti/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Nuovo utente/ })
    ).toBeVisible();
  });

  test("la tabella mostra Nome, Email, Ruolo, Stato, Ultimo accesso e Azioni", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/utenti`, {
      waitUntil: "networkidle",
    });

    const tabella = page.locator("table");
    await expect(tabella.getByText("Giulia Ferrari")).toBeVisible();
    await expect(tabella.getByText("giulia.ferrari@localhub.it")).toBeVisible();
    await expect(tabella.getByText("Marco Bianchi")).toBeVisible();
    await expect(tabella.getByText("Alessia Romano")).toBeVisible();
    await expect(tabella.getByText("Amministratore").first()).toBeVisible();
    await expect(tabella.getByText("Commerciante").first()).toBeVisible();
    await expect(tabella.getByText("Attivo").first()).toBeVisible();
  });

  test("il filtro Commercianti mostra solo i commercianti", async ({ page }) => {
    await page.goto(`${BASE}/amministratore/utenti`, {
      waitUntil: "networkidle",
    });

    await page.getByRole("tab", { name: /Commercianti/ }).click();
    await expect(page.getByText("Alessia Romano")).toBeVisible();
    await expect(page.getByText("Luca Esposito")).toBeVisible();
    await expect(page.getByText("Giulia Ferrari")).toBeHidden();
  });

  test("il menu Azioni di un utente elenca le voci placeholder", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/utenti`, {
      waitUntil: "networkidle",
    });

    await page.getByRole("button", { name: "Azioni per Giulia Ferrari" }).click();

    for (const voce of ["Visualizza", "Modifica", "Permessi", "Disattiva", "Elimina"]) {
      await expect(
        page.getByRole("menuitem", { name: voce })
      ).toBeVisible();
    }

    // Click su una voce placeholder: nessuna navigazione, menu chiuso.
    await page.getByRole("menuitem", { name: "Visualizza" }).click();
    await expect(page).toHaveURL(/\/amministratore\/utenti/);
  });
});

test.describe("PANNELLO AMMINISTRATORE — sidebar collassabile (desktop)", () => {
  test("Comprimi menu nasconde le etichette, Espandi le ripristina", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const etichetta = page
      .getByRole("navigation", { name: "Menu Amministratore" })
      .getByText("Attività", { exact: true });
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
