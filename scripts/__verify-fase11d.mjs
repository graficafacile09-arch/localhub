/**
 * FASE 11D — Verifica Playwright (solo lettura).
 * Input ricerca admin = 42px (40+bordo, allineati ai select), segnalazioni
 * cliente = 40px, input già coerenti non toccati, overflow/console/5xx.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const UTENTI = {
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!" },
  customerA: { email: "customer-a.test@localhub.it", password: "CustomerTest123!" },
};

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

async function login(page, u) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

async function inputRicerca(page) {
  return page.evaluate(() => {
    const el = document.querySelector('input[type="search"]');
    return el ? { h: Math.round(el.getBoundingClientRect().height), ph: (el.placeholder || "").slice(0, 30) } : null;
  });
}

const browser = await chromium.launch();

// ── ADMIN: campi ricerca 42px (40+bordo, allineati ai select) ──
for (const vp of [1280, 375]) {
  console.log(`── ADMIN ${vp} ──`);
  const page = await browser.newPage({ viewport: { width: vp, height: vp === 1280 ? 900 : 812 } });
  watch(page, `admin-${vp}`);
  await login(page, UTENTI.admin);
  for (const [path, nome] of [
    ["/amministratore/attivita", "negozi"],
    ["/amministratore/negozi-in-evidenza", "evidenza"],
    ["/amministratore/categorie", "categorie"],
    ["/amministratore/eventi", "eventi"],
    ["/amministratore/offerte", "offerte"],
    ["/amministratore/registro-attivita", "registro"],
    ["/amministratore/segnalazioni", "segnalazioni"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const r = await inputRicerca(page);
    esito(`input ricerca ${nome} ${vp} = 42px`, r?.h === 42, `(trovato ${r?.h}px «${r?.ph}»)`);
  }
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  esito(`nessun overflow admin ${vp}`, ovf <= 1, `(+${ovf}px)`);
  await page.close();
}

// ── CLIENTE: segnalazioni 40px + ricerca/profilo già coerenti non toccati ──
console.log("── CLIENTE ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "cliente");
  await login(page, UTENTI.customerA);
  await page.goto(`${BASE}/cliente/segnalazioni`, { waitUntil: "networkidle" });
  const inputs = await page.evaluate(() => [...document.querySelectorAll("input")].map((el) => Math.round(el.getBoundingClientRect().height)));
  esito(`segnalazioni: input = 40px`, inputs.every((h) => h === 40), `(${inputs.join(",")})`);
  await page.goto(`${BASE}/cliente/profilo`, { waitUntil: "networkidle" });
  const prof = await page.evaluate(() => [...document.querySelectorAll("input")].map((el) => Math.round(el.getBoundingClientRect().height)));
  esito(`profilo: input già coerenti (40px)`, prof.every((h) => h === 40), `(${prof.join(",")})`);
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  esito(`nessun overflow cliente 1280`, ovf <= 1, `(+${ovf}px)`);
  await page.close();
}

// ── Form submission invariato (login form ancora funzionante) ──
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "login-check");
  await login(page, UTENTI.customerA);
  esito("login form funziona ancora (redirect a /cliente)", page.url().includes("/cliente"));
  await page.close();
}

await browser.close();

console.log(`\n══════════════════════════════════════`);
console.log(`RISULTATO: ${pass} OK · ${fail} KO`);
if (consoleErrors.length) console.log(`CONSOLE ERROR (${consoleErrors.length}): ${[...new Set(consoleErrors)].slice(0, 5).join(" | ")}`);
if (httpErrors.length) console.log(`HTTP 5xx (${httpErrors.length}): ${[...new Set(httpErrors)].slice(0, 5).join(" | ")}`);
if (problemi.length) { console.log("PROBLEMI:"); [...new Set(problemi)].forEach((p) => console.log(`  - ${p}`)); }
process.exit(fail > 0 ? 1 : 0);
