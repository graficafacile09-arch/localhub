/**
 * VERIFICA BROWSER REALE — ART DIRECTION v2.
 *
 * Apre realmente le pagine pubbliche su desktop (1440x900) e mobile (390x844),
 * salva screenshot full-page e viewport in screenshots/v2/, e controlla:
 *  - nessuno scroll orizzontale
 *  - header a due fasce presente
 *  - hero e sezioni principali renderizzate
 *  - zero errori JS/React in console
 *
 * Uso: node scripts/__verify-design-v2.mjs [--base http://localhost:3000]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base =
  process.argv.find((a, i) => process.argv[i - 1] === "--base") ||
  process.env.BASE_URL ||
  "http://localhost:3000";

const OUT = "screenshots/v2";
mkdirSync(OUT, { recursive: true });

const erroriConsole = [];
let problemi = 0;

function check(nome, ok, dettaglio = "") {
  if (ok) {
    console.log(`  [OK] ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  } else {
    problemi++;
    console.log(`  [FAIL] ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  }
}

const PAGINE = [
  { id: "home", path: "/" },
  { id: "negozi", path: "/negozi" },
  { id: "categorie", path: "/categorie" },
  { id: "offerte", path: "/offerte" },
  { id: "carrello", path: "/carrello" },
  { id: "checkout", path: "/checkout" },
];

async function scatta(page, id, viewport, extra = {}) {
  await page.goto(`${base}${extra.path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1200);

  const ov = await page.evaluate(() => {
    const scrollWidth = document.scrollingElement.scrollWidth;
    const clientWidth = document.scrollingElement.clientWidth;
    const colpevoli = [];
    if (scrollWidth > clientWidth + 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > clientWidth + 1 && r.width > 0) {
          colpevoli.push(
            `${el.tagName}.${String(el.className).slice(0, 60)} w=${Math.round(r.width)} right=${Math.round(r.right)}`
          );
          if (colpevoli.length >= 6) break;
        }
      }
    }
    return { scrollWidth, clientWidth, colpevoli };
  });
  check(
    `${id} ${viewport}: nessuno scroll orizzontale`,
    ov.scrollWidth <= ov.clientWidth + 1,
    `${ov.scrollWidth}/${ov.clientWidth} ${ov.colpevoli.join(" || ")}`
  );

  const header = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
    const search = document.querySelector('form[action="/ricerca"]');
    return { nav: Boolean(nav), search: Boolean(search) };
  });
  check(`${id} ${viewport}: header a due fasce (nav + ricerca)`, header.nav && header.search);

  const mainAltezza = await page.evaluate(() => {
    const main = document.querySelector("main");
    return main ? Math.round(main.getBoundingClientRect().height) : 0;
  });
  check(`${id} ${viewport}: contenuto renderizzato`, mainAltezza > 400, `${mainAltezza}px`);

  await page.screenshot({
    path: `${OUT}/${id}-${viewport}.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `${OUT}/${id}-${viewport}-top.png`,
    fullPage: false,
  });
}

const browser = await chromium.launch({ channel: "chrome" });

// ── Desktop ─────────────────────────────────────────────────────────────────
const ctxDesktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
ctxDesktop.on("page", (p) => {
  p.on("console", (m) => {
    if (m.type() === "error") erroriConsole.push(`[desktop] ${m.text()}`);
  });
  p.on("pageerror", (e) => erroriConsole.push(`[desktop] ${String(e)}`));
});
const page = await ctxDesktop.newPage();
page.on("console", (m) => {
  if (m.type() === "error") erroriConsole.push(`[desktop] ${m.text()}`);
});
page.on("pageerror", (e) => erroriConsole.push(`[desktop] ${String(e)}`));

// Modalità ospite esplicita: /checkout richiede guest o login.
await ctxDesktop.addCookies([
  { name: "lh_guest", value: "1", domain: "localhost", path: "/" },
]);

console.log("\n== DESKTOP 1440x900 ==");
for (const p of PAGINE) {
  await scatta(page, p.id, "desktop", p);
}

// Pagina prodotto reale: scoperta dal primo link /prodotto/ della home.
await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
const prodottoHref = await page.evaluate(() => {
  const a = document.querySelector('a[href^="/prodotto/"]');
  return a ? a.getAttribute("href") : null;
});
if (prodottoHref) {
  console.log(`  (pagina prodotto: ${prodottoHref})`);
  await scatta(page, "prodotto", "desktop", { path: prodottoHref });
} else {
  console.log("  (nessun link prodotto in home: salto la pagina prodotto)");
}

// ── Mobile ──────────────────────────────────────────────────────────────────
const ctxMobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctxMobile.addCookies([
  { name: "lh_guest", value: "1", domain: "localhost", path: "/" },
]);
const mp = await ctxMobile.newPage();
mp.on("console", (m) => {
  if (m.type() === "error") erroriConsole.push(`[mobile] ${m.text()}`);
});
mp.on("pageerror", (e) => erroriConsole.push(`[mobile] ${String(e)}`));

console.log("\n== MOBILE 390x844 ==");
for (const p of PAGINE) {
  await scatta(mp, p.id, "mobile", p);
}

// Carrello e checkout CON articoli (flusso reale: aggiungi dal prodotto).
if (prodottoHref) {
  console.log("\n== CARRELLO / CHECKOUT CON ARTICOLI ==");
  await page.goto(`${base}${prodottoHref}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const aggiungi = page.getByRole("button", { name: /aggiungi.*al carrello/i }).first();
  if ((await aggiungi.count()) > 0) {
    await aggiungi.click();
    await page.waitForTimeout(900);
    await scatta(page, "carrello-pieno", "desktop", { path: "/carrello" });
    await scatta(page, "checkout-form", "desktop", { path: "/checkout" });

    await mp.goto(`${base}${prodottoHref}`, { waitUntil: "domcontentloaded" });
    await mp.waitForTimeout(800);
    const aggiungiM = mp.getByRole("button", { name: /aggiungi.*al carrello/i }).first();
    if ((await aggiungiM.count()) > 0) {
      await aggiungiM.click();
      await mp.waitForTimeout(900);
      await scatta(mp, "carrello-pieno", "mobile", { path: "/carrello" });
      await scatta(mp, "checkout-form", "mobile", { path: "/checkout" });
    }
  } else {
    console.log("  (pulsante Aggiungi al carrello non trovato)");
  }
}

console.log("\n== CONSOLE ==");
check("zero errori JavaScript/React in console", erroriConsole.length === 0, erroriConsole.slice(0, 4).join(" | "));

await ctxDesktop.close();
await ctxMobile.close();
await browser.close();

console.log(`\nRISULTATO: ${problemi === 0 ? "tutti i controlli superati" : `${problemi} problemi`}`);
process.exit(problemi ? 1 : 0);
