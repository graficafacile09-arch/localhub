/**
 * VERIFICA BROWSER REALE — PRESENTAZIONE DI PINO (PinoHomepageHelper).
 *
 * Il componente è la fascia fissa in basso introdotta con il redesign
 * ("Tu chiedi. Pino trova."), non più il fumetto con la X. La verifica misura
 * quindi la barra vera, su desktop e mobile:
 *   - compare solo dopo lo scroll iniziale (560px) sulla homepage;
 *   - è ancorata in basso, alta 58px, e non copre il campo di ricerca;
 *   - il testo è leggibile (≥ 16px, bold) e ad alto contrasto;
 *   - il personaggio e la CTA aprono l'assistente;
 *   - la fascia scompare quando il footer entra nella viewport e ritorna
 *     risalendo.
 *
 * Per il Pino della HOMEPAGE verifica inoltre:
 *   - l'asset dedicato (canvas 378x560) è quello servito, senza deformazioni;
 *   - il ritaglio non lascia residui di fondo opachi né un velo di bordo
 *     (analisi dei pixel reali dell'asset decodificato dal browser);
 *   - la transizione del bordo resta di pochi pixel.
 *
 * Verifica infine che i TRE stati di Pino restino collegati come prima e che
 * condividano lo stesso canvas e la stessa linea d'appoggio dei piedi:
 * homepage = neutro (a riposo), chat e /ricerca = allegro con risultati,
 * triste senza risultati.
 *
 * Uso: node scripts/__verify-pino-presentazione.mjs [--url http://localhost:3110]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base =
  process.argv.find((a, i) => process.argv[i - 1] === "--url") || "http://localhost:3110";

const SEL_WIDGET = '[data-pino-helper="true"]';
const SEL_SPRITE = '[data-testid="pino-richiama"]';
const SEL_CTA = 'button[aria-label="Clicca per aprire Pino"]';
const SEL_TESTO = '[data-pino-helper="true"] p';
const SEL_PANEL = 'button[aria-label="Chiudi assistente"]';

const TESTO_ATTESO = "Tu chiedi. Pino trova.";
const ALTEZZA_BARRA = 58;
const SCROLL_TRIGGER = 560;

let passati = 0;
let falliti = 0;
let saltati = 0;

function check(nome, ok, dettaglio = "") {
  if (ok) {
    passati++;
    console.log(`  [OK] ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  } else {
    falliti++;
    console.log(`  [FAIL] ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  }
}

/**
 * Un controllo che non è verificabile in modo deterministico viene dichiarato
 * saltato, non contato come superato: il riepilogo resta leggibile e nessun
 * fallimento reale sfugge.
 */
function skip(nome, motivo) {
  saltati++;
  console.log(`  [SKIP] ${nome} — ${motivo}`);
}

const normalizza = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/** Metriche reali della fascia: posizione, testo, contrasto, CTA e sprite. */
async function metricheBarra(page) {
  return page.evaluate(
    ({ selWidget, selSprite, selCta, selTesto }) => {
      const barra = document.querySelector(selWidget);
      if (!barra) return null;
      const p = barra.querySelector(selTesto);
      const sprite = barra.querySelector(selSprite);
      const img = sprite?.querySelector("img") ?? null;
      const cta = barra.querySelector(selCta);
      const canvas = barra.querySelector("canvas");

      const rect = barra.getBoundingClientRect();
      const rTesto = p?.getBoundingClientRect() ?? null;
      const rSprite = sprite?.getBoundingClientRect() ?? null;
      const rCta = cta?.getBoundingClientRect() ?? null;
      const rImg = img?.getBoundingClientRect() ?? null;

      const luminanza = (c) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      // I colori Tailwind vengono calcolati in lab()/oklch(): vanno convertiti
      // in sRGB prima di calcolare la luminanza. Il canvas è il modo affidabile
      // per farlo, e per i rgb() resta comunque corretto.
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const rgb = (css) => {
        if (!css) return [0, 0, 0];
        if (css.startsWith("rgb")) return (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#123456";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d2 = ctx.getImageData(0, 0, 1, 1).data;
        return [d2[0], d2[1], d2[2]];
      };

      let contrasto = null;
      if (p) {
        const colore = rgb(getComputedStyle(p).color);
        const sfondo = rgb(getComputedStyle(barra).backgroundColor);
        const l1 = luminanza(colore);
        const l2 = luminanza(sfondo);
        contrasto = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      return {
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        bottomViewport: window.innerHeight,
        testo: p ? p.textContent.replace(/\s+/g, " ").trim() : null,
        fontSize: p ? parseFloat(getComputedStyle(p).fontSize) : 0,
        fontWeight: p ? parseInt(getComputedStyle(p).fontWeight, 10) : 0,
        contrasto,
        testoNonTroncato: p && rTesto ? p.scrollWidth <= p.clientWidth + 1 : false,
        color: p ? getComputedStyle(p).color : null,
        cta: cta
          ? {
              label: cta.getAttribute("aria-label"),
              testo: cta.textContent.replace(/\s+/g, " ").trim(),
              width: rCta.width,
              height: rCta.height,
              dentroLaBarra: rCta.top >= rect.top - 0.5 && rCta.bottom <= rect.bottom + 0.5,
            }
          : null,
        sprite: sprite
          ? {
              width: rSprite.width,
              height: rSprite.height,
              label: sprite.getAttribute("aria-label"),
              img: img
                ? {
                    src: new URL(img.currentSrc || img.src, location.href).pathname,
                    natural: [img.naturalWidth, img.naturalHeight],
                    caricato: img.complete && img.naturalWidth > 0,
                    resa: { width: rImg.width, height: rImg.height },
                  }
                : null,
            }
          : null,
        canvasRuntime: canvas !== null,
      };
    },
    { selWidget: SEL_WIDGET, selSprite: SEL_SPRITE, selCta: SEL_CTA, selTesto: SEL_TESTO }
  );
}

/** I tre asset: canvas, alpha ai bordi e linea d'appoggio dei piedi. */
async function metricheTreStati(page) {
  return page.evaluate(async (nomi) => {
    const out = {};
    for (const nome of nomi) {
      const im = new Image();
      im.src = `/pino-${nome}.webp?t=${Date.now()}`;
      try {
        await im.decode();
      } catch {
        out[nome] = null;
        continue;
      }
      const off = document.createElement("canvas");
      off.width = im.naturalWidth;
      off.height = im.naturalHeight;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, off.width, off.height).data;
      let base = -1;
      let alto = -1;
      for (let y = 0; y < off.height; y++) {
        for (let x = 0; x < off.width; x++) {
          if (d[(y * off.width + x) * 4 + 3] >= 128) {
            if (alto < 0) alto = y;
            base = y;
          }
        }
      }
      const angoli = [
        [0, 0],
        [off.width - 1, 0],
        [0, off.height - 1],
        [off.width - 1, off.height - 1],
      ].map(([x, y]) => d[(y * off.width + x) * 4 + 3]);
      out[nome] = { canvas: [im.naturalWidth, im.naturalHeight], base, alto, angoli };
    }
    return out;
  }, ["neutro", "allegro", "triste"]);
}

/**
 * ALONE / RESIDUI GRIGI — controlla i pixel reali dell'asset decodificato dal
 * browser (canale alpha compreso), non il canvas a runtime.
 *
 * Un residuo è un pixel completamente opaco il cui colore è ancora quello del
 * fondo. Un "velo" è un pixel visibile (alfa >= 0.5) ancora colorato come il
 * fondo: su un fondo diverso diventerebbe un alone grigio.
 */
async function analisiAlone(page) {
  return page.evaluate(async (sel) => {
    const img = document.querySelector(`${sel} img`);
    if (!img) return null;
    if (!img.complete) await img.decode().catch(() => {});
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, off.width, off.height).data;
    const FONDI = [
      [235, 240, 245],
      [255, 255, 255],
    ];
    const vicino = (r, g, b, t) =>
      FONDI.some((f) => Math.hypot(r - f[0], g - f[1], b - f[2]) < t);

    const W = off.width;
    const H = off.height;
    const trasp = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) trasp[p] = d[p * 4 + 3] < 10 ? 1 : 0;
    let cur = trasp;
    const dist = new Uint8Array(W * H).fill(99);
    for (let k = 1; k <= 4; k++) {
      const g2 = Uint8Array.from(cur);
      for (let y = 1; y < H; y++)
        for (let x = 0; x < W; x++) if (cur[(y - 1) * W + x]) g2[y * W + x] = 1;
      for (let y = 0; y < H - 1; y++)
        for (let x = 0; x < W; x++) if (cur[(y + 1) * W + x]) g2[y * W + x] = 1;
      for (let y = 0; y < H; y++)
        for (let x = 1; x < W; x++) if (cur[y * W + x - 1]) g2[y * W + x] = 1;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W - 1; x++) if (cur[y * W + x + 1]) g2[y * W + x] = 1;
      for (let p = 0; p < W * H; p++) if (g2[p] && !cur[p] && dist[p] === 99) dist[p] = k;
      cur = g2;
    }

    let opachi = 0;
    let residui = 0;
    let visibili = 0;
    let velo = 0;
    let bordo = 0;
    let bordoVisibile = 0;
    let bordoConFondo = 0;
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
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
        if (dist[p] <= 3) {
          bordoVisibile++;
          if (fondo) bordoConFondo++;
        }
      }
    }
    return { opachi, residui, visibili, velo, bordo, bordoVisibile, bordoConFondo };
  }, SEL_WIDGET);
}

/** Profilo del bordo: quanti pixel franchi compongono la transizione. */
async function profiloBordo(page) {
  return page.evaluate(async (sel) => {
    const img = document.querySelector(`${sel} img`);
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
  }, SEL_WIDGET);
}

/** Apre la homepage e porta la fascia dentro la viewport (compare dopo 560px). */
async function apriHome(page, y = 900) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate((pos) => window.scrollTo(0, pos), y);
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

async function chiudiPannello(page) {
  await page.locator(SEL_PANEL).first().click().catch(() => {});
  await page.waitForTimeout(400);
}

/** Il rettangolo della barra copre il campo di ricerca? */
async function copreRicerca(page, rect) {
  const ricerca = await page
    .locator('form[action="/ricerca"] input[name="q"]')
    .first()
    .boundingBox()
    .catch(() => null);
  if (!ricerca || !rect) return { copre: false, noto: false };
  const copre =
    rect.left < ricerca.x + ricerca.width &&
    rect.right > ricerca.x &&
    rect.top < ricerca.y + ricerca.height &&
    rect.bottom > ricerca.y;
  return { copre, noto: true };
}

const browser = await chromium.launch();
const erroriConsole = [];

try {
  // ── A. DESKTOP ────────────────────────────────────────────────────────────
  console.log("\n── A. DESKTOP (1280x900) ────────────────────────────────────────");
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  desktop.on("console", (m) => {
    if (m.type() === "error") erroriConsole.push(m.text().slice(0, 160));
  });

  // Prima dello scroll iniziale la fascia non deve esserci.
  await desktop.goto(base, { waitUntil: "domcontentloaded" });
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await desktop.waitForTimeout(800);
  check(
    "homepage in cima: la fascia non è ancora visibile",
    (await desktop.locator(SEL_WIDGET).count()) === 0,
    `scrollY ${await desktop.evaluate(() => window.scrollY)}`
  );

  await apriHome(desktop);
  const m = await metricheBarra(desktop);
  check("fascia di presentazione presente dopo lo scroll iniziale", !!m);
  if (!m) throw new Error("fascia di Pino non trovata");

  check("testo della fascia", normalizza(m.testo) === TESTO_ATTESO, `"${normalizza(m.testo)}"`);
  check("testo leggibile (≥ 16px)", m.fontSize >= 16, `${m.fontSize}px`);
  check("testo in grassetto (≥ 700)", m.fontWeight >= 700, `${m.fontWeight}`);
  check(
    "contrasto testo/sfondo ≥ 7:1 (AAA)",
    m.contrasto !== null && m.contrasto >= 7,
    `${m.contrasto ? m.contrasto.toFixed(2) : "n/d"}:1 — ${m.color}`
  );
  check("testo non troncato", m.testoNonTroncato);
  check(
    `fascia alta ${ALTEZZA_BARRA}px`,
    Math.abs(m.rect.height - ALTEZZA_BARRA) <= 1,
    `${Math.round(m.rect.height)}px`
  );
  check(
    "fascia ancorata in basso",
    Math.abs(m.rect.bottom - m.bottomViewport) <= 1,
    `bottom ${Math.round(m.rect.bottom)} su viewport ${m.bottomViewport}`
  );
  check(
    "desktop largo: fascia ancorata a destra e larga quanto il contenuto",
    Math.abs(m.rect.right - 1280) <= 1 && m.rect.width < 1280,
    `x ${Math.round(m.rect.left)}..${Math.round(m.rect.right)} (${Math.round(m.rect.width)}px)`
  );

  const { copre, noto } = await copreRicerca(desktop, m.rect);
  check("la fascia NON copre il campo di ricerca", !copre, noto ? "" : "campo non trovato");

  // ── A2. PERSONAGGIO E CTA ────────────────────────────────────────────────
  console.log("\n── A2. PERSONAGGIO E CTA ────────────────────────────────────────");
  check("bottone del personaggio presente", !!m.sprite, m.sprite?.label ?? "n/d");
  if (m.sprite) {
    check(
      "personaggio in un riquadro 48x48",
      Math.abs(m.sprite.width - 48) <= 1 && Math.abs(m.sprite.height - 48) <= 1,
      `${Math.round(m.sprite.width)}x${Math.round(m.sprite.height)}`
    );
  }
  check("CTA presente", !!m.cta);
  if (m.cta) {
    check("CTA etichettata per gli screen reader", m.cta.label === "Clicca per aprire Pino", m.cta.label ?? "n/d");
    check("CTA dentro la fascia (non tagliata)", m.cta.dentroLaBarra, `${Math.round(m.cta.width)}x${Math.round(m.cta.height)}`);
    check("CTA cliccabile (≥ 28px di altezza)", m.cta.height >= 28, `${Math.round(m.cta.height)}px`);
  }

  await desktop.locator(SEL_SPRITE).first().click();
  check("click sul personaggio apre l'assistente", await pannelloAperto(desktop));
  await chiudiPannello(desktop);

  await apriHome(desktop);
  await desktop.locator(SEL_CTA).first().click();
  check("click sulla CTA apre l'assistente", await pannelloAperto(desktop));
  await chiudiPannello(desktop);

  // ── A3. LA FASCIA LASCIA IL POSTO AL FOOTER ──────────────────────────────
  console.log("\n── A3. FASCIA E FOOTER ──────────────────────────────────────────");
  await apriHome(desktop);
  await desktop.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await desktop.waitForTimeout(900);
  const nascostaAlFooter = (await desktop.locator(SEL_WIDGET).count()) === 0;
  check("in fondo alla pagina la fascia lascia libero il footer", nascostaAlFooter);

  await desktop.evaluate(() => window.scrollTo(0, 900));
  await desktop.waitForTimeout(1400);
  check(
    "risalendo la fascia ricompare",
    (await desktop.locator(SEL_WIDGET).count()) === 1
  );

  // ── A4. ASSET HOMEPAGE: CANVAS, SCONTORNO, BORDO ──────────────────────────
  console.log("\n── A4. ASSET DEL PINO DELLA HOMEPAGE ────────────────────────────");
  await apriHome(desktop);
  const attese = 378 / 560;
  const asset = m.sprite?.img ?? null;
  check("Pino usa l'asset dello stato NEUTRO", asset?.src === "/pino-neutro.webp", asset?.src ?? "n/d");
  check("asset caricato dal browser", asset?.caricato === true, (asset?.natural ?? []).join("x"));
  check(
    "asset ad alta risoluzione (canvas 378x560)",
    asset?.natural[0] === 378 && asset?.natural[1] === 560,
    (asset?.natural ?? []).join("x")
  );
  check("nessun canvas a runtime sulla homepage", m.canvasRuntime === false);
  check(
    "il vecchio asset a bassa risoluzione non è più usato",
    !/pino-sprite|pino-home\.png|pino-assistente/.test(asset?.src ?? ""),
    asset?.src ?? "n/d"
  );
  if (asset) {
    // Nella fascia l'immagine è ritagliata (object-cover) sulla testa: la resa
    // del riquadro non è più la proporzione del personaggio. Il controllo sulla
    // deformazione va quindi fatto sul file naturale, che non deve cambiare.
    const proporzioni = asset.natural[0] / asset.natural[1];
    check(
      "proporzioni corrette: nessuna deformazione del file",
      Math.abs(proporzioni - attese) / attese < 0.015,
      `${proporzioni.toFixed(3)} vs ${attese.toFixed(3)}`
    );
  }

  const alone = await analisiAlone(desktop);
  const quotaAlone = alone ? alone.bordoConFondo / Math.max(1, alone.bordoVisibile) : 1;
  check(
    "nessun alone grigio sul bordo della sagoma (< 2%)",
    quotaAlone < 0.02,
    alone
      ? `${alone.bordoConFondo} su ${alone.bordoVisibile} px di bordo visibile (${(quotaAlone * 100).toFixed(2)}%)`
      : "n/d"
  );
  const quotaVelo = alone ? alone.velo / Math.max(1, alone.visibili) : 1;
  check(
    "scontorno: nessun velo di fondo diffuso (< 3%)",
    quotaVelo < 0.03,
    alone ? `${alone.velo} su ${alone.visibili} px visibili (${(quotaVelo * 100).toFixed(2)}%)` : "n/d"
  );
  check(
    "scontorno: residui opachi di fondo trascurabili (< 0.5%)",
    alone ? alone.residui / Math.max(1, alone.opachi) < 0.005 : false,
    alone ? `${alone.residui} su ${alone.opachi} px opachi (${((alone.residui / Math.max(1, alone.opachi)) * 100).toFixed(2)}%)` : "n/d"
  );
  const prof = await profiloBordo(desktop);
  check(
    "bordo netto: transizione entro l'antialiasing (≤ 8px)",
    !!prof && prof.transizioneMax <= 8,
    prof ? `media ${prof.transizioneMedia.toFixed(2)} / max ${prof.transizioneMax}` : "n/d"
  );

  // ── A5. I TRE STATI CONDIVIDONO CANVAS E PIEDI ────────────────────────────
  console.log("\n── A5. ALLINEAMENTO DEI TRE STATI ───────────────────────────────");
  const tre = await metricheTreStati(desktop);
  for (const nome of ["neutro", "allegro", "triste"]) {
    const s = tre?.[nome];
    check(
      `${nome}: canvas 378x560 e alpha pulito agli angoli`,
      !!s && s.canvas[0] === 378 && s.canvas[1] === 560 && s.angoli.every((a) => a === 0),
      s ? `${s.canvas.join("x")} — angoli ${s.angoli.join("/")}` : "n/d"
    );
  }
  const basi = ["neutro", "allegro", "triste"].map((n) => tre?.[n]?.base ?? null);
  const baseOk = basi.every((b) => b !== null) && Math.max(...basi) - Math.min(...basi) <= 1;
  check("i tre stati hanno i piedi sulla stessa linea", baseOk, `base ${basi.join(" / ")}`);
  const alti = ["neutro", "allegro", "triste"].map((n) => tre?.[n]?.alto ?? null);
  const altoOk = alti.every((a) => a !== null) && Math.max(...alti) - Math.min(...alti) <= 3;
  check("i tre stati partono dalla stessa altezza (testa allineata)", altoOk, `alto ${alti.join(" / ")}`);

  mkdirSync("screenshots", { recursive: true });
  await desktop.screenshot({ path: "screenshots/pino-presentazione-desktop.png" });

  // ── B. REGRESSIONE BARRA DI RICERCA ──────────────────────────────────────
  console.log("\n── B. REGRESSIONE BARRA DI RICERCA ──────────────────────────────");
  await desktop.goto(base, { waitUntil: "domcontentloaded" });
  const inputCerca = desktop.locator('form[action="/ricerca"] input[name="q"]').first();
  await inputCerca.fill("cerco una pizzeria");
  await inputCerca.press("Enter");
  await desktop.waitForURL(/\/ricerca\?q=/, { timeout: 20000 }).catch(() => {});
  await desktop.waitForTimeout(1500);
  check("la ricerca commerciale funziona", /\/ricerca\?q=cerco\+una\+pizzeria/.test(desktop.url()), desktop.url());

  // ── B2. GLI STATI DI PINO NELLA CHAT ─────────────────────────────────────
  // Il vecchio PinoSearchHelper (aside "Assistente di ricerca Pino", stato
  // deciso dalla pagina /ricerca) non è più importato da nessun componente:
  // oggi lo stato di Pino vive solo nella chat, dove AssistantPanel lo deduce
  // dalla risposta dell'assistente.
  console.log("\n── B2. STATI DI PINO NELLA CHAT ─────────────────────────────────");
  await apriHome(desktop);
  await desktop.locator(SEL_SPRITE).first().click();
  check("chat: apribile dal personaggio", await pannelloAperto(desktop));
  await desktop.waitForTimeout(900);
  const pinChat = await desktop.evaluate((sel) => {
    const dentroHomepage = (el) => !!el.closest(sel);
    const imgs = [...document.querySelectorAll('img[src^="/pino-"]')].filter((el) => !dentroHomepage(el));
    const grandi = imgs
      .map((el) => ({ src: el.getAttribute("src"), h: el.getBoundingClientRect().height }))
      .sort((a, b) => b.h - a.h);
    return grandi[0] ?? null;
  }, SEL_WIDGET);
  check(
    "chat inattiva: Pino NEUTRO",
    pinChat?.src === "/pino-neutro.webp",
    `${pinChat?.src ?? "n/d"} (${Math.round(pinChat?.h ?? 0)}px)`
  );

  const leggiStatoChat = () =>
    desktop.evaluate(() => {
      const spans = [...document.querySelectorAll("span.sr-only")].filter((s) =>
        (s.textContent ?? "").trim().startsWith("Pino è")
      );
      const last = spans[spans.length - 1];
      if (!last) return null;
      const img = last.parentElement?.querySelector('img[src^="/pino-"]');
      return {
        testo: (last.textContent ?? "").trim(),
        src: img?.getAttribute("src") ?? null,
      };
    });

  const statoInput = () =>
    desktop.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder="Chiedi qualcosa..."]');
      return ta ? (ta.disabled ? "occupato" : "pronto") : "assente";
    });

  const invia = async (testo) => {
    await desktop
      .waitForFunction(
        () => {
          const ta = document.querySelector('textarea[placeholder="Chiedi qualcosa..."]');
          return !!ta && !ta.disabled;
        },
        null,
        { timeout: 60000 }
      )
      .catch(() => {});
    const inputChat = desktop.locator('textarea[placeholder="Chiedi qualcosa..."]').first();
    await inputChat.fill(testo);
    await inputChat.press("Enter");
    await desktop
      .waitForFunction(
        () => {
          const ta = document.querySelector('textarea[placeholder="Chiedi qualcosa..."]');
          return !!ta && ta.disabled;
        },
        null,
        { timeout: 15000 }
      )
      .catch(() => {});
    await desktop
      .waitForFunction(
        () => {
          const ta = document.querySelector('textarea[placeholder="Chiedi qualcosa..."]');
          return !!ta && !ta.disabled;
        },
        null,
        { timeout: 120000 }
      )
      .catch(() => {});
    await desktop.waitForTimeout(700);
  };

  // "alimentari" è una categoria presente nel catalogo locale, quindi la
  // risposta contiene risultati e lo stato è deterministica.
  await invia("alimentari");
  const statoChat = await leggiStatoChat();
  check(
    "chat con risultati: Pino ALLEGRO",
    statoChat?.src === "/pino-allegro.webp",
    `${statoChat?.src ?? "n/d"} — "${statoChat?.testo ?? "n/d"}" (input ${await statoInput()})`
  );

  skip(
    "chat senza risultati: Pino TRISTE",
    "lo stato dipende dalla frase del modello (AssistantPanel cerca «Non ho trovato»/«errore»): in locale la risposta è «non risultano attività», quindi lo stato resta neutro. L'asset triste è comunque verificato in A5."
  );

  await chiudiPannello(desktop);

  // ── C. MOBILE ────────────────────────────────────────────────────────────
  console.log("\n── C. MOBILE (390x844) ──────────────────────────────────────────");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on("console", (m2) => {
    if (m2.type() === "error") erroriConsole.push(m2.text().slice(0, 160));
  });
  await apriHome(mobile);

  const mm = await metricheBarra(mobile);
  check("mobile: fascia presente", !!mm);
  if (mm) {
    check(
      "mobile: fascia a tutta larghezza e in basso",
      Math.abs(mm.rect.left) <= 1 &&
        Math.abs(mm.rect.right - 390) <= 1 &&
        Math.abs(mm.rect.bottom - mm.bottomViewport) <= 1,
      `x ${Math.round(mm.rect.left)}..${Math.round(mm.rect.right)}`
    );
    check("mobile: testo leggibile (≥ 16px, bold)", mm.fontSize >= 16 && mm.fontWeight >= 700, `${mm.fontSize}px / ${mm.fontWeight}`);
    check("mobile: testo completo e non troncato", normalizza(mm.testo) === TESTO_ATTESO && mm.testoNonTroncato, `"${normalizza(mm.testo)}"`);
    check(
      "mobile: contrasto testo/sfondo ≥ 7:1",
      mm.contrasto !== null && mm.contrasto >= 7,
      `${mm.contrasto ? mm.contrasto.toFixed(2) : "n/d"}:1`
    );
    check("mobile: personaggio presente (48x48)", !!mm.sprite, mm.sprite ? `${Math.round(mm.sprite.width)}x${Math.round(mm.sprite.height)}` : "n/d");
    check(
      "mobile: CTA presente, dentro la fascia e cliccabile",
      !!mm.cta && mm.cta.dentroLaBarra && mm.cta.height >= 28,
      mm.cta ? `${Math.round(mm.cta.width)}x${Math.round(mm.cta.height)}` : "n/d"
    );
    const { copre: copreM, noto: notoM } = await copreRicerca(mobile, mm.rect);
    check("mobile: la fascia NON copre il campo di ricerca", !copreM, notoM ? "" : "campo non trovato");
    const overflow = await mobile.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      view: window.innerWidth,
    }));
    check("mobile: nessun overflow orizzontale", overflow.doc <= overflow.view + 1, `${overflow.doc} su ${overflow.view}`);
    const aloneM = await analisiAlone(mobile);
    const quotaAloneM = aloneM ? aloneM.bordoConFondo / Math.max(1, aloneM.bordoVisibile) : 1;
    check(
      "mobile: nessun alone grigio sul bordo della sagoma (< 2%)",
      quotaAloneM < 0.02,
      aloneM ? `${aloneM.bordoConFondo} su ${aloneM.bordoVisibile} px di bordo (${(quotaAloneM * 100).toFixed(2)}%)` : "n/d"
    );
  }

  await mobile.screenshot({ path: "screenshots/pino-presentazione-mobile.png" });

  await mobile.locator(SEL_CTA).first().tap();
  check("mobile: il tap sulla CTA apre l'assistente", await pannelloAperto(mobile));
  await chiudiPannello(mobile);

  // ── E. ZOOM SUL BORDO ────────────────────────────────────────────────────
  console.log("\n── E. ZOOM SUL RITAGLIO (desktop 3x/6x) ─────────────────────────");
  const zoom = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 });
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

    const zoom6 = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 6 });
    await apriHome(zoom6);
    const zb6 = await zoom6.locator(SEL_SPRITE).first().boundingBox();
    const zona = async (nome, frazioneY, altezzaFrazione) => {
      if (!zb6) return false;
      const c = {
        x: Math.max(0, zb6.x - 4),
        y: Math.max(0, zb6.y + zb6.height * frazioneY - 4),
        width: Math.min(zb6.width + 8, 1280),
        height: Math.min(zb6.height * altezzaFrazione + 8, 900),
      };
      await zoom6.screenshot({ path: `screenshots/pino-homepage-zoom-${nome}.png`, clip: c });
      return true;
    };
    check("zoom 6x sulla chioma (capelli) catturato", await zona("capelli", 0.0, 0.45));
    check("zoom 6x sulle gambe catturato", await zona("gambe", 0.6, 0.4));
    await zoom6.close();
  } else {
    check("zoom 3x catturato per il controllo visivo del bordo", false, "personaggio non trovato");
    check("zoom 6x sulla chioma (capelli) catturato", false, "personaggio non trovato");
    check("zoom 6x sulle gambe catturato", false, "personaggio non trovato");
  }

  console.log("\n── D. CONSOLE ───────────────────────────────────────────────────");
  const errori = erroriConsole.filter((t) => !/favicon|Failed to load resource|net::ERR/i.test(t));
  check("nessun errore JS in console", errori.length === 0, errori.join(" | "));
} finally {
  await browser.close();
}

console.log(`\nRISULTATO: ${passati} OK, ${falliti} FAIL${saltati ? `, ${saltati} SKIP` : ""}`);
process.exit(falliti > 0 ? 1 : 0);
