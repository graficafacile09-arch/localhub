/**
 * FASE 10A — Verifica Playwright della sidebar admin riorganizzata.
 * Solo lettura: nessuna modifica a codice/dati.
 *
 * Controlla:
 *  1. Admin desktop (1280): gruppi chiusi di default, Panoramica aperta,
 *     tutte le voci presenti nel DOM, href invariati, nessun overflow.
 *  2. Admin desktop: naviga a /amministratore/cestino → il gruppo Recupero
 *     si apre automaticamente, voce Cestino evidenziata.
 *  3. Admin desktop: /amministratore/payout → gruppo Ordini & Pagamenti
 *     aperto, voce Payout evidenziata.
 *  4. Admin mobile (375): drawer hamburger funzionante, accordion, nessun
 *     overflow, tutte le voci raggiungibili.
 *  5. Merchant desktop (1280): titolo pagina /merchant corretto, nav negozio.
 *  6. Merchant mobile (375): bottom nav + drawer, nessun overflow.
 *  7. Accesso permessi: customer non entra in /amministratore (gate intatto).
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";

const UTENTI = {
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!" },
  merchantA: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!" },
  customerA: { email: "customer-a.test@localhub.it", password: "CustomerTest123!" },
};

// Tutti gli href attesi della sidebar admin (dati dalla riorganizzazione).
const VOCI_ADMIN = [
  ["Panoramica", "/amministratore"],
  ["Negozi", "/amministratore/attivita"],
  ["Prodotti", "/amministratore/prodotti"],
  ["Categorie", "/amministratore/categorie"],
  ["Negozi in evidenza", "/amministratore/negozi-in-evidenza"],
  ["Ordini", "/amministratore/ordini"],
  ["Incassi", "/amministratore/incassi"],
  ["Payout", "/amministratore/payout"],
  ["Offerte", "/amministratore/offerte"],
  ["Eventi", "/amministratore/eventi"],
  ["Contenuti", "/amministratore/contenuti"],
  ["Template", "/amministratore/template"],
  ["Utenti", "/amministratore/utenti"],
  ["Segnalazioni", "/amministratore/segnalazioni"],
  ["Statistiche", "/amministratore/statistiche"],
  ["Assistente AI", "/amministratore/assistente-ai"],
  ["Scansioni AI", "/amministratore/scansioni"],
  ["Registro attività", "/amministratore/registro-attivita"],
  ["Impostazioni", "/amministratore/impostazioni"],
  ["Cestino", "/amministratore/cestino"],
];

const GRUPPI = [
  "Panoramica",
  "Negozi & Catalogo",
  "Ordini & Pagamenti",
  "Contenuti & Promozioni",
  "Piattaforma",
  "Strumenti",
  "Recupero",
];

let pass = 0;
let fail = 0;
const errori = [];

function esito(nome, ok, dettaglio = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${nome}`);
  } else {
    fail++;
    console.log(`  ❌ ${nome} ${dettaglio}`);
    errori.push(`${nome} ${dettaglio}`);
  }
}

async function login(page, utente) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(utente.email);
  await page.locator("#password").fill(utente.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/^https?:\/\/[^/]+(\/|$)/, { timeout: 20000 });
}

async function noOverflow(page, ctx) {
  const r = await page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth };
  });
  esito(`nessun overflow orizzontale (${ctx})`, r.sw <= r.cw, `(${r.sw} > ${r.cw})`);
}

async function verificaVoci(page, gruppiAperti) {
  const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
  let ok = true;
  for (const [label, href] of VOCI_ADMIN) {
    const link = nav.getByRole("link", { name: label, exact: true });
    const count = await link.count();
    if (count === 0) {
      esito(`voce ${label} presente`, false, "(assente dal DOM)");
      ok = false;
      continue;
    }
    const hrefReale = await link.first().getAttribute("href");
    if (hrefReale !== href) {
      esito(`href ${label}`, false, `(atteso ${href}, trovato ${hrefReale})`);
      ok = false;
    }
  }
  if (ok) esito(`tutte le ${VOCI_ADMIN.length} voci presenti con href invariati`, true);
}

async function statoGruppi(page, attesi) {
  const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
  let ok = true;
  for (const nome of GRUPPI) {
    const btn = nav.getByRole("button", { name: nome, exact: true });
    const count = await btn.count();
    if (count === 0) {
      esito(`gruppo ${nome} presente`, false, "(assente)");
      ok = false;
      continue;
    }
    const expanded = await btn.first().getAttribute("aria-expanded");
    const atteso = attesi.includes(nome) ? "true" : "false";
    if (expanded !== atteso) {
      esito(`gruppo ${nome} ${atteso === "true" ? "aperto" : "chiuso"}`, false, `(aria-expanded=${expanded})`);
      ok = false;
    }
  }
  if (ok) {
    const aperti = attesi.join(", ");
    esito(`stato gruppi corretto (aperti: ${aperti})`, true);
  }
}

async function run() {
  const browser = await chromium.launch();

  // ════════════ 1. ADMIN DESKTOP 1280 ════════════
  console.log("\n── ADMIN DESKTOP 1280 ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page, UTENTI.admin);
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    esito("pagina Panoramica caricata", (await page.getByRole("heading", { level: 1, name: "Panoramica" }).count()) > 0);
    await noOverflow(page, "admin 1280");

    // Tutte le voci presenti nel DOM con href invariati
    await verificaVoci(page);

    // Gruppi chiusi di default, solo Panoramica aperta
    await statoGruppi(page, ["Panoramica"]);

    // Voce Panoramica evidenziata
    const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
    const pana = nav.getByRole("link", { name: "Panoramica", exact: true });
    esito("voce attiva Panoramica evidenziata", (await pana.getAttribute("class")).includes("bg-blue-50"));

    // Torna al sito presente e separato
    const footer = page.getByRole("navigation", { name: "Navigazione rapida" });
    const torna = footer.getByRole("link", { name: "Torna al sito", exact: true });
    esito("Torna al sito presente in sezione separata", (await torna.count()) > 0);
    esito("Torna al sito href=/", (await torna.getAttribute("href")) === "/");

    // Negozi gestiti (admin): sezione separata
    const negoziGestiti = page.locator("aside").getByText("Negozi gestiti", { exact: true });
    esito("sezione 'Negozi gestiti' presente per admin", (await negoziGestiti.count()) > 0);

    // Screenshot
    await page.screenshot({ path: "scripts/__sidebar-admin-1280.png", fullPage: false });
    await ctx.close();
  }

  // ════════════ 2. ADMIN — gruppo attivo si apre da solo ════════════
  console.log("\n── ADMIN: gruppo attivo auto-aperto ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page, UTENTI.admin);

    // /amministratore/cestino → gruppo Recupero aperto, Cestino evidenziato
    await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });
    await statoGruppi(page, ["Recupero"]);
    const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
    const cestino = nav.getByRole("link", { name: "Cestino", exact: true });
    esito("voce Cestino evidenziata", (await cestino.getAttribute("class")).includes("bg-blue-50"));

    // /amministratore/payout → gruppo Ordini & Pagamenti aperto, Payout evidenziato
    await page.goto(`${BASE}/amministratore/payout`, { waitUntil: "networkidle" });
    await statoGruppi(page, ["Ordini & Pagamenti"]);
    const payout = nav.getByRole("link", { name: "Payout", exact: true });
    esito("voce Payout evidenziata", (await payout.getAttribute("class")).includes("bg-blue-50"));
    await noOverflow(page, "admin payout 1280");

    // /amministratore/utenti → gruppo Piattaforma aperto
    await page.goto(`${BASE}/amministratore/utenti`, { waitUntil: "networkidle" });
    await statoGruppi(page, ["Piattaforma"]);
    await ctx.close();
  }

  // ════════════ 3. ADMIN — il gruppo attivo non si chiude ════════════
  console.log("\n── ADMIN: gruppo attivo non chiudibile ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page, UTENTI.admin);
    await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
    const btnRecupero = nav.getByRole("button", { name: "Recupero", exact: true });
    // Click sul gruppo attivo: deve restare aperto
    await btnRecupero.click();
    const expanded = await btnRecupero.getAttribute("aria-expanded");
    esito("click sul gruppo attivo non lo chiude", expanded === "true", `(aria-expanded=${expanded})`);
    await ctx.close();
  }

  // ════════════ 4. ADMIN MOBILE 375 ════════════
  console.log("\n── ADMIN MOBILE 375 ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await login(page, UTENTI.admin);
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

    // Drawer: hamburger apre il menu
    const hamburger = page.getByRole("button", { name: "Apri il menu" });
    esito("hamburger presente su mobile", (await hamburger.count()) > 0);
    await hamburger.click();

    // Nel drawer la sidebar admin è presente con i gruppi
    const drawerNav = page.getByRole("navigation", { name: "Menu Amministratore" });
    esito("sidebar admin nel drawer mobile", (await drawerNav.count()) > 0);
    await statoGruppi(page, ["Panoramica"]);

    // Apri un gruppo chiuso nel drawer
    const btnNegozio = drawerNav.getByRole("button", { name: "Negozi & Catalogo", exact: true });
    await btnNegozio.click();
    esito("accordion apre gruppo nel drawer", (await btnNegozio.getAttribute("aria-expanded")) === "true");
    const linkNegozi = drawerNav.getByRole("link", { name: "Negozi", exact: true });
    esito("voce Negozi visibile nel drawer", (await linkNegozi.count()) > 0);

    await noOverflow(page, "admin mobile drawer");
    await page.screenshot({ path: "scripts/__sidebar-admin-mobile-375.png" });
    await ctx.close();
  }

  // ════════════ 5. MERCHANT DESKTOP 1280 — titolo pagina ════════════
  console.log("\n── MERCHANT DESKTOP 1280 ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page, UTENTI.merchantA);
    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });

    const titolo = await page.title();
    esito("titolo /merchant coerente (Area Venditore)", /Area Venditore/.test(titolo), `(titolo: "${titolo}")`);
    esito("titolo /merchant NON usa la tagline pubblica", !titolo.includes("I negozi di Castrovillari"), `(titolo: "${titolo}")`);
    await noOverflow(page, "merchant 1280");
    esito("area merchant raggiungibile", /Area Venditore|Nessun negozio/.test(await page.locator("body").innerText()));

    await page.screenshot({ path: "scripts/__sidebar-merchant-1280.png" });
    await ctx.close();
  }

  // ════════════ 6. MERCHANT MOBILE 375 ════════════
  console.log("\n── MERCHANT MOBILE 375 ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await login(page, UTENTI.merchantA);
    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });

    await noOverflow(page, "merchant mobile");
    const hamburger = page.getByRole("button", { name: "Apri il menu" });
    esito("hamburger merchant presente", (await hamburger.count()) > 0);
    await hamburger.click();
    await noOverflow(page, "merchant mobile drawer");
    await ctx.close();
  }

  // ════════════ 7. PERMESSI — gate admin intatto ════════════
  console.log("\n── PERMESSI (gate admin) ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page, UTENTI.customerA);
    await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
    const url = page.url();
    const negato = url.includes("/cliente") || (await page.locator("body").innerText()).includes("Area non autorizzata");
    esito("customer NON entra in /amministratore", negato, `(url: ${url})`);
    await ctx.close();
  }

  await browser.close();

  console.log(`\n══════════════════════════════════════`);
  console.log(`RISULTATO: ${pass} OK · ${fail} KO`);
  if (fail > 0) {
    console.log("ERRORI:");
    errori.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
