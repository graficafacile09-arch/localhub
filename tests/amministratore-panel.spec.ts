import { test, expect } from "@playwright/test";
import type { DatiDashboard } from "@/lib/amministratore/dashboard-queries";
import { BASE, UTENTI, loginUtente } from "./fixtures/auth";

const DASHBOARD_API = "**/api/amministratore/dashboard";

function dashboardVuota(avvisi: string[] = []): DatiDashboard {
  return {
    kpi: {
      utenti: 0,
      commercianti: 0,
      clienti: 0,
      negoziAttivi: 0,
      negoziSospesi: 0,
      negoziCestino: 0,
      prodotti: 0,
      offerteAttive: 0,
      eventi: 0,
      scansioniOggi: 0,
    },
    grafici: {
      negoziPerCategoria: [],
      utentiPerRuolo: [],
      scansioniSettimana: [],
    },
    ultimiNegozi: [],
    ultimiUtenti: [],
    ultimeAttivita: [],
    statoPiattaforma: {
      database: true,
      filtroDemo: true,
      aiConfigurato: false,
      cacheVisione: 0,
      rateLimitMin: 60,
      ultimaScansione: null,
    },
    avvisi,
  };
}

async function mockDashboard(page: import("@playwright/test").Page, dashboard: DatiDashboard) {
  await page.route(DASHBOARD_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { dashboard } }),
    });
  });
}

function valoreKpi(page: import("@playwright/test").Page, label: string) {
  return page
    .locator("p")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator("../..")
    .locator("p.text-3xl");
}

async function leggiDashboard(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/amministratore/dashboard");
    return response.json();
  });
}

async function creaNegozioReale(page: import("@playwright/test").Page, nome: string) {
  return page.evaluate(async (n) => {
    const response = await fetch("/api/merchant/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: n, categoria: "Bar", citta: "Castrovillari" }),
    });
    return response.json();
  }, nome);
}

async function eliminaDefinitivamente(page: import("@playwright/test").Page, storeId: string) {
  await page.evaluate(async (id) => {
    await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" });
  }, storeId);
}

async function cestinaNegozio(page: import("@playwright/test").Page, storeId: string) {
  await page.evaluate(async (id) => {
    await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
  }, storeId);
}

async function accediComeMerchantEAdmin(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.merchantD);
}

async function tornaAdmin(page: import("@playwright/test").Page) {
  await accediComeAdmin(page);
}

// FASE 7: /amministratore è protetto — i test accedono come admin.
// Account condiviso SOLO tra test admin: nessuno di essi esegue mai un
// signOut, quindi non può esserci revoca incrociata di sessioni.
async function accediComeAdmin(page: import("@playwright/test").Page) {
  await loginUtente(page, UTENTI.admin);
}

// Ogni test del pannello parte loggato come admin. Dopo il login l'utente
// atterra sulla homepage (/); ogni test naviga esplicitamente alla propria
// sezione dell'area amministratore.
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

/**
 * Struttura a GRUPPI della sidebar admin (Fase 10A). I gruppi sono accordion
 * chiusi di default: il test li apre uno a uno e verifica voci + href.
 * Include TUTTE le voci reali (Negozi, Ordini, Incassi, Payout, …).
 */
const GRUPPI: Array<{ nome: string; voci: Array<[string, string]> }> = [
  {
    nome: "Panoramica",
    voci: [["Panoramica", "/amministratore"]],
  },
  {
    nome: "Negozi & Catalogo",
    voci: [
      ["Negozi", "/amministratore/attivita"],
      ["Prodotti", "/amministratore/prodotti"],
      ["Categorie", "/amministratore/categorie"],
      ["Negozi in evidenza", "/amministratore/negozi-in-evidenza"],
    ],
  },
  {
    nome: "Ordini & Pagamenti",
    voci: [
      ["Ordini", "/amministratore/ordini"],
      ["Incassi", "/amministratore/incassi"],
      ["Payout", "/amministratore/payout"],
    ],
  },
  {
    nome: "Contenuti & Promozioni",
    voci: [
      ["Offerte", "/amministratore/offerte"],
      ["Eventi", "/amministratore/eventi"],
      ["Contenuti", "/amministratore/contenuti"],
      ["Template", "/amministratore/template"],
    ],
  },
  {
    nome: "Piattaforma",
    voci: [
      ["Utenti", "/amministratore/utenti"],
      ["Segnalazioni", "/amministratore/segnalazioni"],
      ["Statistiche", "/amministratore/statistiche"],
    ],
  },
  {
    nome: "Strumenti",
    voci: [
      ["Assistente AI", "/amministratore/assistente-ai"],
      ["Scansioni AI", "/amministratore/scansioni"],
      ["Registro attività", "/amministratore/registro-attivita"],
      ["Impostazioni", "/amministratore/impostazioni"],
    ],
  },
  {
    nome: "Recupero",
    voci: [["Cestino", "/amministratore/cestino"]],
  },
];

test.describe("PANNELLO AMMINISTRATORE — struttura", () => {
  test("la Panoramica è la dashboard di piattaforma con KPI reali + Zona Pericolosa", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/Amministratore/);

    // VERA dashboard amministrativa (non la home del venditore)
    await expect(
      page.getByRole("heading", { level: 1, name: "Panoramica" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Area Amministratore");
    await expect(page.locator("body")).toContainText("Utenti totali");
    await expect(page.locator("body")).toContainText("Negozi attivi");

    // Strumenti di piattaforma (esclusivi dell'admin): le voci Cestino e
    // Utenti sono presenti nella sidebar admin. Con la Fase 10A i gruppi
    // sono accordion chiusi di default: qui si verifica la PRESENZA delle
    // voci (si aprono navigando sulla pagina corrispondente).
    const navAdmin = page.getByRole("navigation", {
      name: "Menu Amministratore",
    });
    await expect(
      navAdmin.getByRole("link", { name: "Cestino", exact: true })
    ).toBeAttached();
    await expect(
      navAdmin.getByRole("link", { name: "Utenti", exact: true })
    ).toBeAttached();

    // Zona Pericolosa (esclusiva dell'admin). Le card negozio hanno i propri
    // bottoni "Elimina <nome>": il bottone "Elimina negozio" è quello del
    // blocco Zona Pericolosa (match esatto).
    await expect(page.locator("body")).toContainText("ZONA PERICOLOSA");
    await expect(
      page.getByRole("button", { name: "Elimina negozio", exact: true })
    ).toBeVisible();
  });

  test("Refresh Dashboard richiede nuovamente i dati e aggiorna l'indicatore", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const refresh = page.getByTitle("Aggiorna i dati");
    await expect(refresh).toBeVisible();
    await expect(refresh).toBeEnabled();

    const richiestaRefresh = page.waitForRequest(
      (request) =>
        request.method() === "GET" &&
        request.url().includes("/api/amministratore/dashboard")
    );
    await refresh.click();
    await richiestaRefresh;
    await expect(page.getByText(/^Aggiornato alle /)).toBeVisible();
  });

  test("i KPI mostrano i valori reali restituiti dalla sorgente Dashboard", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const response = await leggiDashboard(page);
    const kpi = response.data.dashboard.kpi;
    const valori: Array<[string, number]> = [
      ["Utenti totali", kpi.utenti],
      ["Commercianti", kpi.commercianti],
      ["Clienti", kpi.clienti],
      ["Negozi attivi", kpi.negoziAttivi],
      ["Nel cestino", kpi.negoziCestino],
      ["Prodotti", kpi.prodotti],
      ["Offerte attive", kpi.offerteAttive],
      ["Eventi", kpi.eventi],
      ["Scansioni AI oggi", kpi.scansioniOggi],
      ["Negozi reali", kpi.negoziAttivi + kpi.negoziSospesi],
    ];

    for (const [label, valore] of valori) {
      await expect(valoreKpi(page, label), `KPI «${label}»`).toHaveText(
        String(valore)
      );
    }
  });

  test("mostra gli empty state quando le sorgenti restituiscono liste vuote", async ({
    page,
  }) => {
    await mockDashboard(page, dashboardVuota());
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(page.getByText("Nessun negozio attivo").first()).toBeVisible();
    await expect(
      page.getByText("Nessun utente registrato", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText("Nessuna scansione negli ultimi 7 giorni")
    ).toBeVisible();
    await expect(page.getByText("Nessuna attività recente")).toBeVisible();
  });

  test("mostra gli errori non bloccanti delle sorgenti dati", async ({ page }) => {
    await mockDashboard(
      page,
      dashboardVuota([
        "Negozi: timeout della sorgente negozi.",
        "Prodotti: sorgente prodotti non disponibile.",
        "Scansioni AI: tabella non raggiungibile.",
      ])
    );
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Fonti dati parzialmente disponibili" })).toBeVisible();
    await expect(page.locator("body")).toContainText(
      "Negozi: timeout della sorgente negozi."
    );
    await expect(page.locator("body")).toContainText(
      "Prodotti: sorgente prodotti non disponibile."
    );
    await expect(page.locator("body")).toContainText(
      "Scansioni AI: tabella non raggiungibile."
    );
  });

  test("esclude i negozi demo dai KPI e dalle liste della dashboard", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const response = await leggiDashboard(page);
    const dashboard = response.data.dashboard;
    expect(dashboard.statoPiattaforma.filtroDemo).toBe(true);
    expect(
      dashboard.ultimiNegozi.every(
        (negozio: { nome: string; slug: string | null }) =>
          !negozio.slug?.startsWith("demo-") &&
          !["Panificio Rossi", "Atelier Bellezza", "Casa Moderna"].includes(
            negozio.nome
          )
      )
    ).toBe(true);
    await expect(page.locator("body")).not.toContainText("Panificio Rossi");
    await expect(page.locator("body")).not.toContainText("Atelier Bellezza");
  });

  test("non conta un negozio nel cestino tra i negozi attivi", async ({ page }) => {
    test.setTimeout(120_000);

    await accediComeMerchantEAdmin(page);
    const nome = `QA Dashboard Cestino ${Date.now()}`;
    const createJson = await creaNegozioReale(page, nome);
    const storeId: string = createJson.data?.storeId;
    expect(storeId, "create must return storeId").toBeTruthy();

    try {
      await tornaAdmin(page);
      const prima = await leggiDashboard(page);
      const kpiPrima = prima.data.dashboard.kpi;

      await cestinaNegozio(page, storeId);
      await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
      const dopo = await leggiDashboard(page);
      const kpiDopo = dopo.data.dashboard.kpi;

      expect(kpiDopo.negoziAttivi).toBe(kpiPrima.negoziAttivi);
      expect(kpiDopo.negoziCestino).toBe(kpiPrima.negoziCestino + 1);
      await expect(valoreKpi(page, "Negozi attivi")).toHaveText(
        String(kpiPrima.negoziAttivi)
      );
    } finally {
      await eliminaDefinitivamente(page, storeId);
    }
  });

  test("il menu laterale elenca tutte le voci nei gruppi con le route corrette", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: "Menu Amministratore" });

    // Gruppi chiusi di default: solo quello della pagina attiva (Panoramica)
    // è espanso all'apertura della sidebar.
    await expect(
      nav.getByRole("button", { name: "Panoramica", exact: true })
    ).toHaveAttribute("aria-expanded", "true");
    for (const gruppo of GRUPPI) {
      if (gruppo.nome === "Panoramica") continue;
      await expect(
        nav.getByRole("button", { name: gruppo.nome, exact: true }),
        `gruppo «${gruppo.nome}» chiuso di default`
      ).toHaveAttribute("aria-expanded", "false");
    }

    // Apre ogni gruppo e verifica voci presenti + href corretti.
    for (const gruppo of GRUPPI) {
      const btn = nav.getByRole("button", { name: gruppo.nome, exact: true });
      if ((await btn.getAttribute("aria-expanded")) === "false") {
        await btn.click();
      }
      for (const [label, href] of gruppo.voci) {
        const link = nav.getByRole("link", { name: label, exact: true });
        await expect(
          link,
          `voce «${label}» nel gruppo «${gruppo.nome}»`
        ).toBeVisible();
        await expect(link).toHaveAttribute("href", href);
      }
    }

    // La sezione negozi è SEPARATA dalla navigazione principale: per
    // l'admin ha etichetta "Negozi gestiti" (non è una voce del menu).
    const sezioneNegozi = page
      .locator("aside")
      .getByText("Negozi gestiti", { exact: true });
    await expect(sezioneNegozi).toBeVisible();
  });

  test("la sezione footer della sidebar ha solo Torna al sito; Impostazioni vive nel gruppo Strumenti", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const footer = page.getByRole("navigation", {
      name: "Navigazione rapida",
    });

    // Il footer contiene SOLO "Torna al sito" (separato dalla navigazione).
    const tornaAlSito = footer.getByRole("link", {
      name: "Torna al sito",
      exact: true,
    });
    await expect(tornaAlSito).toBeVisible();
    await expect(tornaAlSito).toHaveAttribute("href", "/");
    await expect(
      footer.getByRole("link", { name: "Impostazioni", exact: true })
    ).toHaveCount(0);

    // Impostazioni NON è nel footer: vive nel gruppo STRUMENTI (Fase 10A).
    const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
    const btnStrumenti = nav.getByRole("button", {
      name: "Strumenti",
      exact: true,
    });
    if ((await btnStrumenti.getAttribute("aria-expanded")) === "false") {
      await btnStrumenti.click();
    }
    const impostazioni = nav.getByRole("link", {
      name: "Impostazioni",
      exact: true,
    });
    await expect(impostazioni).toBeVisible();
    await expect(impostazioni).toHaveAttribute(
      "href",
      "/amministratore/impostazioni"
    );

    // La voce placeholder "Guida" è stata rimossa (nessun elemento morto).
    await expect(footer.getByText("Guida", { exact: true })).toHaveCount(0);
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

  test("l'header mostra Home, Area Amministratore e il menu di uscita", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(
      page.getByRole("link", { name: "Home", exact: true })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Area Amministratore");
    await expect(
      page.getByRole("button", { name: "Esci" })
    ).toBeVisible();
  });

  test("la sidebar admin ha Panoramica verso /amministratore e le voci sono raggiungibili aprendo i gruppi", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", {
      name: "Menu Amministratore",
    });

    // La voce Panoramica (gruppo attivo, aperto di default) porta alla
    // dashboard amministratore.
    const panoramica = nav.getByRole("link", {
      name: "Panoramica",
      exact: true,
    });
    await expect(panoramica).toBeVisible();
    await expect(panoramica).toHaveAttribute("href", "/amministratore");

    // Cestino (gruppo Recupero) e Utenti (gruppo Piattaforma) sono
    // raggiungibili aprendo i rispettivi gruppi dell'accordion.
    const btnRecupero = nav.getByRole("button", {
      name: "Recupero",
      exact: true,
    });
    await btnRecupero.click();
    await expect(
      nav.getByRole("link", { name: "Cestino", exact: true })
    ).toBeVisible();

    const btnPiattaforma = nav.getByRole("button", {
      name: "Piattaforma",
      exact: true,
    });
    await btnPiattaforma.click();
    await expect(
      nav.getByRole("link", { name: "Utenti", exact: true })
    ).toBeVisible();
  });
});

test.describe("MODULO ATTIVITÀ — centro di controllo", () => {
  test.describe.configure({ mode: "serial" });
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
    // Nessun pulsante morto: "Nuova attività" non esiste più.
    await expect(
      page.getByRole("button", { name: /Nuova attività/ })
    ).toHaveCount(0);
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
    test.setTimeout(120_000);

    /* ── Fixture: crea un negozio REALE via API (il DB di test è pulito,
            nome non-demo, altrimenti verrebbe escluso dalle viste admin). */
    await loginUtente(page, UTENTI.merchantD);
    const nome = `QA Attività ${Date.now()}`;
    const createJson = await page.evaluate(async (n) => {
      const r = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: n, categoria: "Bar", citta: "Castrovillari" }),
      });
      return r.json();
    }, nome);
    const storeId: string = createJson.data?.storeId;
    expect(storeId, "create must return storeId").toBeTruthy();

    /* ── Admin: il negozio appena creato è in tabella ─────────────── */
    await accediComeAdmin(page);
    await page.goto(`${BASE}/amministratore/attivita`, {
      waitUntil: "networkidle",
    });
    const tabella = page.locator("table");
    await expect(tabella.getByText(nome).first()).toBeVisible({ timeout: 15_000 });

    // Ricerca un nome sicuramente assente → nessun risultato.
    await page
      .getByRole("searchbox", { name: "Cerca attività" })
      .fill("zxqv-non-esiste");
    await expect(page.locator("body")).toContainText("Nessuna attività trovata");

    // Ricerca del nome del negozio → la riga torna visibile.
    await page
      .getByRole("searchbox", { name: "Cerca attività" })
      .fill(nome);
    await expect(tabella.getByText(nome).first()).toBeVisible();

    /* ── Cleanup: cestina ed elimina DEFINITIVAMENTE il negozio, così il DB
            di test resta pulito (nessun residuo visibile in admin). */
    await page.evaluate(async (id) => {
      await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
      await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" });
    }, storeId);
  });

  test("il menu Azioni gestisce proprietario, evidenza e stato senza refresh", async ({
    page,
  }) => {
    await page.route("**/api/amministratore/attivita/proprietari", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { proprietari: [] } }),
      });
    });
    await page.route(/\/api\/amministratore\/attivita\/[^/]+$/, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            attivita: {
              id: "test-attivita",
              owner_user_id: payload.owner_user_id ?? null,
              attivo: payload.attivo ?? true,
              in_evidenza: payload.in_evidenza ?? false,
            },
          },
        }),
      });
    });
    page.on("dialog", (dialog) => void dialog.accept());

    await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
    const riga = page.locator("tbody tr").first();
    await expect(riga).toBeVisible({ timeout: 15_000 });
    const menu = riga.getByRole("button", { name: /Azioni per / });
    await menu.click();

    await page.getByRole("menuitem", { name: "Gestisci proprietario" }).click();
    await expect(page.getByRole("combobox", { name: "Seleziona proprietario" })).toBeVisible();
    await page.getByRole("button", { name: "Salva proprietario" }).click();
    await expect(page).toHaveURL(`${BASE}/amministratore/attivita`);

    const evidenzaAttuale = await riga.getByText("In evidenza", { exact: true }).count() > 0;
    await menu.click();
    await page.getByRole("menuitem", {
      name: evidenzaAttuale ? "Togli evidenza" : "Metti in evidenza",
    }).click();
    await expect(
      riga.getByText(evidenzaAttuale ? "—" : "In evidenza", { exact: true })
    ).toBeVisible();

    const statoAttuale = await riga.getByText("Attiva", { exact: true }).count() > 0;
    await menu.click();
    await page.getByRole("menuitem", {
      name: statoAttuale ? "Disattiva" : "Riattiva",
    }).click();
    await expect(
      riga.getByText(statoAttuale ? "Disattivata" : "Attiva", { exact: true })
    ).toBeVisible();
    await expect(page).toHaveURL(`${BASE}/amministratore/attivita`);
  });

  test("il menu Azioni di un negozio elenca le voci (Elimina con conferma)", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    /* ── Fixture: crea un negozio REALE via API (vedi test precedente). */
    await loginUtente(page, UTENTI.merchantD);
    const nome = `QA Attività ${Date.now()}`;
    const createJson = await page.evaluate(async (n) => {
      const r = await fetch("/api/merchant/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: n, categoria: "Beauty", citta: "Castrovillari" }),
      });
      return r.json();
    }, nome);
    const storeId: string = createJson.data?.storeId;
    expect(storeId, "create must return storeId").toBeTruthy();

    /* ── Admin: apre il menu Azioni del negozio appena creato ──────── */
    await accediComeAdmin(page);
    await page.goto(`${BASE}/amministratore/attivita`, {
      waitUntil: "networkidle",
    });
    const tabella = page.locator("table");
    await expect(tabella.getByText(nome).first()).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole("button", { name: `Azioni per ${nome}` })
      .first()
      .click();

    for (const voce of [
      "Apri dashboard",
      "Modifica",
      "Duplica negozio",
      "Elimina",
    ]) {
      await expect(
        page.getByRole("menuitem", { name: voce })
      ).toBeVisible();
    }
    // Le tre azioni amministrative del Modulo Attività sono disponibili.
    await expect(
      page.getByRole("menuitem", { name: "Gestisci proprietario" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Metti in evidenza|Togli evidenza/ })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Disattiva|Riattiva/ })
    ).toBeVisible();

    // Click su Elimina apre la conferma (non chiude il menu).
    await page.getByRole("menuitem", { name: "Elimina" }).click();
    await expect(page.locator("body")).toContainText("Eliminare");
    await expect(
      page.getByRole("button", { name: "Annulla" })
    ).toBeVisible();

    /* ── Cleanup: cestina ed elimina DEFINITIVAMENTE il negozio, così il DB
            di test resta pulito (nessun residuo visibile in admin). */
    await page.evaluate(async (id) => {
      await fetch(`/api/amministratore/negozi/${id}/cestina`, { method: "POST" });
      await fetch(`/api/amministratore/negozi/${id}/definitivo`, { method: "DELETE" });
    }, storeId);
  });
});

test.describe("MODULO UTENTI — ruoli e permessi", () => {
  test("mostra le tab Tutti, Amministratori, Commercianti e Utenti con i conteggi", async ({
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
      page.getByRole("tab", { name: /Venditori/ })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /^Utenti/ })
    ).toBeVisible();
    // Nessun pulsante finto: il CRUD utenti arriva con la prossima fase.
    await expect(
      page.getByRole("button", { name: /Nuovo utente/ })
    ).toHaveCount(0);
  });

  test("la tabella mostra i dati reali (Nome, Email, Ruolo, Stato, Ultimo accesso)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/utenti`, {
      waitUntil: "networkidle",
    });

    const tabella = page.locator("table");
    for (const colonna of [
      "Nome",
      "Email",
      "Ruolo",
      "Stato",
      "Ultimo accesso",
    ]) {
      await expect(
        tabella.getByRole("columnheader", {
          name: colonna,
          exact: true,
        })
      ).toBeVisible();
    }
    // Nessuna colonna di azioni finte.
    await expect(
      tabella.getByRole("columnheader", { name: "Azioni", exact: true })
    ).toHaveCount(0);
    // L'admin REALE della piattaforma è visibile (auth.users).
    await expect(tabella.getByText("graficafacile09@gmail.com")).toBeVisible();
    // Gli account di test della suite sono esclusi (ruolo "test").
    await expect(tabella.getByText("admin.test@localhub.it")).toHaveCount(0);
  });

  test("il filtro Venditori esclude gli account di test", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore/utenti`, {
      waitUntil: "networkidle",
    });

    const tabella = page.locator("table");
    await page.getByRole("tab", { name: /Venditori/ }).click();
    // Gli account della suite (marcati "test") non compaiono mai in admin.
    await expect(tabella.getByText("admin.test@localhub.it")).toHaveCount(0);
    await expect(
      tabella.getByText("commerciante-a.test@localhub.it")
    ).toHaveCount(0);
  });

  test("la tabella non espone azioni finte sugli utenti", async ({ page }) => {
    await page.goto(`${BASE}/amministratore/utenti`, {
      waitUntil: "networkidle",
    });

    await expect(
      page.getByRole("button", { name: /Azioni per / })
    ).toHaveCount(0);
  });
});

test.describe("PANNELLO AMMINISTRATORE — mobile (stessa esperienza commerciante)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("su mobile la home admin è accessibile con top bar e bottom nav", async ({
    page,
  }) => {
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { level: 1, name: "Panoramica" })
    ).toBeVisible();

    // Bottom navigation mobile — stessa esperienza dell'Area Commerciante
    await expect(
      page.getByRole("link", { name: "Home", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Negozio", exact: true })
    ).toBeVisible();
  });
});
