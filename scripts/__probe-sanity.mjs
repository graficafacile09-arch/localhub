import { chromium } from "@playwright/test";
const B = "http://localhost:3100";
const b = await chromium.launch();

// 1) Header pubblico @320
{
  const ctx = await b.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(`${B}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const row = document.querySelector("header div.flex.w-full");
    const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    if (row) {
      out.children = [...row.children].map((el) => {
        const b = el.getBoundingClientRect();
        return { cls: (el.className || "").toString().slice(0, 40), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) };
      });
    }
    return out;
  });
  console.log("HEADER@320:", JSON.stringify(r));
  await ctx.close();
}

// 2) Admin ordini filtro @1280 (griglia)
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${B}/login?area=admin`, { waitUntil: "networkidle" });
  await page.locator("#email").fill("admin.test@localhub.it");
  await page.locator("#password").fill("AdminTest123!");
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL("**/amministratore**", { timeout: 20000 });
  await page.goto(`${B}/amministratore/ordini`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const grid = document.querySelector("div.grid.gap-3");
    const gr = grid.getBoundingClientRect();
    const pair = grid ? [...grid.children].find((c) => (c.className || "").toString().includes("grid-cols-[minmax")) : null;
    const pr = pair ? pair.getBoundingClientRect() : null;
    const inputs = pair ? [...pair.querySelectorAll("input")].map((i) => { const b = i.getBoundingClientRect(); return Math.round(b.width); }) : [];
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridRight: gr ? Math.round(gr.right) : null,
      pairRight: pr ? Math.round(pr.right) : null,
      dateInputWidths: inputs,
    };
  });
  console.log("ORDINI@1280:", JSON.stringify(r));
  await ctx.close();
}

// 3) Merchant guadagni @320 (coppia date)
{
  const ctx = await b.newContext({ viewport: { width: 320, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${B}/login?area=merchant`, { waitUntil: "networkidle" });
  await page.locator("#email").fill("commerciante-a.test@localhub.it");
  await page.locator("#password").fill("MerchantTest123!");
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL("**/merchant**", { timeout: 20000 });
  await page.goto(`${B}/merchant/82713069-38ca-43c8-bfd6-dd39c2f94a40/guadagni`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const pair = [...document.querySelectorAll("div")].find((c) => (c.className || "").toString().includes("grid-cols-[minmax"));
    const inputs = pair ? [...pair.querySelectorAll("input")].map((i) => { const b = i.getBoundingClientRect(); return Math.round(b.width); }) : [];
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      nPairs: document.querySelectorAll("div.grid-cols-\\[minmax").length,
      dateInputWidths: inputs,
    };
  });
  console.log("GUADAGNI@320:", JSON.stringify(r));
  await ctx.close();
}

await b.close();
