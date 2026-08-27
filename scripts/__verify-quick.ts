import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://localhub-8h6c2xy1i-localhub-castrovillari.vercel.app";
const STORE_ID = "87283398-408e-4760-bb83-8061cce578a4";
const VIEWPORTS = [320, 360, 390, 430];
const HEIGHT = 844;

type Area = { name: string; email: string; password: string; pages: string[] };

const AREAS: Area[] = [
  {
    name: "merchant-rest",
    email: "commerciante-a.test@localhub.it",
    password: "MerchantTest123!",
    pages: [
      `/merchant/${STORE_ID}/impostazioni`,
      `/merchant/${STORE_ID}/incassi`,
      `/merchant/${STORE_ID}/payout`,
      `/merchant/${STORE_ID}/media`,
      `/merchant/${STORE_ID}/edit`,
    ],
  },
  {
    name: "admin",
    email: "admin.test@localhub.it",
    password: "AdminTest123!",
    pages: [
      "/amministratore",
      "/amministratore/attivita",
      "/amministratore/utenti",
      "/amministratore/ordini",
      "/amministratore/prodotti",
      "/amministratore/incassi",
      "/amministratore/payout",
      "/amministratore/categorie",
      "/amministratore/statistiche",
      "/amministratore/cestino",
      "/amministratore/registro-attivita",
      "/amministratore/scansioni",
      "/amministratore/template",
    ],
  },
];

async function login(page: any, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL((u: any) => !u.pathname.startsWith("/login"), { timeout: 45000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}

async function check(page: any, url: string, vp: number): Promise<boolean> {
  await page.setViewportSize({ width: vp, height: HEIGHT });
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
  } catch {
    return true;
  }
  const r = await page.evaluate(() => {
    const innerW = window.innerWidth;
    const docScrollW = document.documentElement.scrollWidth;
    const bodyScrollW = document.body.scrollWidth;
    return { innerW, docScrollW, bodyScrollW, hasOverflow: docScrollW > innerW || bodyScrollW > innerW };
  });
  if (r.hasOverflow) {
    console.log(`  ❌ ${url} @${vp}: doc=${r.docScrollW} body=${r.bodyScrollW} inner=${r.innerW}`);
  }
  return !r.hasOverflow;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let fails = 0;
  let total = 0;
  for (const area of AREAS) {
    const context = await browser.newContext({ viewport: { width: 390, height: HEIGHT } });
    const page = await context.newPage();
    page.on("pageerror", () => {});
    console.log(`\n═══ ${area.name} ═══`);
    try {
      await login(page, area.email, area.password);
    } catch (e) {
      console.log(`  ⚠️ login fallito: ${(e as Error).message.slice(0, 60)}`);
    }
    for (const url of area.pages) {
      let ok = true;
      for (const vp of VIEWPORTS) {
        total++;
        const pass = await check(page, url, vp);
        if (!pass) fails++;
        ok = ok && pass;
      }
      console.log(`  ${ok ? "✅" : "❌"} ${url}`);
    }
    await context.close();
  }
  await browser.close();
  console.log(`\n=== FINE: ${total} controlli, ${fails} overflow ===`);
}

main();
