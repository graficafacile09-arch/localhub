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
 * Per il Pino della HOMEPAGE verifica inoltre:
 *   - l'asset statico dedicato (4x) è quello servito e viene caricato;
 *   - le proporzioni del disegno non sono deformate;
 *   - il personaggio è più grande di prima su desktop e mobile;
 *   - il ritaglio non lascia residui di fondo opachi né un velo di bordo
 *     (analisi dei pixel reali dell'asset decodificato dal browser);
 *   - la transizione del bordo resta di pochi pixel.
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
      const img = widget?.querySelector("img") ?? null;
      const canvas = widget?.querySelector("canvas") ?? null;
      const testo = document.querySelector(selTesto);
      const span = testo?.querySelector("span") ?? null;
      if (!widget || !card || !wrap || !img || !testo || !span || !x) return null;

      const cs = getComputedStyle(span);
      const cardRect = card.getBoundingClientRect();
      const xRect = x.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const testoRect = testo.getBoundingClientRect();

      // Bordo sinistro dell'ARTWORK di Pino: primo pixel non trasparente
      // dell'asset, riletto dal canale alpha dell'immagine decodificata e
      // riportato in coordinate schermo. Limitato alle righe che cadono nella
      // fascia del fumetto.
      const imgRect = img.getBoundingClientRect();
      const off = document.createElement("canvas");
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      const octx = off.getContext("2d", { willReadFrequently: true });
      octx.drawImage(img, 0, 0);
      const od = octx.getImageData(0, 0, off.width, off.height).data;
      let artworkLeft = null;
      for (let y = 0; y < off.height; y += 2) {
        const yr = imgRect.top + (y / off.height) * imgRect.height;
        if (yr < cardRect.top || yr > cardRect.bottom) continue;
        for (let px = 0; px < off.width; px++) {
          if (od[(y * off.width + px) * 4 + 3] > 24) {
            const xr = imgRect.left + (px / off.width) * imgRect.width;
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
        personaggioAltezza: imgRect.height,
        personaggioLarghezza: imgRect.width,
        proporzioni: imgRect.width / imgRect.height,
        asset: {
          src: new URL(img.currentSrc || img.src, location.href).pathname,
          natural: [img.naturalWidth, img.naturalHeight],
          caricato: img.complete && img.naturalWidth > 0,
          canvasRuntime: canvas !== null,
        },
      };
    },
    { selX: SEL_X, selTesto: SEL_TESTO }
  );
}

/**
 * ALONE / RESIDUI GRIGI — controlla i pixel reali dell'asset decodificato dal
 * browser (canale alpha compreso), non il canvas a runtime.
 *
 * Un residuo è un pixel completamente opaco il cui colore è ancora quello del
 * fondo. Un "velo" è un pixel visibile (alfa >= 0.5) ancora colorato come il
 * fondo: su un fondo diverso diventerebbe un alone grigio. Su un ritaglio
 * professionale entrambi restano a quote trascurabili.
 */
async function analisiAlone(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('[aria-label="Pino, assistente di InCittà"] img');
    if (!img) return null;
    if (!img.complete) await img.decode().catch(() => {});
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, off.width, off.height).data;
    const FONDI = [
      [235, 240, 245], // fondo chiaro della homepage
      [255, 255, 255], // pagina bianca
    ];
    const vicino = (r, g, b, t) =>
      FONDI.some((f) => Math.hypot(r - f[0], g - f[1], b - f[2]) < t);
    let opachi = 0;
    let residui = 0;
    let visibili = 0; // alfa >= 0.5: pixel che si vedono sul fondo
    let velo = 0; // ...e che hanno ancora il colore del fondo (velo grigio)
    let bordo = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      const fondo = vicino(d[i], d[i + 1], d[i + 2], 24);
      if (a >= 250) {
        opachi++;
        if (fondo) residui++;
      } else if (a > 10) {
        bordo++;
      }
      if (a >= 128) {
        visibili++;
        if (fondo) velo++;
      }
    }
    return { opachi, residui, visibili, velo, bordo };
  });
}

/**
 * Profilo del bordo: cammina dal fuori verso il personaggio e misura quanti
 * pixel "franchi" (né fondo né disegno) ci sono. Un taglio professionale ha
 * una transizione breve; il vecchio ritaglio lasciava un alone piu spesso.
 */
async function profiloBordo(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('[aria-label="Pino, assistente di InCittà"] img');
    if (!img) return null;
    if (!img.complete) await img.decode().catch(() => {});
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, off.width, off.height).data;
    const H = off.height;
    let larghezzaMax = 0;
    let somma = 0;
    let righe = 0;
    for (let y = 2; y < H - 2; y += 2) {
      let prima = -1;
      let ultima = -1;
      for (let x = 0; x < off.width; x++) {
        if (d[(y * off.width + x) * 4 + 3] > 8) {
          if (prima < 0) prima = x;
          ultima = x;
        }
      }
      if (prima < 0) continue;
      // quanti pixel semitrasparenti (10..250) compongono la transizione
      let soft = 0;
      for (let x = prima; x <= Math.min(ultima, prima + 6); x++) {
        const a = d[(y * off.width + x) * 4 + 3];
        if (a > 10 && a < 250) soft++;
      }
      larghezzaMax = Math.max(larghezzaMax, soft);
      somma += soft;
      righe++;
    }
    return { transizioneMedia: righe ? somma / righe : 0, transizioneMax: larghezzaMax };
  });
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

  // ── ASSET HOMEPAGE: PIÙ GRANDE, PIÙ NITIDO, SCONTORNATO ────────────────────
  console.log("\n── A2. ASSET DEL PINO DELLA HOMEPAGE ────────────────────────────");
  const attese = 320 / 488; // proporzioni reali dell'asset (4x di un disegno 76x118)
  check("Pino usa l'asset statico dedicato", m.asset.src === "/pino-home.png", m.asset.src);
  check("asset caricato dal browser", m.asset.caricato, m.asset.natural.join("x"));
  check(
    "asset ad alta risoluzione (4x del disegno originale)",
    m.asset.natural[0] === 320 && m.asset.natural[1] === 488,
    m.asset.natural.join("x")
  );
  check("nessun canvas a runtime sulla homepage", m.asset.canvasRuntime === false);
  check(
    "proporzioni corrette: nessuna deformazione",
    Math.abs(m.proporzioni - attese) / attese < 0.015,
    `${m.proporzioni.toFixed(3)} vs ${attese.toFixed(3)}`
  );
  check(
    "Pino più grande di prima (≥ 210px su desktop)",
    m.personaggioAltezza >= 210,
    `${Math.round(m.personaggioAltezza)}px (prima ~184px)`
  );

  const alone = await analisiAlone(desktop);
  const quotaResidui = alone ? alone.residui / Math.max(1, alone.opachi) : 1;
  check(
    "scontorno: nessun residuo di fondo opaco (< 0.5%)",
    quotaResidui < 0.005,
    alone ? `${alone.residui} su ${alone.opachi} px opachi (${(quotaResidui * 100).toFixed(2)}%)` : "n/d"
  );
  const quotaVelo = alone ? alone.velo / Math.max(1, alone.visibili) : 1;
  check(
    "scontorno: nessun velo grigio visibile (< 3%)",
    quotaVelo < 0.03,
    alone ? `${alone.velo} su ${alone.visibili} px visibili (${(quotaVelo * 100).toFixed(2)}%)` : "n/d"
  );
  const prof = await profiloBordo(desktop);
  check(
    "bordo netto: transizione entro l'antialiasing (≤ 8px su 4x)",
    !!prof && prof.transizioneMax <= 8,
    prof ? `media ${prof.transizioneMedia.toFixed(2)} / max ${prof.transizioneMax}` : "n/d"
  );

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
    check(
      "mobile: Pino più grande di prima (≥ 100px)",
      m.personaggioAltezza >= 100,
      `${Math.round(m.personaggioAltezza)}px (prima 92px)`
    );
    check(
      "mobile: proporzioni corrette",
      Math.abs(m.proporzioni - attese) / attese < 0.015,
      m.proporzioni.toFixed(3)
    );
    const aloneM = await analisiAlone(mobile);
    check(
      "mobile: scontorno senza residui né velo di bordo",
      !!aloneM &&
        aloneM.residui / Math.max(1, aloneM.opachi) < 0.005 &&
        aloneM.velo / Math.max(1, aloneM.visibili) < 0.03,
      aloneM
        ? `residui ${(100 * aloneM.residui / aloneM.opachi).toFixed(2)}%, velo ${(100 * aloneM.velo / aloneM.visibili).toFixed(2)}%`
        : "n/d"
    );

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

  // ── ZOOM SUL BORDO: CAPELLI E SPAZIO FRA LE GAMBE ──────────────────────────
  console.log("\n── E. ZOOM SUL RITAGLIO (desktop 3x) ────────────────────────────");
  const zoom = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 3,
  });
  await apriHome(zoom);
  const zb = await zoom.locator(SEL_SPRITE).first().boundingBox();
  if (zb) {
    const mx = 8;
    const clip = {
      x: Math.max(0, zb.x - mx),
      y: Math.max(0, zb.y - mx),
      width: Math.min(zb.width + 2 * mx, 1280 - Math.max(0, zb.x - mx)),
      height: Math.min(zb.height + 2 * mx, 900 - Math.max(0, zb.y - mx)),
    };
    await zoom.screenshot({ path: "screenshots/pino-homepage-zoom-desktop.png", clip });
    check("zoom 3x catturato per il controllo visivo del bordo", true, `${Math.round(clip.width)}x${Math.round(clip.height)} css px`);
  } else {
    check("zoom 3x catturato per il controllo visivo del bordo", false, "personaggio non trovato");
  }

  console.log("\n── D. CONSOLE ───────────────────────────────────────────────────");
  const errori = erroriConsole.filter((t) => !/favicon|Failed to load resource|net::ERR/i.test(t));
  check("nessun errore JS in console", errori.length === 0, errori.join(" | "));
} finally {
  await browser.close();
}

console.log(`\nRISULTATO: ${passati} OK, ${falliti} FAIL`);
process.exit(falliti > 0 ? 1 : 0);
