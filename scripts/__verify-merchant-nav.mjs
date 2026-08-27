/**
 * FASE 10B — Verifica Playwright della navigazione Merchant.
 * Solo lettura: nessuna modifica.
 *
 * La sidebar desktop merchant (MerchantStoreNavAuto) viene renderizzata solo
 * se il negozio è POSSEDUTO dall'account; i negozi QA sono nel cestino, quindi
 * la struttura della sidebar viene verificata tramite il DRAWER MOBILE, che usa
 * lo STESSO componente MerchantSidebarNav ma deriva lo storeId dall'URL.
 *
 * Controlla:
 *  1. Sidebar (drawer mobile, 375): funzioni principali + sezione "Strumenti"
 *     + Media/Impostazioni/Duplica, href invariati, stato attivo, nessuna voce
 *     eliminata.
 *  2. Bottom nav mobile: Negozio/Prodotti/Ordini/Guadagni/AI, Guadagni
 *     raggiungibile e attivo anche su /incassi, Home solo nella top bar.
 *  3. Desktop 1280: /merchant raggiungibile, nessun overflow, nessun errore.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const MERCHANT = { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!" };

// StoreId per la verifica della NAVIGAZIONE: il drawer deriva il negozio
// dall'URL e renderizza MerchantSidebarNav anche per negozi non posseduti.
const STORE_ID = "qa-nav-check";

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

async function noOverflow(page, ctx) {
  const r = await page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth };
  });
  esito(`nessun overflow orizzontale (${ctx})`, r.sw <= r.cw, `(${r.sw} > ${r.cw})`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(MERCHANT.email);
  await page.locator("#password").fill(MERCHANT.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

async function run() {
  const browser = await chromium.launch();

  // ── 1. MOBILE 375: sidebar via drawer (stesso MerchantSidebarNav) ──────
  console.log("\n── MERCHANT MOBILE 375: sidebar (drawer) ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await login(page);

    // Apre il drawer su /merchant/{id}/prodotti: la sidebar è visibile
    // (MerchantSidebarNav è usato sia da MerchantStoreNavAuto sia dal drawer).
    await page.goto(`${BASE}/merchant/${STORE_ID}/prodotti`, { waitUntil: "networkidle" });
    const hamburger = page.getByRole("button", { name: "Apri il menu" });
    esito("hamburger presente", (await hamburger.count()) > 0);
    await hamburger.click();

    const nav = page.getByRole("navigation", { name: "Menu negozio" });
    esito("sidebar negozio presente nel drawer", (await nav.count()) > 0);

    // Funzioni principali presenti
    for (const voce of ["Dashboard", "Prodotti", "Ordini", "Guadagni", "Pagamenti"]) {
      esito(`voce principale «${voce}» presente`, (await nav.getByText(voce, { exact: true }).count()) > 0);
    }

    // Sezione Strumenti + voci secondarie
    esito("sezione «Strumenti» presente", (await nav.getByText("Strumenti", { exact: true }).count()) > 0);
    for (const voce of ["Libreria Media", "Impostazioni negozio"]) {
      esito(`voce secondaria «${voce}» presente`, (await nav.getByText(voce, { exact: true }).count()) > 0);
    }
    esito("azione «Duplica negozio» presente", (await page.getByRole("button", { name: "Duplica negozio" }).count()) > 0);

    // Href invariati (uno per uno)
    const attesi = {
      Dashboard: `/merchant/${STORE_ID}`,
      Prodotti: `/merchant/${STORE_ID}/prodotti`,
      Ordini: `/merchant/${STORE_ID}/ordini`,
      Guadagni: `/merchant/${STORE_ID}/guadagni`,
      Pagamenti: `/merchant/${STORE_ID}/pagamenti`,
      "Libreria Media": `/merchant/${STORE_ID}/media`,
      "Impostazioni negozio": `/merchant/${STORE_ID}/impostazioni`,
    };
    for (const [label, href] of Object.entries(attesi)) {
      // L'accessible name dei link include anche la descrizione: match su hasText.
      const link = nav.locator("a", { hasText: label }).first();
      const reale = await link.getAttribute("href");
      esito(`href «${label}» invariato`, reale === href, `(atteso ${href}, trovato ${reale})`);
    }

    // Stato attivo su /prodotti (la voce Prodotti deve essere evidenziata)
    const prodLink = nav.locator("a", { hasText: "Prodotti" }).first();
    esito("voce attiva Prodotti evidenziata", ((await prodLink.getAttribute("class")) ?? "").includes("bg-blue-50"));

    await noOverflow(page, "merchant mobile drawer");
    await page.screenshot({ path: "scripts/__merchant-nav-sidebar-mobile.png" });
    await ctx.close();
  }

  // ── 2. MOBILE 375: bottom nav con Guadagni ─────────────────────────────
  console.log("\n── MERCHANT MOBILE 375: bottom nav ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await login(page);
    await page.goto(`${BASE}/merchant/${STORE_ID}`, { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: "Navigazione area mobile" });
    esito("bottom nav presente su mobile", (await nav.count()) > 0);

    for (const voce of ["Negozio", "Prodotti", "Ordini", "Guadagni", "AI"]) {
      esito(`bottom nav voce «${voce}» presente`, (await nav.getByText(voce, { exact: true }).count()) > 0);
    }

    // Home NON è nella bottom nav (resta nel pulsante Home della top bar)
    const homeInBottom = await nav.getByText("Home", { exact: true }).count();
    esito("Home non duplicata nella bottom nav", homeInBottom === 0, `(trovata ${homeInBottom})`);
    const homeTopBar = page.getByRole("button", { name: "Vai alla Home" });
    esito("Home raggiungibile dal pulsante top bar", (await homeTopBar.count()) > 0);

    // Href bottom nav
    const hrefAttesi = {
      Negozio: `/merchant/${STORE_ID}`,
      Prodotti: `/merchant/${STORE_ID}/prodotti`,
      Ordini: `/merchant/${STORE_ID}/ordini`,
      Guadagni: `/merchant/${STORE_ID}/guadagni`,
    };
    for (const [label, href] of Object.entries(hrefAttesi)) {
      const link = nav.getByRole("link", { name: label, exact: true });
      const reale = await link.getAttribute("href");
      esito(`bottom nav href «${label}» invariato`, reale === href, `(atteso ${href}, trovato ${reale})`);
    }

    // Stato attivo su /guadagni (aria-current="page" sul link della voce)
    await page.goto(`${BASE}/merchant/${STORE_ID}/guadagni`, { waitUntil: "networkidle" });
    const guadBottom = page.getByRole("navigation", { name: "Navigazione area mobile" }).getByRole("link", { name: "Guadagni", exact: true });
    esito("Guadagni attiva nella bottom nav su /guadagni", (await guadBottom.getAttribute("aria-current")) === "page");

    // Guadagni attiva anche su /incassi
    await page.goto(`${BASE}/merchant/${STORE_ID}/incassi`, { waitUntil: "networkidle" });
    const guadBottom2 = page.getByRole("navigation", { name: "Navigazione area mobile" }).getByRole("link", { name: "Guadagni", exact: true });
    esito("Guadagni attiva nella bottom nav su /incassi", (await guadBottom2.getAttribute("aria-current")) === "page");

    await noOverflow(page, "merchant mobile 375");
    await page.screenshot({ path: "scripts/__merchant-nav-mobile.png" });
    await ctx.close();
  }

  // ── 3. DESKTOP 1280: /merchant e nessun overflow ───────────────────────
  console.log("\n── MERCHANT DESKTOP 1280 ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page);
    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });

    esito("pagina /merchant raggiungibile", /Area Venditore|Nessun negozio|I tuoi negozi/.test(await page.locator("body").innerText()));
    await noOverflow(page, "merchant desktop 1280");
    await page.screenshot({ path: "scripts/__merchant-nav-desktop.png" });
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
