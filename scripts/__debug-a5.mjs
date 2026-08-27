import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3177/test-editor?w=800&h=600");
await page.getByRole("button", { name: "Ritaglia" }).click();
await page.locator("[data-editor-preview]").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
const info = await page.evaluate(() => {
  const wrapper = document.querySelector("[data-editor-preview]");
  const wr = wrapper.getBoundingClientRect();
  const layer = wrapper.querySelector(".pointer-events-none");
  const spans = [...wrapper.querySelectorAll("span")].map((s) => {
    const r = s.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, pe: getComputedStyle(s).pointerEvents };
  });
  const probe = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el?.className?.toString?.().slice(0, 70) || el?.tagName || "null";
  };
  return {
    wrapper: { x: wr.x, y: wr.y, w: wr.width, h: wr.height },
    layerRect: layer ? JSON.stringify(layer.getBoundingClientRect()) : null,
    spans,
    corner: probe(wr.right - 3, wr.bottom - 3),
    cornerCenter: probe(wr.right, wr.bottom),
    corner10: probe(wr.right - 10, wr.bottom - 10),
    center: probe(wr.x + wr.width / 2, wr.y + wr.height / 2),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
