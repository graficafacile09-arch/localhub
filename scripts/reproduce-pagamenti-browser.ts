/**
 * RIPRODUZIONE ESATTA (solo click UI, nessun URL costruito a mano):
 *   login → menu utente "Area Venditore" → card negozio → "Impostazioni
 *   negozio" → "Pagamenti"
 *
 * Estrae dal DOM l'elenco ESATTO dei provider renderizzati e scatta screenshot.
 * Verifica anche il "fingerprint" del commit (nota "Klarna e Scalapay") per
 * escludere cache/vecchi deployment.
 *
 * Uso: npx tsx scripts/reproduce-pagamenti-browser.ts <URL> [outdir]
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "https://localhub-5j8d67m4u-localhub-castrovillari.vercel.app";
const OUT = process.argv[3] ?? "screenshots";
const EMAIL = process.env.TEST_EMAIL ?? "commerciante-a.test@localhub.it";
const PASSWORD = process.env.TEST_PASSWORD ?? "MerchantTest123!";

mkdirSync(OUT, { recursive: true });

let passati = 0;
let falliti = 0;
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

async function shot(page: Page, nome: string) {
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
  console.log(`  📸 ${OUT}/${nome}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (err) => console.log("  [pageerror]", err.message));
  try {
    console.log(`\nBASE: ${BASE}\n`);

    // ── 1. LOGIN (form) ────────────────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
    await page.waitForURL(/\/$/, { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);
    check("login riuscito", !page.url().includes("/login"), page.url());

    // ── 2. Menu utente → "Area Venditore" ───────────────────────
    await shot(page, "0-home-after-login");
    // Header renderizza AccountMenu 2 volte: mobile (md:hidden) + desktop
    // (hidden md:block). A 1440px si usa quello DESKTOP → .last().
    await page.locator('button[aria-label^="Menu utente"]').last().click();
    await page.waitForTimeout(400);
    await page.locator('a[href="/merchant"][role="menuitem"]').last().click();
    await page.waitForURL(/\/merchant$/, { timeout: 30000 });
    await page.waitForTimeout(1000);
    check("arrivato su /merchant (elenco negozi)", page.url().endsWith("/merchant"), page.url());

    // ── 3. Click sulla card negozio ─────────────────────────────
    const storeLink = page.locator('a[href^="/merchant/"]').filter({ has: page.locator('text="Gestisci negozio"') }).first();
    const storeHref = await storeLink.getAttribute("href");
    check("card negozio trovata", Boolean(storeHref), storeHref);
    await storeLink.click();
    await page.waitForURL(/\/merchant\/[0-9a-f-]{8,}/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "1-dashboard");
    const storeId = page.url().split("/merchant/")[1]?.split("/")[0] ?? null;
    check("dashboard negozio aperta", Boolean(storeId), page.url());

    // ── 4. "Impostazioni negozio" (espandi pannello) ────────────
    const btnImpostazioni = page.locator("button", { hasText: "Impostazioni negozio" }).first();
    await btnImpostazioni.click();
    await page.waitForTimeout(600);
    await shot(page, "2-impostazioni-negozio-expanded");

    // ── 5. "Pagamenti" (link nel pannello) ──────────────────────
    const linkPagamenti = page.locator(`a[href="/merchant/${storeId}/pagamenti"]`).first();
    const hrefPag = await linkPagamenti.getAttribute("href");
    check("link 'Pagamenti' presente nel pannello", Boolean(hrefPag), hrefPag);
    await linkPagamenti.click();
    await page.waitForURL(/\/pagamenti$/, { timeout: 30000 }).catch(() => {});
    await page
      .waitForFunction(() => !document.body.innerText.includes("Caricamento..."), { timeout: 30000, polling: 250 })
      .catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "3-pagamenti");
    console.log(`  URL finale: ${page.url()}`);

    // ── 6. ESTRAZIONE ESATTA DAL DOM + RISPOSTA API ─────────────
    const providerNames = await page.locator("p.text-sm.font-bold.text-slate-900").allInnerTexts();
    const bodyText = await page.locator("body").innerText();

    // Dump della risposta GET /api/merchant/stores/{id}/pagamenti:
    // mostra quali provider sono CONFIGURATI lato server (non quali renderizza).
    const apiDump = await page.evaluate(async (storeId) => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/pagamenti`);
        const json = await res.json();
        return {
          ok: res.ok,
          success: json?.success ?? false,
          providerConfigurati: (json?.data?.pagamenti ?? []).map((p: any) => p.provider),
          metodi: (json?.data?.metodi ?? []).map((m: any) => m.metodo),
        };
      } catch (e) {
        return { errore: String(e) };
      }
    }, storeId);
    console.log("\n[RISPOSTA API GET /pagamenti]");
    console.log("  " + JSON.stringify(apiDump));

    console.log("\n[PROVIDER RENDERIZZATI (estrazione DOM)]");
    console.log("  " + (providerNames.length ? providerNames.join(" | ") : "(nessuno)"));

    const attesi = ["Stripe", "PayPal", "Klarna", "Scalapay", "Bonifico"];
    console.log("\n[VERIFICA]");
    check("Carta (Stripe) presente", /Carta\s*\(Stripe\)|Stripe/i.test(bodyText));
    check("PayPal presente", /PayPal/i.test(bodyText));
    check("Klarna presente", /Klarna/i.test(bodyText));
    check("Scalapay presente", /Scalapay/i.test(bodyText));
    check("Bonifico presente", /Bonifico/i.test(bodyText));
    const prossimamente = await page.locator('text="Prossimamente"').count();
    check("nessun badge 'Prossimamente'", prossimamente === 0, `count=${prossimamente}`);
    // Fingerprint del commit (presente solo nella versione con Scalapay):
    check("fingerprint commit: nota 'Klarna e Scalapay'", bodyText.includes("Klarna e Scalapay"));

    console.log("\n[T3] Configurazione Scalapay (dopo attivazione provider):");
    const cardScalapay = page
      .locator('div.rounded-2xl.border')
      .filter({ hasText: "buy now, pay later" })
      .first();
    await cardScalapay.locator('input[type="checkbox"]').first().click({ force: true });
    await page.waitForTimeout(500);
    check("campo API Key (password) presente", (await cardScalapay.locator('input[type="password"]').count()) >= 1);
    check("selettore Sandbox/Live presente", (await cardScalapay.locator("select").filter({ hasText: "Sandbox" }).count()) >= 1);
    const testoCardScalapay = await cardScalapay.innerText();
    check("Webhook URL Scalapay mostrato", testoCardScalapay.includes("webhook/pagamenti/scalapay"));
    check("nota 'API Key del TUO account' presente", testoCardScalapay.includes("TUO account Scalapay"));
    await shot(page, "4-scalapay-config");

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`RIPRODUZIONE PAGAMENTI: ${passati} passati, ${falliti} falliti`);
    console.log(`URL: ${page.url()}`);
    if (falliti > 0) {
      console.log("TESTO PAGINA:\n" + bodyText.slice(0, 3000));
      process.exitCode = 1;
    } else {
      console.log("TUTTI I CHECK PASSATI ✓");
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("Errore:", e);
  process.exit(1);
});
