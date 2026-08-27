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
  const cr = container.getBoundingClientRect();
  const probe = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const cls = el?.className?.toString?.().slice(0, 70) || el?.tagName || "null";
    return cls;
  };
  return {
    centro: probe(cr.x + cr.width / 2, cr.y + cr.height / 2),
    angoloDX: probe(cr.right - 2, cr.bottom - 2),
    angoloDX10: probe(cr.right - 10, cr.bottom - 10),
    angoloDX20: probe(cr.right - 20, cr.bottom - 20),
    bordoDX: probe(cr.right - 4, cr.y + cr.height / 2),
    bordoBasso: probe(cr.x + cr.width / 2, cr.bottom - 4),
    fuoriContainer: probe(cr.right + 20, cr.bottom + 20),
    zOverlay: getComputedStyle(document.querySelector("[data-editor-preview] .absolute.inset-0")).zIndex,
    zBox: getComputedStyle(document.querySelector("[data-editor-preview] .cursor-move")).zIndex,
    peOverlay: getComputedStyle(document.querySelector("[data-editor-preview] .absolute.inset-0")).pointerEvents,
    peCanvas: getComputedStyle(container.querySelector("canvas")).pointerEvents,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
