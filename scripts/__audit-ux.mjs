/**
 * AUDIT UX/UI (FASE 10 — SOLO LETTURA)
 *
 * Visita le schermate principali dei 4 ambienti (pubblico, cliente, merchant,
 * admin) con gli account fixture, cattura screenshot (desktop 1280 + mobile
 * 375) e raccoglie metriche strutturali (menu, sidebar, dimensioni, colori).
 * Non modifica nulla.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3100";
const STORE = "f3a82af7-dd47-482f-8a49-ea58e692238c";
const OUT = "screenshots-ux-audit";

const UTENTI = {
  customer: { email: "customer-a.test@localhub.it", password: "CustomerTest123!", area: "cliente", dest: "/cliente" },
  merchant: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!", area: "merchant", dest: "/merchant" },
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!", area: "admin", dest: "/amministratore" },
};

const browser = await chromium.launch();
const report = [];

async function login(ctx, ruolo) {
  const page = await ctx.newPage();
  const u = UTENTI[ruolo];
  await page.goto(`${BASE}/login?area=${u.area}`);
  await page.waitForSelector("#email", { timeout: 15000 });
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.click('form[action="/api/auth/login"] button[type="submit"]');
  await page.waitForURL(`**${u.dest}**`, { timeout: 25000 });
  await page.waitForTimeout(800);
  return page;
}

async function capture(page, nome, vw) {
  await page.setViewportSize({ width: vw, height: 900 });
  await page.waitForTimeout(700);
  const file = `${OUT}/${nome}@${vw}.png`;
  await page.screenshot({ path: file });
  // metriche strutturali della pagina
  const m = await page.evaluate(() => {
    const el = (sel) => document.querySelector(sel);
    const css = (sel, prop) => {
      const e = el(sel);
      return e ? getComputedStyle(e)[prop] : null;
    };
    const aside = document.querySelector("aside");
    const navPrinc = document.querySelector('nav[aria-label="Navigazione principale"]');
    const header = document.querySelector("header");
    const raccogliNav = (root) =>
      root
        ? [...root.querySelectorAll("a, button")].map((a) => ({
            testo: (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
            href: a.getAttribute("href") || null,
            cls: (typeof a.className === "string" ? a.className : "").slice(0, 60),
          }))
        : [];
    return {
      url: location.pathname,
      titolo: document.title,
      h1: el("h1")?.textContent?.trim() ?? null,
      headerNav: raccogliNav(navPrinc),
      asideNav: raccogliNav(aside),
      h1Font: css("h1", "fontSize"),
      h2Font: css("h2", "fontSize"),
      bodyFont: css("body", "fontSize"),
      bodyColore: css("body", "color"),
      btnPrimary: (() => {
        const btns = [...document.querySelectorAll("button, a")].filter(
          (b) => /yellow|amber|btn-cta|bg-yellow/i.test(b.className) || /#eab308|rgb\(250, 204, 21\)|rgb\(234, 179, 8\)/.test(getComputedStyle(b).backgroundColor)
        );
        const b = btns[0];
        return b ? { testo: (b.textContent || "").trim().slice(0, 30), bg: getComputedStyle(b).backgroundColor, fontSize: getComputedStyle(b).fontSize, h: Math.round(b.getBoundingClientRect().height) } : null;
      })(),
      cardCount: document.querySelectorAll('[class*="card"], [class*="rounded-2xl"], [class*="rounded-xl"]').length,
      cardRadius: css('[class*="card"], [class*="rounded-2xl"]', "borderRadius"),
      shadow: css('[class*="card"], [class*="rounded-2xl"]', "boxShadow"),
      tabella: (() => {
        const t = document.querySelector("table");
        return t ? { n: t.rows?.length ?? 0, font: getComputedStyle(t).fontSize } : null;
      })(),
    };
  });
  report.push({ nome, vw, ...m });
}

// ── A. PUBBLICO ─────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const [nome, url] of [
    ["home", "/"],
    ["negozi", "/negozi"],
    ["categorie", "/categorie"],
    ["carrello", "/carrello"],
    ["ricerca", "/ricerca?q=pizza"],
    ["login", "/login?area=cliente"],
  ]) {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await capture(page, `pubblico-${nome}`, 1280);
    await capture(page, `pubblico-${nome}`, 375);
  }
  await ctx.close();
}

// ── B. CLIENTE ──────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const page = await login(ctx, "customer");
  for (const [nome, url] of [
    ["dashboard", "/cliente"],
    ["preferiti", "/cliente/preferiti"],
    ["ordini", "/cliente/ordini"],
    ["profilo", "/cliente/profilo"],
  ]) {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await capture(page, `cliente-${nome}`, 1280);
    await capture(page, `cliente-${nome}`, 375);
  }
  await ctx.close();
}

// ── C. MERCHANT (utente con negozio cestinato + UI reale via admin) ─────
{
  // merchantA: elenco negozi (fixture cestinati → stato vuoto)
  const ctx = await browser.newContext();
  const page = await login(ctx, "merchant");
  await capture(page, "merchant-elenco", 1280);
  await capture(page, "merchant-elenco", 375);
  await ctx.close();
}
{
  // UI venditore reale via sessione admin su Panificio Rossi
  const ctx = await browser.newContext();
  const page = await login(ctx, "admin");
  for (const [nome, url] of [
    ["dashboard", `/merchant/${STORE}`],
    ["prodotti", `/merchant/${STORE}/prodotti`],
    ["guadagni", `/merchant/${STORE}/guadagni`],
    ["ordini", `/merchant/${STORE}/ordini`],
  ]) {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await capture(page, `merchant-${nome}`, 1280);
    await capture(page, `merchant-${nome}`, 375);
  }
  await ctx.close();
}

// ── D. AMMINISTRATORE ───────────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const page = await login(ctx, "admin");
  for (const [nome, url] of [
    ["dashboard", "/amministratore"],
    ["negozi", "/amministratore/attivita"],
    ["categorie", "/amministratore/categorie"],
    ["prodotti", "/amministratore/prodotti"],
    ["ordini", "/amministratore/ordini"],
    ["incassi", "/amministratore/incassi"],
    ["payout", "/amministratore/payout"],
    ["cestino", "/amministratore/cestino"],
    ["utenti", "/amministratore/utenti"],
    ["template", "/amministratore/template"],
  ]) {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await capture(page, `admin-${nome}`, 1280);
    await capture(page, `admin-${nome}`, 375);
  }
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/metrics.json`, JSON.stringify(report, null, 2));
console.log(`Screenshot + metriche salvati in ${OUT}/ (${report.length} acquisizioni)`);
process.exit(0);
