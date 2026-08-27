/**
 * COLLAUDO — Modulo Pagamenti / Stripe Connect (produzione) — v2 robusta.
 * Polling sulle verifiche, log di rete, screenshot in C:/tmp/collaudo.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://www.incitta.online";
const STORE_ID = "f3a82af7-dd47-482f-8a49-ea58e692238c";
const OUT = "C:/tmp/collaudo";

const esiti: Record<string, string> = {};
function log(step: string, ok: boolean, dettaglio = "") {
  console.log(`${ok ? "✅" : "❌"} ${step}${dettaglio ? ` — ${dettaglio}` : ""}`);
}

async function shot(page: Page, nome: string) {
  try {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, `${nome}.png`) });
  } catch {
    /* ignore */
  }
}

async function attendeLoginManuale(page: Page): Promise<boolean> {
  const scadenza = Date.now() + 6 * 60 * 1000;
  while (Date.now() < scadenza) {
    const url = page.url();
    if (!/\/login/.test(url) && url.startsWith(BASE)) return true;
    await page.waitForTimeout(2000);
  }
  return false;
}

async function attende(
  fn: () => Promise<boolean> | boolean,
  ms = 30000,
  ogni = 800
): Promise<boolean> {
  const scadenza = Date.now() + ms;
  while (Date.now() < scadenza) {
    try {
      if (await fn()) return true;
    } catch {
      /* ignora */
    }
    await page0.waitForTimeout(ogni);
  }
  return false;
}
let page0: Page;

async function main() {
  const browser: Browser = await chromium.launch({
    channel: "chrome",
    headless: false,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page0 = page;
  page.setDefaultTimeout(15000);

  // Log diagnostici (nessun secret atteso in console/network).
  const consoleLogs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleLogs.push(`[console.error] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => consoleLogs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  const fallite: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) fallite.push(`${r.status()} ${r.url().slice(0, 140)}`);
  });

  try {
    // ── 1. Login manuale ────────────────────────────────────────────────
    console.log("\n▶ APRIRE LA FINESTRA: inserisci le credenziali merchant su /login");
    await page.goto(`${BASE}/login?area=merchant`, { waitUntil: "domcontentloaded" });
    const loginOk = await attendeLoginManuale(page);
    esiti["login"] = loginOk ? "SI" : "NO";
    log("Login manuale completato", loginOk);
    if (!loginOk) {
      console.log("⛔ Tempo scaduto per il login manuale.");
      await browser.close();
      process.exit(1);
    }

    // ── 2. /merchant → Panificio Rossi ──────────────────────────────────
    await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
    const card = page.locator(`a[href="/merchant/${STORE_ID}"]`).first();
    const haCard = await attende(() => card.count().then((n) => n > 0), 15000);
    esiti["panificio_card"] = haCard ? "SI" : "NO";
    log("Card Panificio Rossi su /merchant", haCard);
    await shot(page, "01-merchant-home");
    if (!haCard) {
      console.log("⛔ Nessuna card per Panificio Rossi. Account loggato non proprietario?");
      await browser.close();
      process.exit(1);
    }
    await card.click();
    await page.waitForURL(`**/merchant/${STORE_ID}`, { timeout: 20000 });
    await shot(page, "02-store-dashboard");

    // ── 3. Voce Pagamenti nella sidebar (polling) ───────────────────────
    const voce = page.locator(`a[href="/merchant/${STORE_ID}/pagamenti"]`).first();
    const haVoce = await attende(() => voce.count().then((n) => n > 0), 15000);
    esiti["pagamenti_voce"] = haVoce ? "SI" : "NO";
    log("Voce 'Pagamenti' nella navigazione venditore", haVoce);
    if (haVoce) {
      await voce.scrollIntoViewIfNeeded().catch(() => {});
      await voce.click();
    } else {
      await page.goto(`${BASE}/merchant/${STORE_ID}/pagamenti`, { waitUntil: "domcontentloaded" });
    }
    await page.waitForURL(`**/merchant/${STORE_ID}/pagamenti`, { timeout: 20000 }).catch(() => {});
    await shot(page, "03-pagamenti-page");

    // ── 4. Stato iniziale: non collegato + Collega Stripe (polling) ─────
    const btn = page.getByRole("button", { name: /Collega Stripe/i }).first();
    const pronti = await attende(async () => {
      const body = await page.locator("body").innerText();
      return (
        /Non collegato/.test(body) &&
        (await btn.count().then((n) => n > 0)) &&
        (await btn.isVisible().catch(() => false))
      );
    }, 20000);
    const bodyInit = await page.locator("body").innerText();
    esiti["non_collegato_visibile"] = pronti ? "SI" : "NO";
    esiti["collega_stripe_btn"] = pronti ? "SI" : "NO";
    log("Stato 'Stripe non collegato' + pulsante 'Collega Stripe'", pronti);
    if (!pronti) {
      console.log("   body snippet:", bodyInit.replace(/\s+/g, " ").slice(0, 400));
    }
    await shot(page, "04-stato-iniziale");

    // ── 5. OAuth Stripe Connect sandbox ─────────────────────────────────
    await btn.click();
    const suStripe = await attende(
      () => page.url().includes("connect.stripe.com"),
      45000
    );
    esiti["oauth_avviato"] = suStripe ? "SI" : "NO";
    log("Redirect su connect.stripe.com (OAuth)", suStripe, page.url().slice(0, 100));
    await shot(page, "05-stripe-oauth");
    if (!suStripe) {
      // Mostra eventuale messaggio d'errore nella UI
      const corpo = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const msg = /Collegamento Stripe[^.]*\.|non configurato|errore/i.exec(corpo);
      console.log("   UI dopo click:", msg?.[0] ?? corpo.slice(0, 250));
      console.log("   HTTP 4xx/5xx:", fallite.join(" | ") || "nessuna");
      console.log("   console error:", consoleLogs.join(" | ") || "nessuno");
    }

    if (suStripe) {
      const auto = await completaStripeTest(page);
      if (!auto) {
        console.log(
          "\n⚠️ Completa MANUALMENTE la creazione dell'account Stripe di TEST nella finestra\n" +
            "   (email incitta.rossi.test@localhub.it, password a piacere). Attendo il ritorno..."
        );
      }
      const ritornato = await attende(() => page.url().startsWith(BASE), 10 * 60 * 1000, 1500);
      esiti["oauth_completato"] = ritornato ? "SI" : "NO";
      log("OAuth completato (ritorno su incitta.online)", ritornato, page.url().slice(0, 100));
      await shot(page, "06-ritorno");
    }

    // ── 6. Ritorno callback + stato collegato ───────────────────────────
    await attende(() => page.url().includes("stripe=connected"), 20000);
    const urlRitorno = page.url();
    const callbackOk = urlRitorno.includes("/pagamenti") && urlRitorno.includes("stripe=connected");
    esiti["callback_stripe_connected"] = callbackOk ? "SI" : "NO";
    log("Ritorno callback con ?stripe=connected", callbackOk, urlRitorno.slice(0, 120));

    const collegatoOk = await attende(async () => {
      const body = await page.locator("body").innerText();
      return /Collegato/.test(body) && /acct_[A-Za-z0-9]+/.test(body);
    }, 20000);
    const body2 = await page.locator("body").innerText();
    const m = body2.match(/acct_[A-Za-z0-9]+/);
    const nome = /Account collegato:\s*([^\n]+)/.exec(body2);
    esiti["stripe_collegato"] = collegatoOk ? "SI" : "NO";
    esiti["acct_visualizzato"] = collegatoOk && m ? "SI" : "NO";
    log("Stato 'Collegato' mostrato", collegatoOk);
    log("ID account Connect visualizzato", collegatoOk && !!m, m?.[0] ?? "");
    if (nome) console.log(`   → Nome account: ${nome[1].trim()}`);
    await shot(page, "07-collegato");

    // ── 7. Reload → nessun nuovo OAuth ──────────────────────────────────
    await page.reload({ waitUntil: "domcontentloaded" });
    const ancora = await attende(async () => {
      const body = await page.locator("body").innerText();
      return /Collegato/.test(body) && /acct_[A-Za-z0-9]+/.test(body);
    }, 20000);
    const urlDopo = page.url();
    const nuovoOAuth = urlDopo.includes("connect.stripe.com");
    esiti["reload_collegato"] = ancora ? "SI" : "NO";
    esiti["reload_senza_oauth"] = !nuovoOAuth ? "SI" : "NO";
    log("Dopo reload ancora 'Collegato' (nessun nuovo OAuth)", ancora && !nuovoOAuth);
    await shot(page, "08-reload");

    // ── Report ──────────────────────────────────────────────────────────
    console.log("\n══════════ REPORT COLLAUDO ══════════");
    for (const [k, v] of Object.entries(esiti)) console.log(`  ${k}: ${v}`);
    if (fallite.length) console.log("\nHTTP 4xx/5xx:", fallite.join(" | "));
    if (consoleLogs.length) console.log("\nconsole error:", consoleLogs.join(" | "));
    console.log("══════════════════════════════════════");
  } catch (err) {
    console.error("ERRORE COLLAUDO:", err);
    await shot(page, "99-errore");
    process.exitCode = 1;
  } finally {
    await page.waitForTimeout(1200);
    await browser.close();
  }
}

/** Tentativo di automazione della creazione account di test su Stripe. */
async function completaStripeTest(page: Page): Promise<boolean> {
  const email = "incitta.rossi.test@localhub.it";
  for (let passo = 1; passo <= 14; passo++) {
    if (page.url().startsWith(BASE)) return true;
    await page.waitForTimeout(1200);

    const inputs = page.locator('input[type="email"], input[type="text"], input[type="password"]');
    const count = await inputs.count().catch(() => 0);
    let campi = 0;
    for (let i = 0; i < Math.min(count, 4); i++) {
      const el = inputs.nth(i);
      const visibile = await el.isVisible().catch(() => false);
      if (!visibile) continue;
      const tipo = (await el.getAttribute("type").catch(() => "")) ?? "";
      const ph = ((await el.getAttribute("placeholder").catch(() => "")) ?? "").toLowerCase();
      const name = ((await el.getAttribute("name").catch(() => "")) ?? "").toLowerCase();
      let val = "";
      if (tipo === "email" || ph.includes("email") || name.includes("email")) val = email;
      else if (tipo === "password") val = "StripeTest123!";
      else if (ph.includes("name") || name.includes("name") || name.includes("first") || name.includes("last"))
        val = "Panificio Rossi Test";
      if (val) {
        await el.fill(val).catch(() => {});
        campi++;
      }
    }
    if (campi > 0) log(`stripe passo ${passo}: compilati ${campi} campi`, true);

    const selettori = [
      'button:has-text("Create a new account")',
      'button:has-text("Create test account")',
      'button:has-text("Continue")',
      'button:has-text("Avanti")',
      'button:has-text("Continua")',
      'button:has-text("Agree and continue")',
      'button:has-text("Accept")',
      'button:has-text("Done")',
      'button:has-text("Skip for now")',
      'button[type="submit"]',
    ];
    let cliccato = false;
    for (const sel of selettori) {
      const loc = page.locator(sel).first();
      const c = await loc.count().catch(() => 0);
      if (c > 0 && (await loc.isVisible().catch(() => false))) {
        await loc.click({ timeout: 3000 }).catch(() => {});
        cliccato = true;
        log(`stripe passo ${passo}: click ${sel}`, true);
        break;
      }
    }
    if (!cliccato) log(`stripe passo ${passo}: nessun pulsante riconosciuto`, false);

    const cb = page.locator('input[type="checkbox"]').first();
    const cc = await cb.count().catch(() => 0);
    if (cc > 0 && (await cb.isVisible().catch(() => false))) {
      const checked = await cb.isChecked().catch(() => false);
      if (!checked) await cb.check({ timeout: 2000 }).catch(() => {});
    }
    await shot(page, `stripe-${String(passo).padStart(2, "0")}`);
  }
  return page.url().startsWith(BASE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
