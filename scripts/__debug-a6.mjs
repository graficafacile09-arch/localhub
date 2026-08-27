import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3177/test-editor?w=800&h=600");
await page.getByRole("button", { name: "Ritaglia" }).click();
await page.waitForTimeout(500);
const html = await page.evaluate(() => {
  const w = document.querySelector("[data-editor-preview]");
  return w ? w.parentElement.innerHTML.slice(0, 1800) : "NO WRAPPER";
});
console.log(html);
await browser.close();
