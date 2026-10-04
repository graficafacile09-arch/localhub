/**
 * VERIFICA BROWSER REALE — RESTYLING RESPONSIVE v3.
 *
 * Apre realmente le pagine pubbliche su desktop (1440x900), tablet (834x1112)
 * e mobile (390x844), salva screenshot full-page + viewport nell'output dir e
 * misura la DENSITÀ reale della pagina (larghezza contenuto, card visibili,
 * altezza header, sezioni). Controlla inoltre:
 *  - nessuno scroll orizzontale
 *  - header a due fasce presente
 *  - contenuto renderizzato
 *  - zero errori JS/React in console
 *
 * Uso: node scripts/__verify-design-v3.mjs [--base http://localhost:3000] [--out screenshots/v3]
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (nome, fallback) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const base = arg("base", process.env.BASE_URL || "http://localhost:3000");
const OUT = arg("out", "screenshots/v3");
mkdirSync(OUT, { recursive: true });

const erroriConsole = [];
// Rumore di rete verso servizi TERZI (es. api.open-meteo.com che risponde
// 503): i widget dell'header degradano da soli, non è un errore del sito.
const rumoreReteEsterna = [];
const metriche = [];
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

const VIEWPORT = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function analizza(page, id, viewport, path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);

  const dati = await page.evaluate(() => {
    const de = document.scrollingElement;
    const scrollWidth = de.scrollWidth;
    const clientWidth = de.clientWidth;
    const colpevoli = [];
    if (scrollWidth > clientWidth + 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > clientWidth + 1 && r.width > 0) {
          colpevoli.push(
            `${el.tagName}.${String(el.className).slice(0, 50)} w=${Math.round(r.width)} right=${Math.round(r.right)}`
          );
          if (colpevoli.length >= 6) break;
        }
      }
    }

    const header = document.querySelector("header");
    const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
    const search = document.querySelector('form[action="/ricerca"]');
    const main = document.querySelector("main");

    // Larghezza del contenuto principale: il box più largo con un max-width
    // dichiarato dentro <main> (misura quanto dello schermo viene usato).
    let contenutoMax = 0;
    let contenutoMinLeft = 0;
    if (main) {
      for (const el of main.querySelectorAll("*")) {
        // Esclude header/footer: misuriamo il contenuto vero della pagina.
        if (el.closest("header") || el.closest("footer")) continue;
        const cs = getComputedStyle(el);
        const mw = parseFloat(cs.maxWidth);
        if (cs.maxWidth !== "none" && mw > 600) {
          const r = el.getBoundingClientRect();
          if (r.width > contenutoMax) {
            contenutoMax = Math.round(r.width);
            contenutoMinLeft = Math.round(r.left);
          }
        }
      }
    }

    const cards = document.querySelectorAll(
      'a[href^="/negozio/"], a[href^="/prodotto/"], a[href^="/categorie/"]'
    );
    const firstFold = [...cards].filter((c) => {
      const r = c.getBoundingClientRect();
      return r.top < window.innerHeight && r.height > 60;
    }).length;

    const sezioni = main ? main.querySelectorAll(":scope > section, :scope > div > section").length : 0;

    // RIEMPIMENTO DELLA PRIMA VIEWPORT: quale percentuale dell'altezza
    // visibile è coperta da contenuto vero (titoli, immagini, card, CTA,
    // input). Un valore alto = prima schermata densa, non "titolo + vuoto".
    let vuotoPiega = null;
    let blocchiPiega = 0;
    if (main) {
      const sel =
        'h1, h2, h3, img, button, a, input, [role="img"]';
      const h = window.innerHeight;
      const rects = [];
      for (const el of main.querySelectorAll(sel)) {
        if (el.closest("header") || el.closest("footer")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.top >= h) continue;
        rects.push([Math.max(0, r.top), Math.min(h, r.bottom)]);
      }
      blocchiPiega = rects.length;
      rects.sort((a, b) => a[0] - b[0]);
      let coperto = 0;
      let cur = 0;
      for (const [s, e] of rects) {
        if (s > cur) {
          cur = s;
        }
        if (e > cur) {
          coperto += e - cur;
          cur = e;
        }
      }
      vuotoPiega = Math.round((1 - coperto / h) * 100);
    }

    // Superfici: quanti colori di sfondo distinti nelle sezioni principali
    // (indice di quanto la pagina alterna le superfici invece di essere piatta).
    const superfici = new Set();
    if (main) {
      for (const el of main.querySelectorAll("section, footer")) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)") superfici.add(bg);
      }
    }

    return {
      scrollWidth,
      clientWidth,
      colpevoli,
      headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
      headerBands: header
        ? [...header.children].map((c) => Math.round(c.getBoundingClientRect().height))
        : [],
      haNav: Boolean(nav),
      haSearch: Boolean(search),
      mainHeight: main ? Math.round(main.getBoundingClientRect().height) : 0,
      contenutoMax: Math.round(contenutoMax),
      contenutoLeft: Math.round(contenutoMinLeft),
      nCards: cards.length,
      firstFold,
      sezioni,
      vuotoPiega,
      blocchiPiega,
      superfici: [...superfici],
    };
  });

  check(
    `${id} ${viewport}: nessuno scroll orizzontale`,
    dati.scrollWidth <= dati.clientWidth + 1,
    `${dati.scrollWidth}/${dati.clientWidth} ${dati.colpevoli.join(" || ")}`
  );
  check(`${id} ${viewport}: header a due fasce (nav + ricerca)`, dati.haNav && dati.haSearch);
  check(`${id} ${viewport}: contenuto renderizzato`, dati.mainHeight > 400, `${dati.mainHeight}px`);

  const uso = dati.clientWidth ? Math.round((dati.contenutoMax / dati.clientWidth) * 100) : 0;
  console.log(
    `  [M] ${id} ${viewport}: header=${dati.headerHeight}px contenuto=${dati.contenutoMax}px (${uso}%) card=${dati.nCards} sopra-piega=${dati.firstFold} sezioni=${dati.sezioni} superfici=${dati.superfici.length} VUOTO-PIEGA=${dati.vuotoPiega}% blocchi=${dati.blocchiPiega}`
  );
  metriche.push({ id, viewport, path, uso, ...dati });

  await page.screenshot({ path: `${OUT}/${id}-${viewport}.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/${id}-${viewport}-top.png`, fullPage: false });
}

/** Crea un contesto per un viewport, con la modalità ospite attiva. */
async function nuovoContesto(browser, kind) {
  const ctx = await browser.newContext({ viewport: VIEWPORT[kind] });
  await ctx.addCookies([{ name: "lh_guest", value: "1", domain: "localhost", path: "/" }]);
  ctx.on("page", (p) => {
    p.on("console", (m) => {
      if (m.type() !== "error") return;
      const testo = m.text();
      // "Failed to load resource" senza URL: è il riflesso di una risorsa
      // esterna già tracciata dal listener sulle risposte.
      if (/Failed to load resource/i.test(testo)) {
        rumoreReteEsterna.push(`[${kind}] ${testo}`);
        return;
      }
      erroriConsole.push(`[${kind}] ${testo}`);
    });
    p.on("pageerror", (e) => erroriConsole.push(`[${kind}] ${String(e)}`));
    // Diagnostica: le 5xx della NOSTRA origine sono sempre inaccettabili;
    // quelle di servizi terzi vengono elencate a parte.
    p.on("response", (r) => {
      if (r.status() < 500) return;
      const url = r.url();
      if (url.startsWith(base)) {
        erroriConsole.push(`[${kind}] HTTP ${r.status()} ${url}`);
      } else {
        rumoreReteEsterna.push(`[${kind}] HTTP ${r.status()} ${url}`);
      }
    });
  });
  return ctx;
}

const browser = await chromium.launch({ channel: "chrome" });

const prodotti = {};

for (const kind of ["desktop", "tablet", "mobile"]) {
  console.log(`\n== ${kind.toUpperCase()} ${VIEWPORT[kind].width}x${VIEWPORT[kind].height} ==`);
  const ctx = await nuovoContesto(browser, kind);
  const page = await ctx.newPage();

  for (const p of PAGINE) await analizza(page, p.id, kind, p.path);

  // Pagina prodotto reale: scoperta dal primo link /prodotto/ della home.
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const prodottoHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/prodotto/"]');
    return a ? a.getAttribute("href") : null;
  });
  if (prodottoHref) {
    prodotti[kind] = prodottoHref;
    console.log(`  (pagina prodotto: ${prodottoHref})`);
    await analizza(page, "prodotto", kind, prodottoHref);
  }

  // Carrello e checkout CON articoli (flusso reale: aggiungi dal prodotto).
  if (prodottoHref) {
    await page.goto(`${base}${prodottoHref}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const aggiungi = page.getByRole("button", { name: /aggiungi.*al carrello/i }).first();
    if ((await aggiungi.count()) > 0) {
      await aggiungi.click();
      await page.waitForTimeout(900);
      await analizza(page, "carrello-pieno", kind, "/carrello");
      await analizza(page, "checkout-form", kind, "/checkout");
    } else {
      console.log("  (pulsante Aggiungi al carrello non trovato)");
    }
  }

  await ctx.close();
}

console.log("\n== CONSOLE ==");
check(
  "zero errori JavaScript/React in console",
  erroriConsole.length === 0,
  erroriConsole.slice(0, 4).join(" | ")
);
if (rumoreReteEsterna.length > 0) {
  console.log(
    `  (nota) ${rumoreReteEsterna.length} risposte fallite di servizi TERZI (widget meteo/farmacie): degradano da sole, non sono errori del sito — ${[...new Set(rumoreReteEsterna.map((s) => s.split(" ").slice(2).join(" ")))].slice(0, 2).join(" | ")}`
  );
}

writeFileSync(`${OUT}/metriche.json`, JSON.stringify(metriche, null, 2));

await browser.close();

console.log(`\nRISULTATO: ${problemi === 0 ? "tutti i controlli superati" : `${problemi} problemi`}`);
process.exit(problemi ? 1 : 0);
