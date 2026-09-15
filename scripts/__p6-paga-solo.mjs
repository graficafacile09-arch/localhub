// P6 — DEBUG: completa il pagamento Stripe di una sessione open esistente.
// Uso: node scripts/__p6-paga-solo.mjs <checkoutId o payment_id>
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { join } from "node:path";

const JS = join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "supabase", "dist", "supabase.js");
const ARG = process.argv[2];

function dbJson(sql) {
  const r = spawnSync(process.execPath, [JS, "db", "query", "--linked", "--output-format", "json", sql], {
    encoding: "utf8", timeout: 120_000, windowsHide: true,
  });
  const o = r.stdout || "";
  return JSON.parse(o.slice(o.indexOf("[")));
}

const row = dbJson(`select redirect_url, payment_id from pagamenti_sessioni where id='${ARG}' or payment_id='${ARG}' order by created_at desc limit 1;`)[0];
if (!row) { console.log("sessione non trovata"); process.exit(1); }
console.log("redirect_url:", (row.redirect_url || "").slice(0, 70) + "…");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" });
const page = await ctx.newPage();
await page.goto(row.redirect_url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#email", { timeout: 30000 });
await page.fill("#email", "qa-paga-solo@example.com");
await page.waitForTimeout(1500);
try { await page.click("#payment-method-label-card", { force: true, timeout: 8000 }); } catch (e) { console.log("click card:", e.message.slice(0, 50)); }
await page.waitForTimeout(3000);

// riempi carta con Playwright fill (eventi corretti per React/Elements)
for (let t = 0; t < 20; t++) {
  const okN = await page.locator("#cardNumber").fill("4242 4242 4242 4242").then(() => true).catch(() => false);
  const okE = await page.locator("#cardExpiry").fill("12 / 34").then(() => true).catch(() => false);
  const okC = await page.locator("#cardCvc").fill("123").then(() => true).catch(() => false);
  if (okN && okE && okC) break;
  await page.waitForTimeout(1000);
}
// nome titolare se presente
const nomeCampo = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("input")).filter((i) => /cardholder|nome|titolare|name/i.test((i.name || "") + (i.id || "") + (i.placeholder || "")));
  return els.map((i) => ({ n: i.name, id: i.id, ph: i.placeholder })).slice(0, 3);
});
console.log("campi nome:", JSON.stringify(nomeCampo));
if (nomeCampo.length) {
  const sel = nomeCampo[0].id ? "#" + nomeCampo[0].id : `[name="${nomeCampo[0].n}"]`;
  await page.fill(sel, "Test P6").catch(() => {});
}

// dump input presenti + valori DOPO il fill
const inputs = await page.evaluate(() => Array.from(document.querySelectorAll("input")).map((i) => ({ n: i.name || "", id: i.id || "", v: i.value || "", aria: i.getAttribute("aria-invalid") })).filter((x) => x.n || x.id || x.v).slice(0, 25));
console.log("INPUT dopo fill:", JSON.stringify(inputs));

// Pay
await page.locator("button[type='submit']").first().click({ timeout: 20000 }).catch(async () => {
  await page.locator("button:has-text('Paga')").first().click({ timeout: 10000 });
});
console.log("click Pay ok");
await page.waitForTimeout(3000);

// dump campi con errore dopo il click
const dopo = await page.evaluate(() => {
  const inv = Array.from(document.querySelectorAll("input[aria-invalid='true']")).map((i) => ({ n: i.name || "", id: i.id || "", v: i.value || "" }));
  const errs = Array.from(document.querySelectorAll(".Error, .FieldError, [role='alert']")).map((e) => (e.textContent || "").trim()).filter(Boolean).slice(0, 6);
  return { inv, errs };
}).catch(() => ({}));
console.log("DOPO click Pay → invalid:", JSON.stringify(dopo.inv), "| errori:", JSON.stringify(dopo.errs));

// attendi esito
for (let i = 0; i < 40; i++) {
  const url = page.url();
  if (!url.includes("checkout.stripe.com")) { console.log("ESITO: redirect →", url.slice(0, 90)); process.exit(0); }
  const err = await page.evaluate(() => {
    const el = document.querySelector(".Error, [role='alert'], #errorElement, [aria-invalid='true'], .FieldError");
    return el ? (el.textContent || "").trim() : null;
  }).catch(() => null);
  if (err) { console.log("ESITO: errore →", JSON.stringify(err)); }
  await page.waitForTimeout(1000);
}
console.log("ESITO: timeout, url:", page.url().slice(0, 90));
await browser.close();