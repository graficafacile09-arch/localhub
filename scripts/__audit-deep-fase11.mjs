/**
 * FASE 11 (profonda) — Audit UX/UI sistematico post-10A/10B/10C.
 * Solo lettura: nessuna modifica. Misurazioni + screenshot reali.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3100";
const SHOTS = "scripts/__fase11-shots/deep";
mkdirSync(SHOTS, { recursive: true });

const UTENTI = {
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!" },
  merchantA: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!" },
  customerA: { email: "customer-a.test@localhub.it", password: "CustomerTest123!" },
};
const STORE_ID = "qa-nav-check";

const risultati = { pagine: [], h1: [], bottoni: [], input: [], card: [] };
const problemi = [];
const consoleErrors = [];
const httpErrors = [];
let pass = 0, fail = 0;

function esito(nome, ok, dettaglio = "") {
  if (ok) { pass++; } else { fail++; problemi.push(`${nome} ${dettaglio}`); }
}

async function login(page, utente) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(utente.email);
  await page.locator("#password").fill(utente.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

function watch(page, ctx) {
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) consoleErrors.push(`[${ctx}] ${m.text().slice(0, 140)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${ctx}] pageerror: ${String(e).slice(0, 140)}`));
  page.on("response", (res) => { const s = res.status(); if (s >= 400 && !/favicon/i.test(res.url())) httpErrors.push(`[${ctx}] ${s} ${res.url().slice(0, 120)}`); });
}

/** Misurazione completa di una pagina. */
async function misura(page, ctx, shotName) {
  const m = await page.evaluate(() => {
    const d = document.documentElement;
    const css = (el) => { if (!el) return null; const s = getComputedStyle(el); return { fs: s.fontSize, fw: s.fontWeight, lh: s.lineHeight, r: s.borderRadius, h: Math.round(el.getBoundingClientRect().height) }; };
    const h1 = document.querySelector("h1");
    const h2 = document.querySelector("h2");
    const btn = [...document.querySelectorAll("a,button")].find((x) => x.className && String(x.className).includes("btn-cta"));
    const inp = document.querySelector('input[type="email"], input[type="password"], input[type="text"], input[type="search"]');
    const card = document.querySelector('[class*="rounded-"], [class*="rounded-["');
    const h1s = [...document.querySelectorAll("h1")].map((h) => ({ t: h.textContent.trim().slice(0, 40), ...css(h) }));
    const h2s = [...document.querySelectorAll("h2")].slice(0, 3).map((h) => ({ t: h.textContent.trim().slice(0, 40), ...css(h) }));
    return {
      url: location.pathname,
      sw: d.scrollWidth, cw: d.clientWidth,
      h1s, h2s,
      btnCta: btn ? css(btn) : null,
      input: inp ? css(inp) : null,
      card: card ? css(card) : null,
    };
  });
  risultati.pagine.push(m);
  if (m.h1s.length) risultati.h1.push(...m.h1s.map((h) => ({ ctx, ...h })));
  if (m.btnCta) risultati.bottoni.push({ ctx, ...m.btnCta });
  if (m.input) risultati.input.push({ ctx, ...m.input });
  if (m.card) risultati.card.push({ ctx, ...m.card });
  const ovf = m.sw - m.cw;
  if (ovf > 1) { fail++; problemi.push(`OVERFLOW +${ovf}px su ${ctx}`); console.log(`  ❌ overflow ${ctx}: +${ovf}px`); }
  if (shotName) { try { await page.screenshot({ path: `${SHOTS}/${shotName}`, fullPage: false }); } catch {} }
  return m;
}

const browser = await chromium.launch();

// ═══════════ PUBBLICO 1280 (pagine mancanti dall'audit rapido) ═══════════
console.log("── PUBBLICO 1280 ──");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "pub1280");

  await page.goto(`${BASE}/ricerca`, { waitUntil: "networkidle" });
  const r = await misura(page, "ricerca 1280", "20-ricerca-1280.png");
  if (r.h1s[0]) esito(`H1 /ricerca = 30px`, r.h1s[0].fs === "30px", `(trovato ${r.h1s[0].fs} «${r.h1s[0].t}»)`);
  console.log(`  📐 /ricerca H1=${r.h1s[0]?.fs}`);

  await page.goto(`${BASE}/negozio/bar-dei-capoccioni`, { waitUntil: "networkidle" });
  const rn = await misura(page, "negozio 1280", "21-negozio-1280.png");
  if (rn.h1s[0]) esito(`H1 /negozio = 30px`, rn.h1s[0].fs === "30px", `(trovato ${rn.h1s[0].fs} «${rn.h1s[0].t}»)`);
  console.log(`  📐 /negozio H1=${rn.h1s[0]?.fs} H2=${rn.h2s.map(h=>h.fs).join(",")}`);

  // Checkout (layout 10C) — con sessione cliente
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(UTENTI.customerA.email);
  await page.locator("#password").fill(UTENTI.customerA.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
  await page.goto(`${BASE}/prodotto/logo-a-b-b-a-unionturismo/acquista`, { waitUntil: "networkidle" });
  const ra = await misura(page, "checkout 1280", "22-checkout-1280.png");
  if (ra.h1s[0]) esito(`H1 checkout = 30px`, ra.h1s[0].fs === "30px", `(trovato ${ra.h1s[0].fs} «${ra.h1s[0].t}»)`);
  console.log(`  📐 checkout H1=${ra.h1s[0]?.fs} (url=${ra.url})`);
  await ctx.close();
}

// ═══════════ CLIENTE (profilo, segnalazioni) ═══════════
console.log("── CLIENTE ──");
{
  for (const [vp, tag] of [[1280, "1280"], [375, "375"]]) {
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp === 1280 ? 900 : 812 } });
    const page = await ctx.newPage();
    watch(page, `cli-${tag}`);
    await login(page, UTENTI.customerA);
    for (const [path, name] of [["/cliente/profilo", "profilo"], ["/cliente/segnalazioni", "segnalazioni"]]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const m = await misura(page, `cliente ${name} ${tag}`, `23-${name}-${tag}.png`);
      if (m.h1s[0]) esito(`H1 cliente ${name} ${tag} = 30px`, m.h1s[0].fs === "30px", `(${m.h1s[0].fs} «${m.h1s[0].t}»)`);
      console.log(`  📐 cliente/${name} ${tag} H1=${m.h1s[0]?.fs} H2=${m.h2s.map(h=>h.fs).join(",")}`);
    }
    await ctx.close();
  }
}

// ═══════════ MERCHANT (pagine navegabili + misure) ═══════════
console.log("── MERCHANT ──");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "merch1280");
  await login(page, UTENTI.merchantA);
  await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
  const m0 = await misura(page, "merchant home 1280", "24-merchant-home-1280.png");
  console.log(`  📐 /merchant H1=${m0.h1s[0]?.fs} H2=${m0.h2s.map(h=>h.fs).join(",")}`);
  // Stato senza negozio: CTA presente?
  const ctaEmpty = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("a,button")].map((x) => x.textContent.trim().slice(0, 40));
    return btns.filter((t) => /Crea|negozio/i.test(t)).slice(0, 5);
  });
  console.log(`  🎯 CTA stato vuoto /merchant: ${JSON.stringify(ctaEmpty)}`);
  await ctx.close();

  // Drawer: misure sidebar merchant (gruppi)
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    watch(page, "merch375");
    await login(page, UTENTI.merchantA);
    await page.goto(`${BASE}/merchant/${STORE_ID}/guadagni`, { waitUntil: "networkidle" });
    const hamb = page.getByRole("button", { name: "Apri il menu" });
    if (await hamb.count()) {
      await hamb.click();
      const nav = page.getByRole("navigation", { name: "Menu negozio" });
      const struttura = await page.evaluate(() => {
        const el = document.querySelector('nav[aria-label="Menu negozio"]');
        if (!el) return null;
        const links = [...el.querySelectorAll("a")].map((a) => ({ t: a.textContent.trim().slice(0, 30), h: a.getAttribute("href") }));
        const sezioni = [...el.querySelectorAll("*")].filter((x) => x.textContent.trim() === "Strumenti" && x.children.length === 0).length;
        return { links, sezioni };
      });
      console.log(`  🎯 sidebar merchant (drawer): ${struttura?.links.length} link, sezione Strumenti=${struttura?.sezioni}`);
      await page.screenshot({ path: `${SHOTS}/25-merchant-guadagni-375.png` });
    }
    // Contenuto /guadagni (cosa vede l'utente con negozio non posseduto)
    await page.goto(`${BASE}/merchant/${STORE_ID}/guadagni`, { waitUntil: "networkidle" });
    const body = (await page.locator("body").innerText()).slice(0, 200);
    console.log(`  🎯 contenuto /guadagni (non posseduto): "${body.replace(/\n/g, " | ").slice(0, 140)}"`);
    await ctx.close();
  }
}

// ═══════════ ADMIN — tutte le pagine per gruppo ═══════════
console.log("── ADMIN (tutti i gruppi) ──");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "admin1280");
  await login(page, UTENTI.admin);

  const pagine = [
    ["/amministratore", "panoramica"],
    ["/amministratore/attivita", "negozi"],
    ["/amministratore/prodotti", "prodotti"],
    ["/amministratore/categorie", "categorie"],
    ["/amministratore/negozi-in-evidenza", "evidenza"],
    ["/amministratore/ordini", "ordini"],
    ["/amministratore/incassi", "incassi"],
    ["/amministratore/payout", "payout"],
    ["/amministratore/offerte", "offerte"],
    ["/amministratore/eventi", "eventi"],
    ["/amministratore/contenuti", "contenuti"],
    ["/amministratore/template", "template"],
    ["/amministratore/utenti", "utenti"],
    ["/amministratore/segnalazioni", "segnalazioni"],
    ["/amministratore/statistiche", "statistiche"],
    ["/amministratore/assistente-ai", "assistente-ai"],
    ["/amministratore/scansioni", "scansioni"],
    ["/amministratore/registro-attivita", "registro"],
    ["/amministratore/impostazioni", "impostazioni"],
    ["/amministratore/cestino", "cestino"],
  ];
  for (const [path, name] of pagine) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const m = await misura(page, `admin ${name}`, `26-admin-${name}.png`);
    if (m.h1s[0]) esito(`H1 admin ${name} = 30px`, m.h1s[0].fs === "30px", `(${m.h1s[0].fs} «${m.h1s[0].t}»)`);
    console.log(`  📐 admin/${name} H1=${m.h1s[0]?.fs} H2=${m.h2s.map(h=>h.fs).join(",")}`);
  }

  // Densità sidebar: tutte le voci con tutti i gruppi aperti
  await page.goto(`${BASE}/amministratore`, { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation", { name: "Menu Amministratore" });
  for (const g of ["Negozi & Catalogo", "Ordini & Pagamenti", "Contenuti & Promozioni", "Piattaforma", "Strumenti", "Recupero"]) {
    const btn = nav.getByRole("button", { name: g, exact: true });
    if (await btn.count()) { try { await btn.click(); } catch {} }
  }
  await page.waitForTimeout(300);
  const densita = await page.evaluate(() => {
    const el = document.querySelector('nav[aria-label="Menu Amministratore"]');
    if (!el) return null;
    const links = [...el.querySelectorAll("a")].length;
    const groups = [...el.querySelectorAll("button[aria-expanded]")].map((b) => b.textContent.trim()).filter(Boolean);
    return { links, groups: groups.length };
  });
  console.log(`  🎯 densità sidebar admin: ${densita?.links} link · ${densita?.groups} gruppi`);
  await page.screenshot({ path: `${SHOTS}/27-admin-sidebar-open-1280.png` });
  await ctx.close();
}

await browser.close();

// ═══════════ ANALISI TRASVERSALE ═══════════
console.log("\n══════════ ANALISI TRASVERSALE ══════════");

// H1 non-30px
const h1Anomali = risultati.h1.filter((h) => h.fs !== "30px" && h.fs !== "48px");
console.log(`\n📐 H1 fuori scala (≠30px e ≠48px): ${h1Anomali.length}`);
for (const h of h1Anomali) console.log(`  - ${h.ctx}: ${h.fs} «${h.t}»`);

// Altezze btn-cta
const btnSet = new Set(risultati.bottoni.map((b) => `${b.ctx}: ${b.h}px`));
console.log(`\n🔘 btn-cta misurati (${risultati.bottoni.length}):`);
for (const b of [...btnSet]) console.log(`  - ${b}`);

// H2: scala
const h2Set = [...new Set(risultati.pagine.flatMap((p) => p.h2s.map((h) => h.fs)))];
console.log(`\n📐 Scala H2 osservata: ${h2Set.join(", ")}`);

// Input
const inpSet = new Set(risultati.input.map((i) => `${i.ctx}: h=${i.h}px fs=${i.fs}`));
console.log(`\n⌨️ Input misurati: ${[...inpSet].slice(0, 8).join(" | ")}`);

// Card
const cardSet = new Set(risultati.card.map((c) => `${c.ctx}: radius=${c.r}`));
console.log(`\n💳 Card radius campione: ${[...cardSet].slice(0, 10).join(" | ")}`);

// Errori
console.log(`\nCONSOLE ERROR: ${consoleErrors.length}${consoleErrors.length ? "\n  " + [...new Set(consoleErrors)].slice(0, 8).join("\n  ") : ""}`);
console.log(`HTTP 4xx/5xx: ${httpErrors.length}${httpErrors.length ? "\n  " + [...new Set(httpErrors)].slice(0, 10).join("\n  ") : ""}`);
console.log(`\nRISULTATO: ${pass} OK · ${fail} KO`);
if (problemi.length) { console.log("PROBLEMI:"); [...new Set(problemi)].forEach((p) => console.log(`  - ${p}`)); }
process.exit(fail > 0 ? 1 : 0);
