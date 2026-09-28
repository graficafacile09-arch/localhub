/**
 * VERIFICA BROWSER REALE — PRESENTAZIONE DI PINO (PinoHomepageHelper).
 *
 * Misura e verifica i requisiti della UI, su desktop e mobile:
 *   - il fumetto è compatto (altezza/larghezza contenute);
 *   - nessuno spazio vuoto percepibile tra fumetto e personaggio (misurato
 *     sull'artwork reale di Pino, non sul box del canvas);
 *   - la sagoma di Pino non copre il testo del messaggio;
 *   - il testo è leggibile (dimensione/peso) e ad alto contrasto;
 *   - la X è visibile, ≥ 22px, in un angolo del messaggio che il personaggio
 *     non copre, e chiude TUTTO senza aprire l'assistente;
 *   - il click sul personaggio e sul testo continua ad aprire l'assistente;
 *   - il drag continua a spostare Pino senza aprire l'assistente;
 *   - nessun errore in console e nessuna regressione della barra di ricerca.
 *
 * Uso: node scripts/__verify-pino-presentazione.mjs [--url http://localhost:3110]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base =
  process.argv.find((a, i) => process.argv[i - 1] === "--url") || "http://localhost:3110";

const SEL_WIDGET = '[aria-label="Pino, assistente di InCittà"]';
const SEL_PANEL = 'button[aria-label="Chiudi assistente"]';
const SEL_X = 'button[aria-label="Chiudi Pino"]';
const SEL_SPRITE = '[aria-label="Apri l\'assistente AI"]';
const SEL_TESTO = '[aria-label="Apri l\'assistente AI di InCittà"]';

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

/** Metriche reali: fumetto, artwork di Pino (pixel opachi), X e testo. */
async function metriche(page) {
  return page.evaluate(
    ({ selX, selTesto }) => {
      const widget = document.querySelector('[aria-label="Pino, assistente di InCittà"]');
      const x = document.querySelector(selX);
      const card = x?.parentElement ?? null;
      const wrap = widget?.querySelector('[role="button"]') ?? null;
      const canvas = widget?.querySelector("canvas") ?? null;
      const testo = document.querySelector(selTesto);
      const span = testo?.querySelector("span") ?? null;
      if (!widget || !card || !wrap || !canvas || !testo || !span || !x) return null;

      const cs = getComputedStyle(span);
      const cardRect = card.getBoundingClientRect();
      const xRect = x.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const testoRect = testo.getBoundingClientRect();

      // Bordo sinistro dell'ARTWORK di Pino (primo pixel non trasparente del
      // canvas) limitato alle righe che cadono nella fascia del fumetto.
      const ctx = canvas.getContext("2d");
      const cw = canvas.width;
      const ch = canvas.height;
      const data = ctx.getImageData(0, 0, cw, ch).data;
      const scala = canvas.getBoundingClientRect().width / cw;
      let artworkLeft = null;
      for (let y = 0; y < ch; y += 2) {
        const yr = canvas.getBoundingClientRect().top + y * scala;
        if (yr < cardRect.top || yr > cardRect.bottom) continue;
        for (let px = 0; px < cw; px++) {
          if (data[(y * cw + px) * 4 + 3] > 24) {
            const xr = canvas.getBoundingClientRect().left + px * scala;
            if (artworkLeft === null || xr < artworkLeft) artworkLeft = xr;
            break;
          }
        }
      }

      return {
        cardWidth: card.offsetWidth,
        cardHeight: card.offsetHeight,
        fontSize: Number.parseFloat(cs.fontSize),
        fontWeight: Number.parseInt(cs.fontWeight, 10) || 400,
        color: cs.color,
        text: (span.textContent ?? "").trim(),
        backgroundImage: getComputedStyle(card).backgroundImage,
        xWidth: xRect.width,
        xHeight: xRect.height,
        xAria: x.getAttribute("aria-label"),
        xInTopLeft:
          xRect.top < cardRect.top + cardRect.height / 2 &&
          xRect.left < cardRect.left + cardRect.width / 2,
        xInsideCard:
          xRect.left >= cardRect.left - 2 &&
          xRect.right <= cardRect.right + 2 &&
          xRect.top >= cardRect.top - 2 &&
          xRect.bottom <= cardRect.bottom + 2,
        xCopertaDalPersonaggio: xRect.right > wrapRect.left && xRect.left < wrapRect.right,
        cardRect: { top: cardRect.top, bottom: cardRect.bottom, left: cardRect.left, right: cardRect.right },
        testoRight: testoRect.right,
        artworkLeft,
        spazioTraFumettoEPino: artworkLeft === null ? null : artworkLeft - cardRect.right,
        artworkCopreTesto: artworkLeft === null ? null : artworkLeft < testoRect.right,
        wrapLeft: wrapRect.left,
        personaggioAltezza: canvas.getBoundingClientRect().height,
      };
    },
    { selX: SEL_X, selTesto: SEL_TESTO }
  );
}

async function apriHome(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(SEL_WIDGET).first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function pannelloAperto(page, timeout = 8000) {
  return page
    .locator(SEL_PANEL)
    .first()
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

const browser = await chromium.launch();
const erroriConsole = [];

try {
  // ── DESKTOP ────────────────────────────────────────────────────────────────
  console.log("\n── A. DESKTOP (1280x900) ────────────────────────────────────────");
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  desktop.on("console", (m) => {
    if (m.type() === "error") erroriConsole.push(m.text().slice(0, 160));
  });
  await apriHome(desktop);

  let m = await metriche(desktop);
  check("fumetto di presentazione presente", !!m);
  if (!m) throw new Error("fumetto non trovato");

  check("testo invariato nel significato", m.text === "Ciao sono Pino, chatta con me.", `"${m.text}"`);
  check("fumetto compatto (larghezza ≤ 200px)", m.cardWidth <= 200, `${m.cardWidth}px`);
  check("fumetto compatto (altezza ≤ 64px)", m.cardHeight <= 64, `${m.cardHeight}px`);
  check(
    "nessuno spazio vuoto tra fumetto e personaggio (≤ 10px)",
    m.spazioTraFumettoEPino !== null && m.spazioTraFumettoEPino <= 10,
    `${m.spazioTraFumettoEPino === null ? "n/d" : `${Math.round(m.spazioTraFumettoEPino)}px`}`
  );
  check(
    "il personaggio non copre il testo del messaggio",
    m.artworkCopreTesto === false,
    `artwork ${m.artworkLeft === null ? "n/d" : Math.round(m.artworkLeft)} / testo fino a ${Math.round(m.testoRight)}`
  );
  check("testo più grande (≥ 12px)", m.fontSize >= 12, `${m.fontSize}px`);
  check("testo in grassetto (≥ 700)", m.fontWeight >= 700, `${m.fontWeight}`);
  check("contrasto: testo bianco su fondo scuro di Pino", m.color === "rgb(255, 255, 255)", m.color);
  check("gradiente coerente con l'interfaccia di Pino", /gradient/.test(m.backgroundImage));
  check("X presente e accessibile", m.xAria === "Chiudi Pino", String(m.xAria));
  check("X cliccabile (≥ 22px)", m.xWidth >= 22 && m.xHeight >= 22, `${Math.round(m.xWidth)}x${Math.round(m.xHeight)}`);
  check("X in un angolo del messaggio", m.xInTopLeft && m.xInsideCard);
  check("X non coperta dal personaggio", m.xCopertaDalPersonaggio === false);

  mkdirSync("screenshots", { recursive: true });
  await desktop.screenshot({ path: "screenshots/pino-presentazione-desktop.png" });

  await desktop.locator(SEL_SPRITE).first().click();
  check("click sul personaggio apre l'assistente", await pannelloAperto(desktop));
  await desktop.locator(SEL_PANEL).first().click();
  await desktop.waitForTimeout(300);

  await desktop.reload({ waitUntil: "domcontentloaded" });
  await desktop.locator(SEL_TESTO).first().click();
  check("click sul messaggio apre l'assistente", await pannelloAperto(desktop));
  await desktop.locator(SEL_PANEL).first().click();
  await desktop.waitForTimeout(300);

  await desktop.reload({ waitUntil: "domcontentloaded" });
  const sprite = desktop.locator(SEL_SPRITE).first();
  await sprite.waitFor({ state: "visible" });
  const box = await sprite.boundingBox();
  await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2 - 40, { steps: 8 });
  await desktop.mouse.up();
  await desktop.waitForTimeout(400);
  const trasformato = await desktop
    .locator(SEL_WIDGET)
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
  check("drag: Pino si sposta", /matrix\(1, 0, 0, 1, -7/.test(trasformato), trasformato);
  check("drag: non apre l'assistente", (await desktop.locator(SEL_PANEL).count()) === 0);

  await desktop.reload({ waitUntil: "domcontentloaded" });
  await desktop.locator(SEL_WIDGET).first().waitFor({ state: "visible" });
  await desktop.locator(SEL_X).first().click();
  await desktop.waitForTimeout(500);
  check("click sulla X chiude completamente la presentazione", (await desktop.locator(SEL_WIDGET).count()) === 0);
  check("click sulla X non apre l'assistente", (await desktop.locator(SEL_PANEL).count()) === 0);

  // ── REGRESSIONE BARRA DI RICERCA ───────────────────────────────────────────
  console.log("\n── B. REGRESSIONE BARRA DI RICERCA ──────────────────────────────");
  await desktop.goto(base, { waitUntil: "domcontentloaded" });
  const inputCerca = desktop.locator('form[action="/ricerca"] input[name="q"]').first();
  await inputCerca.fill("cerco una pizzeria");
  await inputCerca.press("Enter");
  await desktop.waitForURL(/\/ricerca\?q=/, { timeout: 20000 }).catch(() => {});
  await desktop.waitForTimeout(1500);
  check("la ricerca commerciale funziona", /\/ricerca\?q=cerco\+una\+pizzeria/.test(desktop.url()), desktop.url());

  // ── MOBILE ─────────────────────────────────────────────────────────────────
  console.log("\n── C. MOBILE (390x844) ──────────────────────────────────────────");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on("console", (m) => {
    if (m.type() === "error") erroriConsole.push(m.text().slice(0, 160));
  });
  await apriHome(mobile);

  m = await metriche(mobile);
  check("mobile: fumetto presente", !!m);
  if (m) {
    check("mobile: fumetto compatto (≤ 200px)", m.cardWidth <= 200, `${m.cardWidth}px`);
    check("mobile: fumetto basso (≤ 64px)", m.cardHeight <= 64, `${m.cardHeight}px`);
    check(
      "mobile: nessuno spazio vuoto con Pino (≤ 10px)",
      m.spazioTraFumettoEPino !== null && m.spazioTraFumettoEPino <= 10,
      `${m.spazioTraFumettoEPino === null ? "n/d" : `${Math.round(m.spazioTraFumettoEPino)}px`}`
    );
    check("mobile: il personaggio non copre il testo", m.artworkCopreTesto === false);
    check("mobile: testo leggibile (≥ 12px, bold)", m.fontSize >= 12 && m.fontWeight >= 700, `${m.fontSize}px / ${m.fontWeight}`);
    check("mobile: X cliccabile (≥ 22px)", m.xWidth >= 22 && m.xHeight >= 22, `${Math.round(m.xWidth)}x${Math.round(m.xHeight)}`);
    check("mobile: X non coperta dal personaggio", m.xCopertaDalPersonaggio === false);

    const ricerca = await mobile.locator('form[action="/ricerca"] input[name="q"]').first().boundingBox();
    const sovrapposto =
      ricerca &&
      m.cardRect.left < ricerca.x + ricerca.width &&
      m.cardRect.right > ricerca.x &&
      m.cardRect.top < ricerca.y + ricerca.height &&
      m.cardRect.bottom > ricerca.y;
    check("mobile: il fumetto NON copre il campo di ricerca", !sovrapposto);
    check("mobile: Pino resta ben visibile (≥ 70px)", m.personaggioAltezza >= 70, `${Math.round(m.personaggioAltezza)}px`);
  }

  await mobile.screenshot({ path: "screenshots/pino-presentazione-mobile.png" });

  await mobile.locator(SEL_X).first().tap();
  await mobile.waitForTimeout(500);
  check("mobile: la X chiude la presentazione", (await mobile.locator(SEL_WIDGET).count()) === 0);

  console.log("\n── D. CONSOLE ───────────────────────────────────────────────────");
  const errori = erroriConsole.filter((t) => !/favicon|Failed to load resource|net::ERR/i.test(t));
  check("nessun errore JS in console", errori.length === 0, errori.join(" | "));
} finally {
  await browser.close();
}

console.log(`\nRISULTATO: ${passati} OK, ${falliti} FAIL`);
process.exit(falliti > 0 ? 1 : 0);
