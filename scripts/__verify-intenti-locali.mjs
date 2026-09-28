/**
 * VERIFICA BROWSER REALE — INTENTI LOCALI (METEO / FARMACIE).
 *
 * Requisiti verificati, senza dipendere dall'implementazione:
 *   1. meteo / farmacie NON producono MAI card di prodotti o negozi (né nella
 *      chat di Pino né nella pagina /ricerca);
 *   2. Pino si apre con la richiesta e risponde con il DATO REALE;
 *   3. le ricerche commerciali vere continuano ad arrivare al catalogo.
 *
 * Uso: node scripts/__verify-intenti-locali.mjs [--url https://www.incitta.online]
 */
import { chromium } from "@playwright/test";

const base =
  process.argv.find((a, i) => process.argv[i - 1] === "--url") || "http://localhost:3107";

// Ancora STABILE e indipendente dall'implementazione: il pulsante di chiusura
// del pannello. Il pannello è il primo antenato "fixed" di quel pulsante.
const SEL_CHIUDI = 'button[aria-label="Chiudi assistente"]';
const SEL_PANNELLO =
  'xpath=//button[@aria-label="Chiudi assistente"]/ancestor::div[contains(@class,"fixed")][1]';
const SEL_PRODOTTO = 'a[href^="/prodotto/"]';
const SEL_NEGOZIO = 'a[href^="/negozio/"]';

const METEO = ["com'è il tempo", "che tempo fa?", "piove?", "quanti gradi ci sono"];
const FARMACIA = ["ho la febbre", "farmacia di turno", "farmacia aperta adesso"];

let passati = 0;
let falliti = 0;

function check(nome, ok, dettaglio = "") {
  if (ok) {
    passati++;
    console.log(`  [OK] ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  } else {
    falliti++;
    console.log(`  [FAIL] ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  }
}

async function apriPino(page, timeout = 25000) {
  return page
    .locator(SEL_CHIUDI)
    .first()
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

function pannello(page) {
  return page.locator(SEL_PANNELLO);
}

async function testoChat(page) {
  const t = await pannello(page).innerText().catch(() => "");
  return (t || "").replace(/\s+/g, " ").trim();
}

async function quantiCataloghi(page) {
  const chatProdotti = await pannello(page).locator(SEL_PRODOTTO).count();
  const chatNegozi = await pannello(page).locator(SEL_NEGOZIO).count();
  const paginaProdotti = await page.locator(`main ${SEL_PRODOTTO}`).count();
  const paginaNegozi = await page.locator(`main ${SEL_NEGOZIO}`).count();
  return { chatProdotti, chatNegozi, paginaProdotti, paginaNegozi };
}

async function cerca(page, query) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const input = page.locator('form[action="/ricerca"] input[name="q"]').first();
  await input.waitFor({ state: "visible", timeout: 30000 });
  await input.fill(query);
  await input.press("Enter");
}

async function verificaIntento(page, query, tipo) {
  await cerca(page, query);
  const aperto = await apriPino(page);
  check(`"${query}" → Pino si apre`, aperto, page.url());
  if (!aperto) return;

  await page.waitForTimeout(7000);
  const testo = await testoChat(page);
  const c = await quantiCataloghi(page);

  check(
    `"${query}" → nessuna card prodotto/negozio nella chat`,
    c.chatProdotti === 0 && c.chatNegozi === 0,
    `prodotti: ${c.chatProdotti}, negozi: ${c.chatNegozi}`
  );
  check(
    `"${query}" → nessun risultato di catalogo in pagina`,
    c.paginaProdotti === 0 && c.paginaNegozi === 0,
    `prodotti: ${c.paginaProdotti}, negozi: ${c.paginaNegozi}`
  );

  if (tipo === "meteo") {
    check(`"${query}" → risposta con dato meteo reale`, /\d+\s*°/.test(testo), testo.slice(0, 130));
  } else {
    check(
      `"${query}" → risposta con dato farmacia reale`,
      /farmac/i.test(testo) && !/prodotto/i.test(testo),
      testo.slice(0, 130)
    );
  }
}

async function verificaUrlDiretta(page, query) {
  await page.goto(`${base}/ricerca?q=${encodeURIComponent(query)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  const c = await quantiCataloghi(page);
  check(
    `/ricerca?q=${query} → nessun risultato di catalogo SSR`,
    c.paginaProdotti === 0 && c.paginaNegozi === 0,
    `prodotti: ${c.paginaProdotti}, negozi: ${c.paginaNegozi}`
  );
  check(`/ricerca?q=${query} → nessun catalogo nella chat di Pino`, c.chatProdotti + c.chatNegozi === 0);
}

async function verificaCommerciale(page, query) {
  await cerca(page, query);
  await page.waitForURL(/\/ricerca\?q=/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const prod = await page.locator(`main ${SEL_PRODOTTO}`).count();
  const neg = await page.locator(`main ${SEL_NEGOZIO}`).count();
  check(
    `ricerca commerciale "${query}" → arriva al catalogo`,
    /\/ricerca\?q=/.test(page.url()),
    page.url()
  );
  check(
    `ricerca commerciale "${query}" → risultati reali mostrati`,
    prod + neg > 0,
    `prodotti: ${prod}, negozi: ${neg}`
  );
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erroriConsole = [];
page.on("console", (m) => {
  if (m.type() === "error") erroriConsole.push(m.text().slice(0, 160));
});

try {
  console.log(`\nBASE: ${base}`);
  console.log("\n── A. INTENTI LOCALI DALLA BARRA DI RICERCA ─────────────────────");
  for (const q of METEO) await verificaIntento(page, q, "meteo");
  for (const q of FARMACIA) await verificaIntento(page, q, "farmacia");

  console.log("\n── B. URL DIRETTA /ricerca?q= ───────────────────────────────────");
  for (const q of ["com'è il tempo", "farmacia di turno", "ho il raffreddore"]) {
    await verificaUrlDiretta(page, q);
  }

  console.log("\n── C. RICERCA COMMERCIALE VERA ──────────────────────────────────");
  await verificaCommerciale(page, "cerco una pizzeria");

  console.log("\n── D. CONSOLE ───────────────────────────────────────────────────");
  const errori = erroriConsole.filter((t) => !/favicon|Failed to load resource|net::ERR/i.test(t));
  check("nessun errore JS in console", errori.length === 0, errori.join(" | "));
} finally {
  await browser.close();
}

console.log(`\nRISULTATO: ${passati} OK, ${falliti} FAIL`);
process.exit(falliti > 0 ? 1 : 0);
