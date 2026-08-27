/**
 * Probe mirata: misura la min-content della barra filtri (grid gap-3) delle
 * pagine ordini/incassi/payout per determinare il meccanismo di overflow.
 * Uso: node scripts/__probe-overflow.mjs [route ...]
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const ADMIN = { email: "admin.test@localhub.it", password: "AdminTest123!" };
const MERCHANT = { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!" };
const STORE = process.env.MERCHANT_STORE_ID || "82713069-38ca-43c8-bfd6-dd39c2f94a40";

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/amministratore/ordini",
      "/amministratore/incassi",
      "/amministratore/payout",
      `/merchant/${STORE}/guadagni`,
    ];

async function login(page, u, area) {
  await page.goto(`${BASE}/login?area=${area}`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  const dest = area === "admin" ? "/amministratore" : "/merchant";
  await page.waitForURL(`**${dest}**`, { timeout: 20000 });
}

const browser = await chromium.launch();

// Admin
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, ADMIN, "admin");
  for (const route of ROUTES.filter((r) => r.startsWith("/amministratore"))) {
    for (const vw of [768, 1024, 1280]) {
      await page.setViewportSize({ width: vw, height: 900 });
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const grid = document.querySelector('div.grid.gap-3');
        if (!grid) return null;
        const cs = getComputedStyle(grid);
        const cols = cs.gridTemplateColumns;
        const gridRect = grid.getBoundingClientRect();
        const items = [...grid.children].map((el) => {
          const r = el.getBoundingClientRect();
          const c = getComputedStyle(el);
          // min-content via a cloned node forced to width:0
          return {
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 60),
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            width: Math.round(r.width * 10) / 10,
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            overflowX: c.overflowX,
            whiteSpace: c.whiteSpace,
          };
        });
        return {
          vw: document.documentElement.clientWidth,
          docScroll: document.documentElement.scrollWidth,
          gridRect: { left: Math.round(gridRect.left), right: Math.round(gridRect.right), width: Math.round(gridRect.width) },
          gridScrollW: grid.scrollWidth,
          gridClientW: grid.clientWidth,
          cols,
          overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          items,
        };
      });
      if (!info) { console.log(`${route} @${vw}: nessun div.grid.gap-3`); continue; }
      console.log(`\n==== ${route} @${vw} | doc overflow ${info.overflowPx}px | grid cols=${info.cols} gridW=${info.gridRect.width} (right ${info.gridRect.right}) scrollW=${info.gridScrollW}`);
      for (const it of info.items) {
        console.log(`   [${it.tag}] ${it.cls} w=${it.width} left=${it.left} right=${it.right} scrollW=${it.scrollW} clientW=${it.clientW} ws=${it.whiteSpace}`);
      }
    }
  }
  await ctx.close();
}

// Merchant
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, MERCHANT, "merchant");
  for (const route of ROUTES.filter((r) => r.startsWith("/merchant"))) {
    for (const vw of [320, 360, 768]) {
      await page.setViewportSize({ width: vw, height: 900 });
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const grid = document.querySelector('div.grid.gap-3');
        if (!grid) return null;
        const cs = getComputedStyle(grid);
        const gridRect = grid.getBoundingClientRect();
        const items = [...grid.children].map((el) => {
          const r = el.getBoundingClientRect();
          const c = getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 60),
            left: Math.round(r.left * 10) / 10,
            right: Math.round(r.right * 10) / 10,
            width: Math.round(r.width * 10) / 10,
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            ws: c.whiteSpace,
          };
        });
        return {
          vw: document.documentElement.clientWidth,
          docScroll: document.documentElement.scrollWidth,
          gridRect: { left: Math.round(gridRect.left), right: Math.round(gridRect.right), width: Math.round(gridRect.width) },
          cols: cs.gridTemplateColumns,
          overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          items,
        };
      });
      if (!info) { console.log(`${route} @${vw}: nessun div.grid.gap-3`); continue; }
      console.log(`\n==== ${route} @${vw} | doc overflow ${info.overflowPx}px | grid cols=${info.cols} gridW=${info.gridRect.width} (right ${info.gridRect.right})`);
      for (const it of info.items) {
        console.log(`   [${it.tag}] ${it.cls} w=${it.width} left=${it.left} right=${it.right} scrollW=${it.scrollW} clientW=${it.clientW} ws=${it.whiteSpace}`);
      }
    }
  }
  await ctx.close();
}

await browser.close();
console.log("\nProbe completata.");
