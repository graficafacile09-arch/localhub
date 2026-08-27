/** Temporaneo: verifica overflow a 1280px e 390px dopo il click su "Annulla ordine". */
import { chromium } from "@playwright/test";

const ORDINE = "c80cff06-6bc4-4811-b1c1-539e89a66b89";

async function main() {
  for (const larghezza of [1280, 390]) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: larghezza, height: 900 } });
    await page.goto("http://localhost:3000/login?area=admin", { waitUntil: "networkidle" });
    await page.fill("#email", "admin.test@localhub.it");
    await page.fill("#password", "AdminTest123!");
    await page.evaluate(() => {
      const el = document.querySelector('input[name="area"]') as HTMLInputElement | null;
      if (el) el.value = "admin";
    });
    await page.click('button[type="submit"]');
    await page.waitForURL(/amministratore/, { timeout: 15000 });

    await page.goto(`http://localhost:3000/amministratore/ordini/${ORDINE}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const btn = page.getByRole("button", { name: "Annulla ordine" });
    if ((await btn.count()) === 0) {
      console.log(`\n── ${larghezza}px: nessun pulsante 'Annulla ordine'`);
      await browser.close();
      continue;
    }
    await btn.first().click();
    await page.waitForTimeout(600);

    const dati = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - vw;
      // elementi che escono dal bordo destro
      const fuori = Array.from(document.querySelectorAll("body *"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { el, r };
        })
        .filter(({ r }) => r.width > 0 && r.right > vw + 1)
        .map(({ el, r }) => ({
          tag: el.tagName,
          cls: String((el as HTMLElement).className).slice(0, 70),
          right: Math.round(r.right),
          w: Math.round(r.width),
          testo: (el.textContent ?? "").slice(0, 40).replace(/\s+/g, " ").trim(),
        }))
        .slice(0, 8);
      return { vw, overflow, fuori };
    });
    console.log(`\n── ${larghezza}px ──`, JSON.stringify(dati, null, 1));
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
