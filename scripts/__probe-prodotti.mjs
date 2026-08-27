import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 320, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/login?area=admin", { waitUntil: "networkidle" });
await page.locator("#email").fill("admin.test@localhub.it");
await page.locator("#password").fill("AdminTest123!");
await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
await page.waitForURL("**/amministratore**", { timeout: 20000 });
await page.goto("http://localhost:3100/amministratore/negozi/f3a82af7-dd47-482f-8a49-ea58e692238c/prodotti", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(400);
const r = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("div")]
    .filter((el) => (el.className || "").toString().includes("flex gap-4 rounded"));
  const desc = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      cls: (el.className || "").toString().slice(0, 60),
      left: Math.round(b.left * 10) / 10,
      right: Math.round(b.right * 10) / 10,
      w: Math.round(b.width * 10) / 10,
      wrap: getComputedStyle(el).flexWrap,
      minW: getComputedStyle(el).minWidth,
      display: getComputedStyle(el).display,
    };
  };
  const card = cards[0];
  const content = card?.children[1];
  return {
    nCards: cards.length,
    card: desc(card),
    content: desc(content),
    rows: content ? [...content.children].map((r) => ({ ...desc(r), kids: r.children.length ? [...r.children].map(desc) : [] })) : [],
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
