/**
 * FASE 11B — Verifica Playwright (solo lettura).
 * I 6 H1 portati a 30px: Cestino, Scansioni, Preferiti, Segnalazioni,
 * Ordini (cliente), Dettaglio Payout. Desktop 1280 + mobile 375.
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

async function checkH1(page, ctx, atteso, vp) {
  const h1 = await page.evaluate(() => {
    const h = document.querySelector("h1");
    return h ? { t: h.textContent.trim().slice(0, 50), fs: getComputedStyle(h).fontSize } : null;
  });
  const ok = h1?.fs === "30px";
  esito(`H1 ${ctx} = 30px (${h1?.fs}) «${h1?.t}»`, ok, JSON.stringify(h1));
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  esito(`overflow ${ctx}`, r.sw <= r.cw, `(${r.sw} > ${r.cw})`);
  if (vp && atteso) await page.screenshot({ path: `scripts/__fase11-shots/29-${ctx.replace(/\s+/g, "-")}-${vp}.png` });
}

const browser = await chromium.launch();

// ── ADMIN (Cestino, Scansioni, Dettaglio Payout) ──
console.log("── ADMIN ──");
{
  for (const vp of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width: vp, height: vp === 1280 ? 900 : 812 } });
    watch(page, `admin-${vp}`);
    await login(page, UTENTI.admin);

    await page.goto(`${BASE}/amministratore/cestino`, { waitUntil: "networkidle" });
    await checkH1(page, `cestino ${vp}`, true, vp);

    await page.goto(`${BASE}/amministratore/scansioni`, { waitUntil: "networkidle" });
    await checkH1(page, `scansioni ${vp}`, true, vp);

    // Dettaglio payout: serve un payoutId. Se la pagina ha un link verso il dettaglio, lo uso.
    await page.goto(`${BASE}/amministratore/payout`, { waitUntil: "networkidle" });
    const link = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/payout/"]');
      return a ? a.getAttribute("href") : null;
    });
    if (link) {
      await page.goto(`${BASE}${link}`, { waitUntil: "networkidle" });
      await checkH1(page, `dettaglio payout ${vp}`, true, vp);
    } else {
      esito(`dettaglio payout ${vp}: link presente`, false, "(nessun payout nel DB per il link)");
    }
    await page.close();
  }
}

// ── CLIENTE (Preferiti, Segnalazioni, Ordini) ──
console.log("── CLIENTE ──");
{
  for (const vp of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width: vp, height: vp === 1280 ? 900 : 812 } });
    watch(page, `cli-${vp}`);
    await login(page, UTENTI.customerA);

    await page.goto(`${BASE}/cliente/preferiti`, { waitUntil: "networkidle" });
    await checkH1(page, `preferiti ${vp}`, true, vp);

    await page.goto(`${BASE}/cliente/segnalazioni`, { waitUntil: "networkidle" });
    await checkH1(page, `segnalazioni ${vp}`, true, vp);

    await page.goto(`${BASE}/cliente/ordini`, { waitUntil: "networkidle" });
    await checkH1(page, `ordini ${vp}`, true, vp);
    await page.close();
  }
}

await browser.close();

console.log(`\n══════════════════════════════════════`);
console.log(`RISULTATO: ${pass} OK · ${fail} KO`);
if (consoleErrors.length) console.log(`CONSOLE ERROR (${consoleErrors.length}): ${[...new Set(consoleErrors)].slice(0, 5).join(" | ")}`);
if (httpErrors.length) console.log(`HTTP 5xx (${httpErrors.length}): ${[...new Set(httpErrors)].slice(0, 5).join(" | ")}`);
if (problemi.length) { console.log("PROBLEMI:"); [...new Set(problemi)].forEach((p) => console.log(`  - ${p}`)); }
process.exit(fail > 0 ? 1 : 0);
