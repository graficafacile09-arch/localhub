/**
 * FASE 11C — Verifica Playwright (solo lettura).
 * Altezze CTA admin: attivita (Modifica), categorie (Nuova categoria),
 * utenti (Nuovo utente), impostazioni (Salva) = 40px; offerte/eventi
 * invariati 40px; cestino compatta intenzionale (~38px).
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

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(ADMIN.email);
  await page.locator("#password").fill(ADMIN.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

/** Trova la CTA per testo e ne misura l'altezza. */
async function altezza(page, testo) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll("a,button")].find((x) => x.textContent.trim().includes(t) && x.className && String(x.className).includes("btn-cta"));
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  }, testo);
}

const browser = await chromium.launch();

for (const vp of [1280, 375]) {
  console.log(`── ADMIN ${vp} ──`);
  const page = await browser.newPage({ viewport: { width: vp, height: vp === 1280 ? 900 : 812 } });
  watch(page, `admin-${vp}`);
  await login(page);

  // Negozi → Modifica (card)
  await page.goto(`${BASE}/amministratore/attivita`, { waitUntil: "networkidle" });
  const m1 = await altezza(page, "Modifica");
  esito(`CTA «Modifica» negozi = 40px`, m1 === 40, `(trovata ${m1}px)`);

  // Categorie → Nuova categoria + submit Crea
  await page.goto(`${BASE}/amministratore/categorie`, { waitUntil: "networkidle" });
  const c1 = await altezza(page, "Nuova categoria");
  esito(`CTA «Nuova categoria» = 40px`, c1 === 40, `(trovata ${c1}px)`);
  await page.getByRole("button", { name: "Nuova categoria" }).click().catch(() => {});
  await page.waitForTimeout(300);
  const c2 = await altezza(page, "Crea");
  esito(`CTA submit «Crea» categorie = 40px`, c2 === 40, `(trovata ${c2}px)`);

  // Utenti → Nuovo utente
  await page.goto(`${BASE}/amministratore/utenti`, { waitUntil: "networkidle" });
  const u1 = await altezza(page, "Nuovo utente");
  esito(`CTA «Nuovo utente» = 40px`, u1 === 40, `(trovata ${u1}px)`);

  // Impostazioni → Salva
  await page.goto(`${BASE}/amministratore/impostazioni`, { waitUntil: "networkidle" });
  const s1 = await altezza(page, "Salva");
  esito(`CTA «Salva» impostazioni = 40px`, s1 === 40, `(trovata ${s1}px)`);

  // Offerte / Eventi → invariati 40px
  await page.goto(`${BASE}/amministratore/offerte`, { waitUntil: "networkidle" });
  const o1 = await altezza(page, "Offerta");
  esito(`CTA offerte = 40px (invariata)`, o1 === 40 || o1 === null, `(trovata ${o1}px)`);
  await page.goto(`${BASE}/amministratore/eventi`, { waitUntil: "networkidle" });
  const e1 = await altezza(page, "Evento");
  esito(`CTA eventi = 40px (invariata)`, e1 === 40 || e1 === null, `(trovata ${e1}px)`);

  // Overflow
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  esito(`nessun overflow (${vp})`, r.sw <= r.cw, `(${r.sw} > ${r.cw})`);

  await page.screenshot({ path: `scripts/__fase11-shots/30-cta-admin-${vp}.png` });
  await page.close();
}

await browser.close();

console.log(`\n══════════════════════════════════════`);
console.log(`RISULTATO: ${pass} OK · ${fail} KO`);
if (consoleErrors.length) console.log(`CONSOLE ERROR (${consoleErrors.length}): ${[...new Set(consoleErrors)].slice(0, 5).join(" | ")}`);
if (httpErrors.length) console.log(`HTTP 5xx (${httpErrors.length}): ${[...new Set(httpErrors)].slice(0, 5).join(" | ")}`);
if (problemi.length) { console.log("PROBLEMI:"); [...new Set(problemi)].forEach((p) => console.log(`  - ${p}`)); }
process.exit(fail > 0 ? 1 : 0);
