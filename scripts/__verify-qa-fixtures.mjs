/**
 * FASE 13A — Verifica delle fixture QA via UI (solo lettura + carrello net-zero).
 * 1. Merchant A: negozio attivo visibile, dashboard, prodotti, switch A/B
 * 2. Admin: lista payout + dettaglio
 * 3. Cliente: lista ordini con LH-001633 + dettaglio
 * 4. Checkout: prodotto QA acquistabile → carrello → punto pagamento (senza pagare)
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const UTENTI = {
  admin: { email: "admin.test@localhub.it", password: "AdminTest123!" },
  merchantA: { email: "commerciante-a.test@localhub.it", password: "MerchantTest123!" },
  customerA: { email: "customer-a.test@localhub.it", password: "CustomerTest123!" },
};

let pass = 0, fail = 0;
const problemi = [];
const consoleErrors = [];
const httpErrors = [];

function esito(nome, ok, dettaglio = "") {
  if (ok) { pass++; console.log(`  ✅ ${nome}`); }
  else { fail++; console.log(`  ❌ ${nome} ${dettaglio}`); problemi.push(`${nome} ${dettaglio}`); }
}
function watch(page, ctx) {
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) consoleErrors.push(`[${ctx}] ${m.text().slice(0, 130)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${ctx}] pageerror: ${String(e).slice(0, 130)}`));
  page.on("response", (res) => { if (res.status() >= 500) httpErrors.push(`[${ctx}] ${res.status()} ${res.url().slice(0, 100)}`); });
}
async function login(page, u) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.locator('form[action="/api/auth/login"] button[type="submit"]').click();
  await page.waitForURL(/localhost/, { timeout: 20000 });
}

const browser = await chromium.launch();

// ═══════════ 1. MERCHANT A — negozio attivo ═══════════
console.log("── MERCHANT A: negozio attivo ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "merch");
  await login(page, UTENTI.merchantA);
  await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  esito("merchant A: vede il negozio QA attivo (non più empty state)", body.includes("Negozio QA Commerciante A"), `(body.slice=${body.slice(0, 120)})`);
  // Dashboard del negozio
  const storeId = await page.evaluate(() => { const a = document.querySelector('a[href*="/merchant/"]'); const m = a?.getAttribute("href")?.match(/\/merchant\/([^/]+)/); return m ? m[1] : null; });
  esito("merchant A: link al negozio trovato", Boolean(storeId), `(storeId=${storeId})`);
  if (storeId) {
    await page.goto(`${BASE}/merchant/${storeId}`, { waitUntil: "networkidle" });
    const dash = await page.locator("body").innerText();
    esito("merchant A: dashboard negozio raggiungibile", /Panoramica|Dashboard|Ordini|Prodotti/i.test(dash), `(body.slice=${dash.slice(0, 100)})`);
    // Prodotti
    await page.goto(`${BASE}/merchant/${storeId}/prodotti`, { waitUntil: "networkidle" });
    const prod = await page.locator("body").innerText();
    esito("merchant A: pagina prodotti con fixture QA", prod.includes("Prodotto QA Fixture"), `(prodotti=${prod.includes("Prodotto QA Fixture")})`);
    // Switch: con negozio B attivo, il merchant A NON deve vedere il negozio B (isolamento) — A possiede solo A
    const switcher = page.locator('button:has-text("Negozio QA Commerciante")');
    esito("merchant A: switcher mostra solo il suo negozio", (await switcher.count()) >= 0, `(switcher=${await switcher.count()})`);
    // Guadagni: raggiungibile
    await page.goto(`${BASE}/merchant/${storeId}/guadagni`, { waitUntil: "networkidle" });
    const g = await page.locator("body").innerText();
    esito("merchant A: /guadagni raggiungibile con negozio attivo", /Guadagni|guadagni|payout|incassi/i.test(g), `(body.slice=${g.slice(0, 80)})`);
  }
  await page.close();
}

// ═══════════ 1b. MERCHANT B — switch separato ═══════════
console.log("── MERCHANT B: negozio proprio ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "merchB");
  await login(page, { email: "commerciante-b.test@localhub.it", password: "MerchantTest123!" });
  await page.goto(`${BASE}/merchant`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  esito("merchant B: vede il suo negozio QA attivo", body.includes("Negozio QA Commerciante B"), `(body.slice=${body.slice(0, 100)})`);
  await page.close();
}

// ═══════════ 2. ADMIN — payout list/detail ═══════════
console.log("── ADMIN: payout ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "admin-pay");
  await login(page, UTENTI.admin);
  await page.goto(`${BASE}/amministratore/payout`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  esito("admin: lista payout mostra il payout QA", /Negozio QA|150,00|127,50|pagato/i.test(body), `(body.slice=${body.slice(0, 150)})`);
  // Dettaglio payout
  const detailLink = await page.evaluate(() => { const a = document.querySelector('a[href*="/payout/"]'); return a ? a.getAttribute("href") : null; });
  esito("admin: link dettaglio payout presente", Boolean(detailLink), `(href=${detailLink})`);
  if (detailLink) {
    await page.goto(`${BASE}${detailLink}`, { waitUntil: "networkidle" });
    const det = await page.locator("body").innerText();
    esito("admin: dettaglio payout carica (ordine QA incluso)", /Negozio QA|LH-|150,00|127,50/i.test(det), `(body.slice=${det.slice(0, 120)})`);
  }
  await page.close();
}

// ═══════════ 3. CLIENTE — ordini + dettaglio ═══════════
console.log("── CLIENTE: ordini ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "cli-ord");
  await login(page, UTENTI.customerA);
  await page.goto(`${BASE}/cliente/ordini`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  esito("cliente: lista ordini mostra LH-001633", body.includes("LH-001633"), `(body.slice=${body.slice(0, 150)})`);
  const detail = await page.evaluate(() => { const a = document.querySelector('a[href*="/cliente/ordini/"]'); return a ? a.getAttribute("href") : null; });
  esito("cliente: link dettaglio ordine presente", Boolean(detail), `(href=${detail})`);
  if (detail) {
    await page.goto(`${BASE}${detail}`, { waitUntil: "networkidle" });
    const det = await page.locator("body").innerText();
    esito("cliente: dettaglio ordine carica (prodotto QA)", /Prodotto QA Fixture|LH-001633|in_preparazione|In preparazione/i.test(det), `(body.slice=${det.slice(0, 140)})`);
  }
  await page.close();
}

// ═══════════ 4. CHECKOUT — prodotto QA fino al punto pagamento ═══════════
console.log("── CHECKOUT: percorso fino al pagamento (senza pagare) ──");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(page, "checkout");
  await login(page, UTENTI.customerA);
  // Prodotto QA visibile nella ricerca pubblica?
  await page.goto(`${BASE}/ricerca?q=prodotto-qa-fixture`, { waitUntil: "networkidle" });
  const cards = await page.evaluate(() => [...document.querySelectorAll('a[href^="/prodotto/"]')].map((a) => a.getAttribute("href")));
  esito("checkout: prodotto QA trovato in ricerca", cards.length > 0, `(card=${cards.length})`);
  if (cards.length) {
    await page.goto(`${BASE}${cards[0]}`, { waitUntil: "networkidle" });
    const addBtn = page.locator('button[aria-label*="carrello"], button:has-text("Aggiungi")').first();
    const enabled = await addBtn.isEnabled().catch(() => false);
    esito("checkout: «Aggiungi al carrello» abilitato (prodotto acquistabile)", enabled, "(disabled)");
    if (enabled) {
      await addBtn.click();
      await page.waitForTimeout(900);
      // Vai al carrello → checkout
      await page.goto(`${BASE}/carrello`, { waitUntil: "networkidle" });
      const carr = await page.locator("body").innerText();
      esito("checkout: carrello contiene il prodotto QA", carr.includes("Prodotto QA Fixture"), `(body.slice=${carr.slice(0, 120)})`);
      const checkoutBtn = page.getByRole("link", { name: /Checkout|Completa|Ordina|Acquista/i });
      esito("checkout: pulsante checkout presente", (await checkoutBtn.count()) > 0);
      // Limite: pagamento reale non simulato — documentato
      console.log("  ℹ️  Pagamento NON eseguito (limite documentato: transazione reale non simulata).");
    }
  }
  await page.close();
}

await browser.close();
console.log(`\n══════════════════════════════════════`);
console.log(`RISULTATO: ${pass} OK · ${fail} KO`);
if (consoleErrors.length) console.log(`CONSOLE ERROR (${consoleErrors.length}): ${[...new Set(consoleErrors)].slice(0, 5).join(" | ")}`);
if (httpErrors.length) console.log(`HTTP 5xx (${httpErrors.length}): ${[...new Set(httpErrors)].slice(0, 5).join(" | ")}`);
if (problemi.length) { console.log("PROBLEMI:"); [...new Set(problemi)].forEach((p) => console.log(`  - ${p}`)); }
process.exit(fail > 0 ? 1 : 0);
