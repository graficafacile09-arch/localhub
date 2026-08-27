import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3177/test-editor?w=600&h=800");
await page.getByRole("button", { name: "Ritaglia" }).click();
const box = page.locator("[data-editor-preview] .cursor-move");
await box.waitFor();
await page.evaluate(() => {
  window.__log = [];
  for (const ev of ["pointerdown", "pointerup"]) {
    document.addEventListener(ev, (e) => {
      const t = e.target;
      const cls = t?.className?.toString?.().slice(0, 60) || t?.tagName || "?";
      window.__log.push(`${ev}@(${e.clientX?.toFixed(1)},${e.clientY?.toFixed(1)}) target=${cls}`);
    }, true);
  }
});

// RESIZE con -8 (come nel test completo)
let bb = await box.boundingBox();
await page.mouse.move(bb.x + bb.width - 8, bb.y + bb.height - 8);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5, { steps: 12 });
await page.mouse.up();
await page.waitForFunction(() => {
  const el = document.querySelector("[data-editor-preview] .cursor-move");
  return el && el.style.width !== "100%";
});
console.log("dopo resize:", await box.getAttribute("style"));

// MOVE
bb = await box.boundingBox();
const cx = bb.x + bb.width * 0.5, cy = bb.y + bb.height * 0.5;
console.log("press move a:", cx, cy, "| box:", JSON.stringify(bb));
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + bb.width * 0.5, cy + bb.height * 0.5, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(300);
console.log("dopo move:", await box.getAttribute("style"));
console.log("--- eventi ---");
console.log((await page.evaluate(() => window.__log)).join("\n"));
await browser.close();
