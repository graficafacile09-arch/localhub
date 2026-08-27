import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3177/test-editor?w=800&h=600");
await page.getByRole("button", { name: "Ritaglia" }).click();
const box = page.locator("[data-editor-preview] .cursor-move");
await box.waitFor();
await page.evaluate(() => {
  window.__log = [];
  for (const ev of ["pointerdown", "pointerup"]) {
    document.addEventListener(ev, (e) => {
      const t = e.target;
      const cls = t?.className?.toString?.().slice(0, 55) || t?.tagName || "?";
      window.__log.push(`${ev}@(${e.clientX?.toFixed(1)},${e.clientY?.toFixed(1)}) target=${cls}`);
    }, true);
  }
});
await page.locator("[data-editor-preview]").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
const bb = await box.boundingBox();
console.log("box:", JSON.stringify(bb));
const grabX = bb.x + bb.width - 3, grabY = bb.y + bb.height - 3;
await page.mouse.move(grabX, grabY);
await page.mouse.down();
await page.mouse.move(grabX + bb.width * 0.5, grabY + bb.height * 0.5, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
console.log("style:", await box.getAttribute("style"));
console.log((await page.evaluate(() => window.__log)).join("\n"));
await browser.close();
