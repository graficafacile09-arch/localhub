import { chromium } from "playwright";

const viewports = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440];
let failures = 0;
const browser = await chromium.launch();

for (const w of viewports) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

  const band = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
    const band = nav?.parentElement;
    const bg = band ? getComputedStyle(band).backgroundColor : null;
    const radius = band ? getComputedStyle(band).borderRadius : null;
    const active = nav.querySelector('a[aria-current="page"]');
    const activeIcon = active.querySelector("svg");
    const inactive = nav.querySelector('a[href="/negozi"]');
    const inactiveIcon = inactive.querySelector("svg");
    return {
      bg,
      radius,
      activeIcon: getComputedStyle(activeIcon).color,
      inactiveIcon: getComputedStyle(inactiveIcon).color,
      activeWhite: getComputedStyle(activeIcon).color.includes("rgb(255, 255, 255)") || getComputedStyle(activeIcon).color.includes("lab(100"),
      inactiveYellow: getComputedStyle(inactiveIcon).color.includes("250, 204") || getComputedStyle(inactiveIcon).color.includes("lab(87.8"),
    };
  });

  const isBlue = band.bg.includes("lab(26.1542") || band.bg.includes("rgb(30, 58, 138)");
  const links = await page.locator('nav a').count();
  const hamburger = await page.locator('header button[aria-label="Apri il menu"], header .lucide-menu').count();

  const ok = !overflow && isBlue && band.activeWhite && band.inactiveYellow && links === 4 && hamburger === 0;
  if (!ok) failures++;
  console.log(`${w}px: overflow=${overflow} fasciaBlu=${isBlue} attivoBianco=${band.activeWhite} inattivoGiallo=${band.inactiveYellow} links=${links} hamburger=${hamburger} ${ok ? "OK" : "PROBLEMA"}`);
  await page.close();
}

// click + badge blu scuro
{
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("localhub.carrello.v1", JSON.stringify({ versione: 1, righe: [{ prodottoId: "999", varianteId: null, quantita: 2, nome: "T", prezzo: 1, immagine: null, variante: null, negozioId: "888", negozioNome: "N", slug: "t" }] })));
  await page.reload({ waitUntil: "networkidle" });
  const badge = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="cart-badge"]');
    if (!el) return null;
    return { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, text: el.textContent.trim() };
  });
  console.log("Badge:", JSON.stringify(badge));
  const badgeOk = badge && badge.text === "2" && (badge.bg.includes("lab(13.8") || badge.bg.includes("rgb(23, 37, 84)") || badge.bg.includes("23, 37, 84"));
  if (!badgeOk) failures++;

  await page.locator('nav a[href="/negozi"]').click();
  await page.waitForURL("**/negozi", { timeout: 15000 });
  const active = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
    const a = nav.querySelector('a[aria-current="page"]');
    const icon = a.querySelector("svg");
    return { href: a.getAttribute("href"), color: getComputedStyle(icon).color };
  });
  console.log("Su /negozi attivo:", JSON.stringify(active));
  if (active.href !== "/negozi" || !active.color.includes("rgb(255, 255, 255)")) failures++;
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "ALL_OK" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
