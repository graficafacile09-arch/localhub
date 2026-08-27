/**
 * AUDIT RESPONSIVE MOBILE — rileva overflow orizzontale su tutte le aree
 * principali, per 7 viewport. Identifica l'elemento responsabile (root).
 *
 * Uso: npx tsx scripts/__audit-mobile.ts [BASE_URL]
 */
import { chromium, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const VIEWPORTS = [320, 360, 375, 390, 393, 412, 430];
const HEIGHT = 844;

const STORE_ID = "87283398-408e-4760-bb83-8061cce578a4";

type Area = { name: string; email?: string; password?: string; pages: string[] };

const AREAS: Area[] = [
  {
    name: "public",
    pages: [
      "/",
      "/login",
      "/recupero-password",
      "/negozi",
      "/negozio/panificio-rossi",
      "/prodotto/pane-casereccio-1-5-kg",
      "/prodotto/pane-casereccio-1-5-kg/acquista",
      "/prodotto/pane-casereccio-1-5-kg/acquista/ritiro",
      "/prodotto/pane-casereccio-1-5-kg/acquista/spedizione",
      "/ricerca",
      "/categorie",
      "/carrello",
    ],
  },
  {
    name: "cliente",
    email: "customer-a.test@localhub.it",
    password: "CustomerTest123!",
    pages: [
      "/cliente",
      "/cliente/ordini",
      "/cliente/preferiti",
      "/cliente/profilo",
      "/cliente/impostazioni",
      "/cliente/segnalazioni",
      "/preferiti",
      "/profilo",
      "/ordini",
    ],
  },
  {
    name: "merchant",
    email: "commerciante-a.test@localhub.it",
    password: "MerchantTest123!",
    pages: [
      "/merchant",
      `/merchant/${STORE_ID}`,
      `/merchant/${STORE_ID}/ordini`,
      `/merchant/${STORE_ID}/prodotti`,
      `/merchant/${STORE_ID}/prodotti/ai`,
      `/merchant/${STORE_ID}/prodotti/nuovo`,
      `/merchant/${STORE_ID}/pagamenti`,
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

type Result = {
  url: string;
  viewport: number;
  docScrollW: number;
  bodyScrollW: number;
  innerW: number;
  hasOverflow: boolean;
  offenders: Array<{ tag: string; cls: string; right: number; left: number; w: number; text: string }>;
};

type OverflowInfo = { docScrollW: number; bodyScrollW: number; innerW: number; hasOverflow: boolean; offenders: Result["offenders"] };

async function checkOverflow(page: Page): Promise<OverflowInfo> {
  return page.evaluate(() => {
    const innerW = window.innerWidth;
    const docScrollW = document.documentElement.scrollWidth;
    const bodyScrollW = document.body.scrollWidth;
    const hasOverflow = docScrollW > innerW + 1 || bodyScrollW > innerW + 1;
    const offenders: Array<{ tag: string; cls: string; right: number; left: number; w: number; text: string }> = [];
    if (hasOverflow) {
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > innerW + 1 || r.left < -1) {
          let p = el.parentElement;
          let ancestorOverflows = false;
          while (p && p !== document.body && p !== document.documentElement) {
            const pr = p.getBoundingClientRect();
            if (pr.right > innerW + 1 || pr.left < -1) { ancestorOverflows = true; break; }
            p = p.parentElement;
          }
          if (!ancestorOverflows) {
            const cls = typeof el.className === "string" ? el.className : "";
            offenders.push({
              tag: el.tagName,
              cls: cls.slice(0, 90),
              right: Math.round(r.right),
              left: Math.round(r.left),
              w: Math.round(r.width),
              text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 45),
            });
          }
        }
      });
    }
    return { innerW, docScrollW, bodyScrollW, hasOverflow, offenders: offenders.slice(0, 10) };
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const allResults: Record<string, Result[]> = {};
  let totalOverflow = 0;

  for (const area of AREAS) {
    const context = await browser.newContext({ viewport: { width: 390, height: HEIGHT } });
    const page = await context.newPage();
    page.on("pageerror", () => {}); // ignora errori runtime JS (non rilevanti per overflow)
    console.log(`\n══════════ AREA: ${area.name} ══════════`);

    if (area.email && area.password) {
      try {
        await login(page, area.email, area.password);
      } catch (e) {
        console.log(`  ⚠️ login fallito: ${(e as Error).message}`);
      }
    }

    for (const url of area.pages) {
      const results: Result[] = [];
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp, height: HEIGHT });
        try {
          await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
          await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(350);
        } catch (e) {
          console.log(`  ⚠️ ${url} @${vp}: errore navigazione ${(e as Error).message.slice(0, 60)}`);
          results.push({ url, viewport: vp, docScrollW: 0, bodyScrollW: 0, innerW: vp, hasOverflow: false, offenders: [] });
          continue;
        }
        const r = await checkOverflow(page);
        if (r.hasOverflow) totalOverflow++;
        if (r.hasOverflow) {
          console.log(`\n  ❌ ${url} @${vp}px → doc=${r.docScrollW} body=${r.bodyScrollW} inner=${r.innerW}`);
          for (const o of r.offenders) {
            console.log(`      <${o.tag}> .${o.cls}  right=${o.right} left=${o.left} w=${o.w}  "${o.text}"`);
          }
        }
        results.push({ url, viewport: vp, docScrollW: r.docScrollW, bodyScrollW: r.bodyScrollW, innerW: r.innerW, hasOverflow: r.hasOverflow, offenders: r.offenders });
      }
      allResults[`${area.name}:${url}`] = results;
      const bad = results.filter((x) => x.hasOverflow).map((x) => x.viewport);
      console.log(`${bad.length === 0 ? "  ✅" : "  ⚠️ overflow@" + bad.join(",")} ${url}`);
    }
    await context.close();
  }

  console.log(`\n\n══════════════════════════════════════════`);
  console.log(`TOTALE overflow rilevati (pagina×viewport): ${totalOverflow}`);
  await browser.close();
}

main().catch((e) => { console.error("Errore:", e); process.exit(1); });
