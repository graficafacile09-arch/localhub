/**
 * Screenshot finali (post-fix badge) per homepage e /prodotti-tipici.
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "scripts/__verifica-visuale-shots";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const fs = await import("fs");
  fs.mkdirSync(OUT, { recursive: true });

  const vps = [
    { w: 375, h: 812, label: "mobile-375" },
    { w: 390, h: 844, label: "mobile-390" },
    { w: 1440, h: 900, label: "desktop-1440" },
  ];

  for (const vp of vps) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await context.newPage();

    // Homepage: screenshot della sezione ECCELLENZE CALABRESI
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(400);
    try {
      await page.getByText("ECCELLENZE CALABRESI").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    } catch {}
    await page.screenshot({ path: `${OUT}/${vp.label}-home-sezione-final.png` });

    // Pagina /prodotti-tipici: screenshot della griglia
    await page.goto(`${BASE}/prodotti-tipici`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${vp.label}-prodotti-tipici-final.png` });

    await context.close();
  }

  await browser.close();
  console.log(`Screenshot finali in ${OUT}/`);
}

main().catch((e) => { console.error("Errore:", e); process.exit(1); });
