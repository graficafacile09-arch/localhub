import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3177/test-editor?w=800&h=600");
await page.getByRole("button", { name: "Ritaglia" }).click();
const box = page.locator("[data-editor-preview] .cursor-move");
await box.waitFor();
await page.locator("[data-editor-preview]").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);

const info = await page.evaluate(() => {
  const container = document.querySelector("[data-editor-preview]");
  const boxEl = document.querySelector("[data-editor-preview] .cursor-move");
  const overlay = document.querySelector("[data-editor-preview] .absolute.inset-0");
  const cr = container.getBoundingClientRect();
  const br = boxEl.getBoundingClientRect();
  const or = overlay?.getBoundingClientRect();
  const el = document.elementFromPoint(cr.right - 4, cr.bottom - 4);
  return {
    container: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
    box: { x: br.x, y: br.y, w: br.width, h: br.height },
    overlay: or ? { x: or.x, y: or.y, w: or.width, h: or.height } : null,
    elementAtCorner: el ? el.className?.toString?.().slice(0, 60) || el.tagName : "null",
    containerOverflow: getComputedStyle(container).overflow,
    containerPos: getComputedStyle(container).position,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "screenshots/debug-a2.png" });
await browser.close();
