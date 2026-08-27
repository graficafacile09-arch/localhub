import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3177/test-editor?w=800&h=600");
await page.getByRole("button", { name: "Ritaglia" }).click();
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const wrapper = document.querySelector("[data-editor-preview]");
  if (!wrapper) return "NO [data-editor-preview] FOUND";
  const span = document.querySelector("[data-editor-preview] span");
  const spanClosest = span ? span.closest("[data-editor-preview]")?.className : "no-span";
  return {
    wrapperClass: wrapper.className,
    wrapperTag: wrapper.tagName,
    spanClosestClass: spanClosest,
    hasPointerMove: wrapper.onpointermove !== null,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
