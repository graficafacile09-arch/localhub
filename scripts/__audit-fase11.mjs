/**
 * FASE 11 — AUDIT UX/UI POST-INTERVENTI (10A/10B/10C).
 * Solo lettura: screenshot + metriche, nessuna modifica.
 *
 * 1. Pubblico 1280 + 375: /, /negozi, /categorie, /prodotto, /carrello, /login
 * 2. Cliente 1280 + 375: dashboard, ordini, preferiti
 * 3. Merchant: /merchant, sidebar (drawer), bottom nav Guadagni attivo
 * 4. Admin 1280 + 375: dashboard, negozi, prodotti, ordini, payout, utenti,
 *    cestino + verifiche sidebar 10A (gruppi chiusi, attivo auto-aperto, ecc.)
 * 5. 10C: H1 pubblici 30px, hero 48px, "Esplora i negozi" 40px
 * 6. Overflow, console JS, HTTP 4xx/5xx
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3100";
const SHOTS = "scripts/__fase11-shots";
mkdirSync(SHOTS, { recursive: true });

const UTENTI = {
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!" },
  merchantA: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!" },
  customerA: { email: "customer-a.test@localhub.it", password: "CustomerTest123!" },
};

const STORE_ID = "qa-nav-check"; // negozio per la verifica della NAVIGAZIONE merchant

let pass = 0;
let fail = 0;
const problemi = [];
const consoleErrors = [];
const httpErrors = [];

function esito(nome, ok, dettaglio = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${nome}`);
  } else {
    fail++;
    console.log(`  ❌ ${nome} ${dettaglio}`);
    problemi.push(`${nome} ${dettaglio}`);
  }
}

async function login(page, utente) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(utente.email);
  await page.locator("#password").fill(utente.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

/** Collega raccolta errori + cattura screenshot + overflow. Ritorna metriche. */
async function snap(page, ctx, shotName) {
  const r = await page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth, h1: (() => {
      const h = document.querySelector("h1");
      return h ? { text: h.textContent.trim().slice(0, 60), size: getComputedStyle(h).fontSize } : null;
    })() };
  });
  const overflow = r.sw - r.cw;
  if (overflow > 1) { fail++; problemi.push(`OVERFLOW +${overflow}px su ${ctx}`); console.log(`  ❌ overflow ${ctx}: +${overflow}px`); }
  if (shotName) {
    try { await page.screenshot({ path: `${SHOTS}/${shotName}`, fullPage: false }); } catch { /* ok */ }
  }
  return { ...r, overflow };
}

function watch(page, ctx) {
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/i.test(m.text())) consoleErrors.push(`[${ctx}] ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${ctx}] pageerror: ${String(e).slice(0, 160)}`));
  page.on("response", (res) => {
    const s = res.status();
    if (s >= 400 && !/favicon/i.test(res.url())) httpErrors.push(`[${ctx}] ${s} ${res.url().slice(0, 120)}`);
  });
}

const browser = await chromium.launch();

// ════════════════════════ 1. PUBBLICO DESKTOP 1280 ════════════════════════
console.log("── PUBBLICO 1280 ──");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "pub-1280");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const hero = await page.evaluate(() => {
    const h = document.querySelector("h1");
    return h ? getComputedStyle(h).fontSize : null;
  });
  esito("hero homepage H1 = 48px", hero === "48px", `(trovato ${hero})`);
  await snap(page, "homepage 1280", "01-home-1280.png");

  await page.goto(`${BASE}/negozi`, { waitUntil: "networkidle" });
  const r = await snap(page, "negozi 1280", "02-negozi-1280.png");
  esito("H1 /negozi = 30px", r.h1?.size === "30px", `(trovato ${r.h1?.size})`);

  await page.goto(`${BASE}/categorie`, { waitUntil: "networkidle" });
  const r2 = await snap(page, "categorie 1280", "03-categorie-1280.png");
  esito("H1 /categorie = 30px", r2.h1?.size === "30px", `(trovato ${r2.h1?.size})`);

  // Prodotto: prendo il primo slug reale da /negozi
  await page.goto(`${BASE}/negozi`, { waitUntil: "networkidle" });
  const slug = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/prodotto/"]');
    return a ? a.getAttribute("href") : null;
  });
  if (slug) {
    await page.goto(`${BASE}${slug}`, { waitUntil: "networkidle" });
    const rp = await snap(page, `prodotto ${slug} 1280`, "04-prodotto-1280.png");
    esito(`H1 /prodotto = 30px (${slug})`, rp.h1?.size === "30px", `(trovato ${rp.h1?.size})`);
  } else {
    esito("slug prodotto trovato", false, "(nessun link /prodotto da /negozi)");
  }

  await page.goto(`${BASE}/carrello`, { waitUntil: "networkidle" });
  const rc = await snap(page, "carrello 1280", "05-carrello-1280.png");
  esito("H1 /carrello = 30px", rc.h1?.size === "30px", `(trovato ${rc.h1?.size})`);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const rl = await snap(page, "login 1280", "06-login-1280.png");
  esito("H1 /login = 30px", rl.h1?.size === "30px", `(trovato ${rl.h1?.size})`);
  await ctx.close();
}

// ════════════════════════ 2. PUBBLICO MOBILE 375 ══════════════════════════
console.log("── PUBBLICO 375 ──");
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  watch(page, "pub-375");
  for (const [url, name] of [["/", "07-home-375"], ["/negozi", "08-negozi-375"], ["/categorie", "09-categorie-375"], ["/carrello", "10-carrello-375"]]) {
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    const r = await snap(page, `${url} 375`, `${name}.png`);
    if (url === "/negozi") esito("H1 /negozi 375 = 30px", r.h1?.size === "30px", `(${r.h1?.size})`);
    if (url === "/categorie") esito("H1 /categorie 375 = 30px", r.h1?.size === "30px", `(${r.h1?.size})`);
  }
  await ctx.close();
}

// ════════════════════════ 3. CLIENTE (dashboard, ordini, preferiti) ═══════
console.log("── CLIENTE ──");
{
  for (const [vp, tag] of [[1280, "1280"], [375, "375"]]) {
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp === 1280 ? 900 : 812 } });
    const page = await ctx.newPage();
    watch(page, `cliente-${tag}`);
    await login(page, UTENTI.customerA);

    await page.goto(`${BASE}/cliente`, { waitUntil: "networkidle" });
    const rd = await snap(page, `cliente dash ${tag}`, `11-cliente-${tag}.png`);
    esito(`H1 cliente dashboard ${tag} = 30px`, rd.h1?.size === "30px", `(${rd.h1?.size})`);

    // Pulsante "Esplora i negozi" = 40px (dashboard)
    const btnH = await page.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((x) => x.textContent.includes("Esplora i negozi"));
      return a ? Math.round(a.getBoundingClientRect().height) : null;
    });
    esito(`pulsante Esplora dashboard ${tag} = 40px`, btnH === 40, `(trovato ${btnH}px)`);

    await page.goto(`${BASE}/cliente/ordini`, { waitUntil: "networkidle" });
    const ro = await snap(page, `cliente ordini ${tag}`, `12-ordini-${tag}.png`);
    esito(`H1 ordini cliente ${tag} = 30px`, ro.h1?.size === "30px", `(${ro.h1?.size})`);

    await page.goto(`${BASE}/cliente/preferiti`, { waitUntil: "networkidle" });
    const rp = await snap(page, `cliente preferiti ${tag}`, `13-preferiti-${tag}.png`);
    esito(`H1 preferiti cliente ${tag} = 30px`, rp.h1?.size === "30px", `(${rp.h1?.size})`);
    await ctx.close();
  }
}

// ════════════════════════ 4. MERCHANT ═════════════════════════════════════
console.log("── MERCHANT ──");
{
  // Desktop: /merchant (empty state) + titolo corretto
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "merchant-1280");
    await login(page, UTENTI.merchantA);
    await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
    const titolo = await page.title();
    esito("titolo /merchant = Area Venditore (no tagline pubblica)", /Area Venditore/.test(titolo) && !titolo.includes("I negozi di Castrovillari"), `("${titolo}")`);
    await snap(page, "merchant 1280", "14-merchant-1280.png");
    await ctx.close();
  }

  // Mobile: sidebar (drawer) con Strumenti + bottom nav con Guadagni
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    watch(page, "merchant-375");
    await login(page, UTENTI.merchantA);

    // Sidebar via drawer su /merchant/{id}/prodotti
    await page.goto(`${BASE}/merchant/${STORE_ID}/prodotti`, { waitUntil: "networkidle" });
    const hamburger = page.getByRole("button", { name: "Apri il menu" });
    esito("hamburger merchant mobile presente", (await hamburger.count()) > 0);
    if (await hamburger.count()) {
      await hamburger.click();
      const nav = page.getByRole("navigation", { name: "Menu negozio" });
      esito("sidebar negozio nel drawer", (await nav.count()) > 0);
      for (const voce of ["Dashboard", "Prodotti", "Ordini", "Guadagni", "Pagamenti"]) {
        esito(`principale «${voce}» presente`, (await nav.getByText(voce, { exact: true }).count()) > 0);
      }
      esito("sezione «Strumenti» separata", (await nav.getByText("Strumenti", { exact: true }).count()) > 0);
      for (const voce of ["Libreria Media", "Impostazioni negozio"]) {
        esito(`secondaria «${voce}» presente`, (await nav.getByText(voce, { exact: true }).count()) > 0);
      }
      // Duplica = azione (button, non link)
      const duplicaBtn = page.getByRole("button", { name: "Duplica negozio" });
      const duplicaLinks = page.locator(`a:has-text("Duplica negozio")`).count();
      esito("Duplica negozio = azione (button, non link)", (await duplicaBtn.count()) > 0 && (await duplicaLinks) === 0);
      await snap(page, "merchant drawer 375", "15-merchant-drawer-375.png");
    }

    // Bottom nav su /merchant/{id}
    await page.goto(`${BASE}/merchant/${STORE_ID}`, { waitUntil: "networkidle" });
    const bnav = page.getByRole("navigation", { name: "Navigazione area mobile" });
    esito("bottom nav merchant presente", (await bnav.count()) > 0);
    if (await bnav.count()) {
      for (const voce of ["Negozio", "Prodotti", "Ordini", "Guadagni", "AI"]) {
        esito(`bottom nav «${voce}» presente`, (await bnav.getByText(voce, { exact: true }).count()) > 0);
      }
      const homeTopBar = page.getByRole("button", { name: "Vai alla Home" });
      esito("Home raggiungibile dal pulsante top bar", (await homeTopBar.count()) > 0);
      // Guadagni attivo su /guadagni, /incassi, /payout
      for (const [url, label] of [["/guadagni", "/guadagni"], ["/incassi", "/incassi"], ["/payout", "/payout"]]) {
        await page.goto(`${BASE}/merchant/${STORE_ID}${url}`, { waitUntil: "networkidle" });
        const g = page.getByRole("navigation", { name: "Navigazione area mobile" }).getByRole("link", { name: "Guadagni", exact: true });
        esito(`Guadagni attiva su ${label}`, (await g.getAttribute("aria-current")) === "page");
      }
    }
    await snap(page, "merchant bottom 375", "16-merchant-bottom-375.png");
    await ctx.close();
  }
}

// ════════════════════════ 5. ADMIN DESKTOP 1280 ═══════════════════════════
console.log("── ADMIN 1280 ──");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "admin-1280");
  await login(page, UTENTI.admin);

  const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
  const GRUPPI = ["Panoramica", "Negozi & Catalogo", "Ordini & Pagamenti", "Contenuti & Promozioni", "Piattaforma", "Strumenti", "Recupero"];

  async function statoGruppi(attesi) {
    let ok = true;
    for (const nome of GRUPPI) {
      const btn = nav.getByRole("button", { name: nome, exact: true });
      if ((await btn.count()) === 0) { esito(`gruppo ${nome} presente`, false); ok = false; continue; }
      const exp = await btn.first().getAttribute("aria-expanded");
      const atteso = attesi.includes(nome) ? "true" : "false";
      if (exp !== atteso) { esito(`gruppo ${nome} ${atteso === "true" ? "aperto" : "chiuso"}`, false, `(aria-expanded=${exp})`); ok = false; }
    }
    if (ok) esito(`stato gruppi corretto (aperti: ${attesi.join(", ") || "nessuno"})`, true);
  }

  // Dashboard: gruppi chiusi di default, solo Panoramica
  await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
  const r0 = await snap(page, "admin dash 1280", "17-admin-dash-1280.png");
  esito("H1 admin Panoramica = 30px", r0.h1?.size === "30px", `(${r0.h1?.size})`);
  await statoGruppi(["Panoramica"]);
  // Cestino dentro RECUPERO (chiuso di default qui)
  const voceCestino = nav.getByRole("link", { name: "Cestino", exact: true });
  esito("Cestino presente nel DOM (gruppo Recupero)", (await voceCestino.count()) > 0);
  // Negozi gestiti separati + Torna al sito
  esito("sezione «Negozi gestiti» separata", (await page.locator("aside").getByText("Negozi gestiti", { exact: true }).count()) > 0);
  const torna = page.getByRole("navigation", { name: "Navigazione rapida" }).getByRole("link", { name: "Torna al sito", exact: true });
  esito("«Torna al sito» separato con href=/", (await torna.count()) > 0 && (await torna.getAttribute("href")) === "/");

  // Pagine admin: negozi (attivita), prodotti, ordini, payout, utenti, cestino
  for (const [path, name, gruppoAttivo] of [
    ["/amministratore/attivita", "negozi", "Negozi & Catalogo"],
    ["/amministratore/prodotti", "prodotti", "Negozi & Catalogo"],
    ["/amministratore/ordini", "ordini", "Ordini & Pagamenti"],
    ["/amministratore/payout", "payout", "Ordini & Pagamenti"],
    ["/amministratore/utenti", "utenti", "Piattaforma"],
    ["/amministratore/cestino", "cestino", "Recupero"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const r = await snap(page, `admin ${name} 1280`, `18-admin-${name}-1280.png`);
    esito(`H1 admin ${name} = 30px`, r.h1?.size === "30px", `(${r.h1?.size})`);
    await statoGruppi([gruppoAttivo]);
    // Voce attiva evidenziata
    const label = name === "negozi" ? "Negozi" : name === "prodotti" ? "Prodotti" : name === "ordini" ? "Ordini" : name === "payout" ? "Payout" : name === "utenti" ? "Utenti" : "Cestino";
    const voce = nav.getByRole("link", { name: label, exact: true });
    const cls = (await voce.getAttribute("class")) ?? "";
    esito(`voce attiva ${label} evidenziata`, cls.includes("bg-blue-50"), `(su ${path})`);
  }

  // Il gruppo attivo non si chiude al click
  await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });
  const btnRec = nav.getByRole("button", { name: "Recupero", exact: true });
  await btnRec.click();
  esito("click sul gruppo attivo non lo chiude", (await btnRec.getAttribute("aria-expanded")) === "true");

  // Tutti gli href invariati (campione 20 voci)
  const VOCI = [
    ["Panoramica", "/amministratore"], ["Negozi", "/amministratore/attivita"], ["Prodotti", "/amministratore/prodotti"],
    ["Categorie", "/amministratore/categorie"], ["Negozi in evidenza", "/amministratore/negozi-in-evidenza"],
    ["Ordini", "/amministratore/ordini"], ["Incassi", "/amministratore/incassi"], ["Payout", "/amministratore/payout"],
    ["Offerte", "/amministratore/offerte"], ["Eventi", "/amministratore/eventi"], ["Contenuti", "/amministratore/contenuti"],
    ["Template", "/amministratore/template"], ["Utenti", "/amministratore/utenti"], ["Segnalazioni", "/amministratore/segnalazioni"],
    ["Statistiche", "/amministratore/statistiche"], ["Assistente AI", "/amministratore/assistente-ai"],
    ["Scansioni AI", "/amministratore/scansioni"], ["Registro attività", "/amministratore/registro-attivita"],
    ["Impostazioni", "/amministratore/impostazioni"], ["Cestino", "/amministratore/cestino"],
  ];
  let hrefOk = true;
  for (const [label, href] of VOCI) {
    const link = nav.getByRole("link", { name: label, exact: true });
    if ((await link.count()) === 0) { hrefOk = false; esito(`href ${label}`, false, "(voce assente)"); continue; }
    const reale = await link.first().getAttribute("href");
    if (reale !== href) { hrefOk = false; esito(`href ${label}`, false, `(atteso ${href}, trovato ${reale})`); }
  }
  if (hrefOk) esito("tutti i 20 href admin invariati", true);
  await ctx.close();
}

// ════════════════════════ 6. ADMIN MOBILE 375 (drawer) ════════════════════
console.log("── ADMIN 375 ──");
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  watch(page, "admin-375");
  await login(page, UTENTI.admin);
  await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });

  const hamburger = page.getByRole("button", { name: "Apri il menu" });
  esito("hamburger admin mobile presente", (await hamburger.count()) > 0);
  if (await hamburger.count()) {
    await hamburger.click();
    const drawerNav = page.getByRole("navigation", { name: "Menu Amministratore" });
    esito("sidebar admin nel drawer", (await drawerNav.count()) > 0);
    const btnNeg = drawerNav.getByRole("button", { name: "Negozi & Catalogo", exact: true });
    await btnNeg.click();
    esito("accordion apre gruppo nel drawer", (await btnNeg.getAttribute("aria-expanded")) === "true");
    const linkProd = drawerNav.getByRole("link", { name: "Prodotti", exact: true });
    esito("voce Prodotti visibile nel drawer", (await linkProd.count()) > 0);
    await snap(page, "admin drawer 375", "19-admin-drawer-375.png");
  }
  await ctx.close();
}

await browser.close();

console.log(`\n══════════════════════════════════════`);
console.log(`RISULTATO AUDIT FASE 11: ${pass} OK · ${fail} KO`);
if (consoleErrors.length) {
  console.log(`\nCONSOLE ERROR (${consoleErrors.length}):`);
  [...new Set(consoleErrors)].slice(0, 10).forEach((e) => console.log(`  - ${e}`));
}
if (httpErrors.length) {
  console.log(`\nHTTP 4xx/5xx (${httpErrors.length}):`);
  [...new Set(httpErrors)].slice(0, 15).forEach((e) => console.log(`  - ${e}`));
}
if (problemi.length) {
  console.log("\nPROBLEMI:");
  [...new Set(problemi)].forEach((p) => console.log(`  - ${p}`));
}
process.exit(fail > 0 ? 1 : 0);
