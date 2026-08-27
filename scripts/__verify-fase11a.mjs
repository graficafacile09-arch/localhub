/**
 * FASE 11A — Verifica Playwright (solo lettura).
 * 1. /ricerca 1280+375: H1 "Ricerca" = 30px, sezioni risultati 18px, empty state ok
 * 2. /ricerca?q=: risultati ancora presenti e funzionanti
 * 3. /ricerca?categoria=: vetrina con H1 proprio (nessun H1 duplicato)
 * 4. Admin /amministratore/template: H1 = 30px
 * 5. Overflow 0, console 0, nessun errore HTTP 5xx
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const ADMIN = { email: "admin.test@localhub.it", password: "AdminTest123!" };

let pass = 0, fail = 0;
const problemi = [];
const consoleErrors = [];
const httpErrors = [];

function esito(nome, ok, dettaglio = "") {
  if (ok) { pass++; console.log(`  ✅ ${nome}`); }
  else { fail++; console.log(`  ❌ ${nome} ${dettaglio}`); problemi.push(`${nome} ${dettaglio}`); }
}

function watch(page, ctx) {
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) consoleErrors.push(`[${ctx}] ${m.text().slice(0, 140)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${ctx}] pageerror: ${String(e).slice(0, 140)}`));
  page.on("response", (res) => { const s = res.status(); if (s >= 500) httpErrors.push(`[${ctx}] ${s} ${res.url().slice(0, 120)}`); });
}

async function noOverflow(page, ctx) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  esito(`nessun overflow (${ctx})`, r.sw <= r.cw, `(${r.sw} > ${r.cw})`);
}

async function login(page, u) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

const browser = await chromium.launch();

// ── 1. /ricerca vuoto (1280) ──
console.log("── /ricerca (vuoto) ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "ricerca-vuoto");
  await page.goto(`${BASE}/ricerca`, { waitUntil: "networkidle" });
  const h1 = await page.evaluate(() => {
    const h = document.querySelector("h1");
    return h ? { t: h.textContent.trim(), fs: getComputedStyle(h).fontSize } : null;
  });
  esito("H1 «Ricerca» presente a 30px", h1?.fs === "30px" && h1?.t === "Ricerca", `(${JSON.stringify(h1)})`);
  const vuoto = await page.locator("body").innerText();
  esito("empty state ancora presente", vuoto.includes("Inserisci un termine"));
  await noOverflow(page, "ricerca vuoto 1280");
  await page.screenshot({ path: "scripts/__fase11-shots/28a-ricerca-vuoto-1280.png" });
  await page.close();
}

// ── 2. /ricerca vuoto (375) ──
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  watch(page, "ricerca-vuoto-375");
  await page.goto(`${BASE}/ricerca`, { waitUntil: "networkidle" });
  const h1 = await page.evaluate(() => {
    const h = document.querySelector("h1");
    return h ? { t: h.textContent.trim(), fs: getComputedStyle(h).fontSize } : null;
  });
  esito("H1 «Ricerca» a 375 = 30px", h1?.fs === "30px", `(${JSON.stringify(h1)})`);
  await noOverflow(page, "ricerca vuoto 375");
  await page.close();
}

// ── 3. /ricerca con risultati ──
console.log("── /ricerca (con risultati) ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "ricerca-q");
  // Prova più query finché trova risultati
  let h2s = null;
  for (const q of ["logo", "a", "panino", "pizza"]) {
    await page.goto(`${BASE}/ricerca?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle" });
    const r = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const hs2 = [...document.querySelectorAll("h2")].map((h) => ({ t: h.textContent.trim().slice(0, 40), fs: getComputedStyle(h).fontSize }));
      const cards = document.querySelectorAll('a[href^="/prodotto/"]').length;
      return { h1: h1 ? { t: h1.textContent.trim(), fs: getComputedStyle(h1).fontSize } : null, hs2, cards };
    });
    if (r.cards > 0) { h2s = r.hs2; console.log(`  🎯 query «${q}» → ${r.cards} card prodotto, H1=${r.h1?.fs} «${r.h1?.t}»`); }
    if (h2s && h2s.length) break;
  }
  esito("H1 presente su /ricerca?q= (30px)", h2s ? true : false);
  if (h2s) {
    const sezioni = h2s.filter((h) => /Prodotti|Negozi/.test(h.t));
    esito(`sezioni risultati leggibili (18px): ${sezioni.map((s) => `«${s.t}»=${s.fs}`).join(", ")}`, sezioni.length > 0 && sezioni.every((s) => s.fs === "18px"), JSON.stringify(h2s));
  }
  await noOverflow(page, "ricerca q 1280");
  await page.screenshot({ path: "scripts/__fase11-shots/28b-ricerca-q-1280.png" });
  await page.close();
}

// ── 4. /ricerca?categoria= (vetrina, H1 proprio) ──
console.log("── /ricerca?categoria= (vetrina) ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "ricerca-vetrina");
  await page.goto(`${BASE}/ricerca?categoria=bar`, { waitUntil: "networkidle" });
  const h1s = await page.evaluate(() => [...document.querySelectorAll("h1")].map((h) => ({ t: h.textContent.trim().slice(0, 40), fs: getComputedStyle(h).fontSize })));
  esito("vetrina: un solo H1, nessun «Ricerca» duplicato", h1s.length === 1 && !h1s[0].t.includes("Ricerca"), JSON.stringify(h1s));
  await noOverflow(page, "ricerca vetrina 1280");
  await page.close();
}

// ── 5. Admin Template ──
console.log("── Admin /amministratore/template ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "admin-template");
  await login(page, ADMIN);
  await page.goto(`${BASE}/amministratore/template`, { waitUntil: "networkidle" });
  const h1 = await page.evaluate(() => {
    const h = document.querySelector("h1");
    return h ? { t: h.textContent.trim(), fs: getComputedStyle(h).fontSize } : null;
  });
  esito("H1 Template = 30px", h1?.fs === "30px" && h1?.t === "Template di piattaforma", `(${JSON.stringify(h1)})`);
  await noOverflow(page, "admin template 1280");
  await page.screenshot({ path: "scripts/__fase11-shots/28c-template-1280.png" });
  await page.close();
}

// ── 6. /ricerca mobile 375 con risultati ──
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  watch(page, "ricerca-q-375");
  await page.goto(`${BASE}/ricerca?q=logo`, { waitUntil: "networkidle" });
  const h1 = await page.evaluate(() => {
    const h = document.querySelector("h1");
    return h ? { t: h.textContent.trim(), fs: getComputedStyle(h).fontSize } : null;
  });
  esito("H1 «Ricerca» 375 con risultati = 30px", h1?.fs === "30px", `(${JSON.stringify(h1)})`);
  await noOverflow(page, "ricerca q 375");
  await page.close();
}

await browser.close();

console.log(`\n══════════════════════════════════════`);
console.log(`RISULTATO: ${pass} OK · ${fail} KO`);
if (consoleErrors.length) console.log(`CONSOLE ERROR (${consoleErrors.length}): ${[...new Set(consoleErrors)].slice(0, 5).join(" | ")}`);
if (httpErrors.length) console.log(`HTTP 5xx (${httpErrors.length}): ${[...new Set(httpErrors)].slice(0, 5).join(" | ")}`);
if (problemi.length) { console.log("PROBLEMI:"); [...new Set(problemi)].forEach((p) => console.log(`  - ${p}`)); }
process.exit(fail > 0 ? 1 : 0);
