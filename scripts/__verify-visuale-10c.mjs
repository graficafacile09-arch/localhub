import { chromium } from "playwright";

const BASE = "http://localhost:3100";
let pass = 0, fail = 0;

async function check(page, label, fn) {
  try {
    const r = await fn(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) { fail++; console.log(`❌ [${label}] OVERFLOW +${overflow}px`); }
    else { pass++; console.log(`✅ [${label}] ${r}`); }
  } catch (e) {
    fail++;
    console.log(`❌ [${label}] ${e.message.split("\n")[0]}`);
  }
}

const browser = await chromium.launch();
const errors = [];

// ── 1. Titoli pubblici (H1 >= 28px) ────────────────────────────────────────
for (const [url, vp, label] of [
  ["/negozi", 1280, "H1 /negozi desktop"],
  ["/negozi", 375, "H1 /negozi mobile"],
  ["/categorie", 1280, "H1 /categorie desktop"],
  ["/categorie", 375, "H1 /categorie mobile"],
]) {
  const page = await browser.newPage({ viewport: { width: vp, height: 800 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await check(page, label, async () => {
    const fs = await page.evaluate(() => {
      const h = document.querySelector("h1");
      return h ? getComputedStyle(h).fontSize : null;
    });
    const ok = parseFloat(fs) >= 28;
    return `H1 = ${fs}px ${ok ? "✓ scala coerente" : "✗ ancora piccolo"}`;
  });
  await page.close();
}

// ── 2. H1 carrello (vuoto) e checkout ──────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE + "/carrello", { waitUntil: "networkidle" });
  await check(page, "H1 /carrello mobile", async () => {
    const fs = await page.evaluate(() => {
      const h = document.querySelector("h1");
      return h ? getComputedStyle(h).fontSize : null;
    });
    return `H1 carrello = ${fs}px`;
  });
  await page.close();
}

// ── 3. Pulsante "Esplora i negozi" uniforme (40px) in area cliente ─────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE + "/login?area=cliente", { waitUntil: "networkidle" });
  // login
  await page.fill('input[type="email"], input[name="email"]', "customer-a.test@localhub.it").catch(() => {});
  await page.fill('input[type="password"], input[name="password"]', "CustomerTest123!").catch(() => {});
  await page.click('button[type="submit"], button:has-text("Accedi"), button:has-text("Entra")');
  await page.waitForURL("**/cliente**", { timeout: 15000 }).catch(() => {});
  await page.goto(BASE + "/cliente", { waitUntil: "networkidle" });
  await check(page, "Pulsante Esplora (dashboard)", async () => {
    const h = await page.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((x) => x.textContent.includes("Esplora i negozi"));
      return a ? a.getBoundingClientRect().height : null;
    });
    const ok = h && Math.abs(h - 40) <= 2;
    return `altezza = ${h}px ${ok ? "✓ 40px coerente" : "✗ incoerente (atteso 40px)"}`;
  });
  await page.close();
}

// ── 4. Overflow finale su pagine chiave ────────────────────────────────────
for (const [url, vp] of [["/", 375], ["/negozi", 375], ["/categorie", 375], ["/carrello", 375], ["/", 1280]]) {
  const page = await browser.newPage({ viewport: { width: vp, height: 800 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await check(page, `Overflow ${url} @${vp}`, async () => "nessun overflow");
  await page.close();
}

const realErrors = errors.filter((e) => !/favicon|net::ERR/.test(e));
console.log(`\nErrori console: ${realErrors.length}${realErrors.length ? " → " + realErrors.slice(0, 3).join(" | ") : ""}`);
console.log(`=== RISULTATO: ${pass} pass, ${fail} fail ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
