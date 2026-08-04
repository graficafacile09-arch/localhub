import { test, expect } from "@playwright/test";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

// FASE 7: /amministratore è protetto — i test accedono come admin.
// Account condiviso SOLO tra test admin: nessuno di essi esegue mai un
// signOut, quindi non può esserci revoca incrociata di sessioni.
async function accediComeAdmin(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.admin, { waitFor: `${BASE}/amministratore` });
}

// Ogni test del pannello parte loggato come admin (il redirect per ruolo
// porta l'admin su /amministratore).
test.beforeEach(async ({ page }) => {
  await accediComeAdmin(page);
});

/** Le voci del menu Amministratore (etichetta → route). */
const VOCI: Array<[string, string]> = [
  ["Panoramica", "/amministratore"],
  ["Attività", "/amministratore/attivita"],
  ["Cestino", "/amministratore/cestino"],
  ["Prodotti", "/amministratore/prodotti"],
  ["Offerte", "/amministratore/offerte"],
  ["Eventi", "/amministratore/eventi"],
  ["Utenti", "/amministratore/utenti"],
  ["Categorie", "/amministratore/categorie"],
  ["Negozi in evidenza", "/amministratore/negozi-in-evidenza"],
  ["Template", "/amministratore/template"],
  ["Contenuti", "/amministratore/contenuti"],
  ["Assistente AI", "/amministratore/assistente-ai"],
  ["Scansioni AI", "/amministratore/scansioni"],
  ["Statistiche", "/amministratore/statistiche"],
  ["Segnalazioni", "/amministratore/segnalazioni"],
  ["Impostazioni", "/amministratore/impostazioni"],
  ["Registro attività", "/amministratore/registro-attivita"],
];

/** Route che NON mostrano più il placeholder (moduli completi o dashboard). */
const ROUTE_NON_PLACEHOLDER = [
  "/amministratore",
  "/amministratore/utenti",
  "/amministratore/attivita",
  "/amministratore/cestino",
  "/amministratore/template",
  "/amministratore/scansioni",
];

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

  test("il menu laterale elenca tutte le voci con le route corrette", async ({
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

  test("l'header mostra brand LocalHub, titolo Amministratore e menu utente reale", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(
      page.getByRole("link", { name: "LocalHub — torna al sito" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Amministratore");
    await expect(
      page.getByRole("button", { name: /Menu utente di/ })
    ).toBeVisible();
  });

  test("il menu utente si apre con le voci dell'admin", async ({ page }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const trigger = page
      .getByRole("button", { name: /Menu utente di/ })
      .first();
    await trigger.click();

    await expect(
      page.getByRole("menuitem", { name: "Area Amministratore" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Vai al sito" })
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

test.describe("MODULO ATTIVITÀ — centro di controllo", () => {
  test("mostra header, barra superiore con filtri e tabella dei negozi", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/attivita`, {
      waitUntil: "networkidle",
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Attività" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(
      "Gestisci tutti i negozi presenti nella piattaforma"
    );

    // Barra superiore
    await expect(
      page.getByRole("searchbox", { name: "Cerca attività" })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Filtra per categoria" })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Filtra per stato" })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Filtra per evidenza" })
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Ordina attività" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Nuova attività/ })
    ).toBeVisible();
  });

  test("la tabella mostra le colonne Logo, Nome, Categoria, Proprietario, Prodotti, Stato, In evidenza, Data creazione e Azioni", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/attivita`, {
      waitUntil: "networkidle",
    });

    const tabella = page.locator("table");
    for (const colonna of [
      "Logo",
      "Nome",
      "Categoria",
      "Proprietario",
      "Prodotti",
      "Stato",
      "In evidenza",
      "Data creazione",
      "Azioni",
    ]) {
      await expect(
        tabella.getByRole("columnheader", { name: colonna, exact: true })
      ).toBeVisible();
    }
  });

  test("la ricerca filtra le attività per nome", async ({ page }) => {
    await page.goto(`${BASE}/amministratore/attivita`, {
      waitUntil: "networkidle",
    });

    const tabella = page.locator("table");
    const primaRiga = tabella.locator("tbody tr").first();
    const nomePrimo = (await primaRiga.locator("td").nth(1).innerText()).trim();

    // Ricerca un nome sicuramente assente → nessun risultato.
    await page
      .getByRole("searchbox", { name: "Cerca attività" })
      .fill("zxqv-non-esiste");
    await expect(page.locator("body")).toContainText("Nessuna attività trovata");

    // Ricerca del nome della prima riga → almeno quella riga visibile.
    await page
      .getByRole("searchbox", { name: "Cerca attività" })
      .fill(nomePrimo);
    await expect(tabella.getByText(nomePrimo).first()).toBeVisible();
  });

  test("il menu Azioni di un negozio elenca le voci placeholder", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/attivita`, {
      waitUntil: "networkidle",
    });

    const tabella = page.locator("table");
    const nomePrima = (await tabella
      .locator("tbody tr")
      .first()
      .locator("td")
      .nth(1)
      .innerText()).trim();

    await page.getByRole("button", { name: `Azioni per ${nomePrima}` }).click();

    for (const voce of [
      "Visualizza",
      "Modifica",
      "Apri negozio",
      "Gestisci proprietario",
      /Metti in evidenza|Togli evidenza/,
      /Disattiva|Riattiva/,
      "Elimina",
    ]) {
      await expect(
        page.getByRole("menuitem", { name: voce })
      ).toBeVisible();
    }

    // Click su una voce placeholder: nessuna navigazione, resta sulla pagina.
    await page.getByRole("menuitem", { name: "Visualizza" }).click();
    await expect(page).toHaveURL(/\/amministratore\/attivita/);
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
