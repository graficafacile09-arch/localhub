import { chromium } from "playwright";

const STORES = [
  "demo-panificio-1",
  "demo-beauty-1",
  "demo-casa-1",
  "demo-auto-1",
  "demo-salute-1",
  "demo-tech-1",
  "demo-bimbi-1",
  "demo-sport-1",
  "demo-pet-1",
];

const BASE = "http://localhost:3000/negozio";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  for (const store of STORES) {
    const page = await context.newPage();
    const url = `${BASE}/${store}`;
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const path = `screenshots/${store}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`Saved: ${path}`);
    await page.close();
  }

  await browser.close();
  console.log("All screenshots taken!");
}

main().catch(console.error);
