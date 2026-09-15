/**
 * P6 — TEST REALE PAYMENT-FIRST su Production (www.incitta.online).
 *
 * FASE 9: Panificio Rossi — prodotto "Orologio Citizen Eco-Drive" (id 23, €700).
 *
 * A/B/C — ABBANDONO: avvia Buy Now Carta → sessione intento con ordine_id NULL,
 *         nessun ordine, riserva stock attiva → annulla l'intento (RPC P1) →
 *         riserva rilasciata, MAI un ordine.
 * D     — COMPLETAMENTO: nuovo checkout → pagamento reale su Stripe TEST con
 *         carta 4242 → webhook → checkout_intento_conferma → ordine unico +
 *         righe + stock convertito + sessione paid + notifiche.
 *
 * Read-only tranne: creazione intente/ordine tramite il checkout reale e
 * rilascio dell'intento abbandonato tramite la RPC prevista (P1).
 */

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { join } from "node:path";

const SUPABASE_JS = join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "supabase", "dist", "supabase.js");
const BASE = "https://www.incitta.online";
const SLUG = "orologio-citizen-eco-drive-con-quadrante-cronografo";
const PRODOTTO_ID = 23;
const NEGOZIO_ID = "f3a82af7-dd47-482f-8a49-ea58e692238c"; // Panificio Rossi

let PASS = 0, FAIL = 0;
function check(ok, msg, extra) {
  if (ok) { PASS++; console.log("  ✅ " + msg); }
  else { FAIL++; console.log("  ❌ " + msg + (extra !== undefined ? " — " + JSON.stringify(extra) : "")); }
}

function dbJson(sql) {
  const r = spawnSync(process.execPath, [SUPABASE_JS, "db", "query", "--linked", "--output-format", "json", sql], {
    encoding: "utf8", timeout: 180_000, windowsHide: true,
  });
  if (r.status !== 0) throw new Error("db query fallito: " + ((r.stdout || "") + (r.stderr || "")).slice(0, 800));
  const out = r.stdout || "";
  const s = out.indexOf("[");
  return JSON.parse(out.slice(s));
}
const dbScalar = (sql) => { const r = dbJson(sql); return r.length ? r[0] : null; };

async function statoProdotto() {
  return dbScalar(`select quantita_disponibile, quantita_riservata from prodotti where id=${PRODOTTO_ID};`);
}
async function contaOrdini(checkoutKeyLike) {
  // ordini con idempotency_key o payment_id riconducibili al test
  return dbScalar(`select count(*) as n from ordini where idempotency_key ilike '${checkoutKeyLike}%' or payment_id ilike '%${checkoutKeyLike}%';`);
}

// ────────────────────────────────────────────────────────────────────────────
// Helper checkout: apre la pagina spedizione, compila e invia con metodo carta.
// Ritorna la risposta POST /api/cliente/ordini (checkoutId + redirectUrl).
// ────────────────────────────────────────────────────────────────────────────
async function avviaCheckoutCarta(ctx, { email, nomeCliente = "Test", cognome = "P6" } = {}) {
  const page = await ctx.newPage();
  let statusPost = null;
  page.on("response", (res) => {
    const url = res.url();
    if (url.replace(/\/$/, "").endsWith("/api/cliente/ordini") && res.request().method() === "POST" && statusPost === null) {
      statusPost = res.status();
    }
  });
  // Nessun redirect a Stripe durante l'abbandono: blocchiamo i domini provider.
  await page.route(/checkout\.stripe\.com|pay\.stripe\.com|js\.stripe\.com/, (r) => r.abort());

  await page.goto(`${BASE}/prodotto/${SLUG}/acquista/spedizione`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('input[name="spedizione"]', { timeout: 30000 });

  // Dati cliente
  await page.fill("#nome", nomeCliente);
  await page.fill("#cognome", cognome);
  await page.fill("#telefono", "3331234567");
  await page.fill("#email", email);
  await page.fill("#indirizzo", "Via Roma 1");
  // CAP → autocompletamento città/provincia
  await page.fill('input[name="cap"]', "87012");
  await page.waitForTimeout(1200);
  let capVal = await page.inputValue('input[name="cap"]');
  if (capVal !== "87012") { check(false, "CAP autocompletato", capVal); }
  // Provincia (sigla) nascosta impostata dall'autocomplete
  let prov = await page.evaluate(() => document.querySelector('input[name="provincia"]')?.value ?? "");
  if (!prov) {
    // fallback: compila direttamente
    await page.fill('input[name="provincia"]', "CS");
    await page.waitForTimeout(400);
  }

  // Prima opzione di spedizione disponibile
  const opzioni = page.locator('input[name="spedizione"]:not([disabled])');
  const nOpzioni = await opzioni.count();
  check(nOpzioni > 0, `opzioni spedizione disponibili (${nOpzioni})`);
  await opzioni.first().check({ timeout: 10000 });

  // Metodo carta selezionabile?
  const cartaRadio = page.locator('input[name="pagamento"][value="carta"]');
  const cartaDisabled = await cartaRadio.isDisabled().catch(() => true);
  check(!cartaDisabled, "carta selezionabile al checkout");
  if (cartaDisabled) { await page.close(); return null; }
  await cartaRadio.check();

  // Submit
  await page.click('button:has-text("Procedi al pagamento")');
  await page.waitForTimeout(6000);
  await page.close();
  // Recupera l'intento dal DB (checkout_payload.cliente.email = email del test).
  const sessione = dbScalar(`select id, redirect_url, status, amount, checkout_key from pagamenti_sessioni where checkout_payload -> 'cliente' ->> 'email' = '${email}' order by created_at desc limit 1;`);
  return { statusPost, sessione };
}

// ────────────────────────────────────────────────────────────────────────────
console.log("═══ FASE 9 — TEST REALE PAYMENT-FIRST (Production) ═══");
console.log("Prodotto: Orologio Citizen Eco-Drive (id 23, €700) — Panificio Rossi\n");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" });
await ctx.addCookies([{ name: "lh_guest", value: "1", domain: ".incitta.online", path: "/", httpOnly: true, secure: true }]);
const ts = Date.now();

// ── Baseline ───────────────────────────────────────────────────────────────
const baseStock = await statoProdotto();
const baseOrdini = dbScalar("select count(*) as n from ordini;").n;
const baseSessioni = dbScalar("select count(*) as n from pagamenti_sessioni;").n;
console.log(`Baseline: stock disp=${baseStock.quantita_disponibile} ris=${baseStock.quantita_riservata} · ordini=${baseOrdini} · sessioni=${baseSessioni}`);

// ═══ PARTE A/B — AVVIO CHECKOUT CARTA (NESSUN PAGAMENTO) ═════════════════
console.log("\n[A] Avvio Buy Now Carta (senza pagare)…");
const emailA = `qa-p6-abandon-${ts}@example.com`;
const r1 = await avviaCheckoutCarta(ctx, { email: emailA });
if (!r1 || !r1.sessione) { console.log("  ❌ checkout non partito (nessun intento nel DB)"); process.exit(1); }
const checkoutIdA = r1.sessione.id;
console.log("  checkoutId:", checkoutIdA, "| status POST:", r1.statusPost, "| redirectUrl:", (r1.sessione.redirect_url || "").slice(0, 60) + "…");
check(r1.statusPost === 201 || r1.statusPost === 200, "POST /api/cliente/ordini risponde 201/200", r1.statusPost);
check(!!checkoutIdA, "checkoutId presente (intento nel DB)");
check(!!r1.sessione.redirect_url, "redirectUrl Stripe presente (sessione provider)");

// [B] Verifica DB subito dopo l'avvio
console.log("\n[B] Verifica DB post-avvio (nessun pagamento)…");
const sessA = dbScalar(`select id, ordine_id, provider, status, amount, currency, (checkout_payload is not null) as ha_payload, (checkout_key is not null) as ha_key, checkout_key from pagamenti_sessioni where id='${checkoutIdA}';`);
check(!!sessA, "sessione intento creata");
check(sessA?.ordine_id === null, "pagamenti_sessioni.ordine_id IS NULL", sessA?.ordine_id);
check(sessA?.status === "created", "status = created");
check(sessA?.provider === "stripe", "provider = stripe");
check(sessA?.ha_payload === true, "checkout_payload presente");
check(sessA?.ha_key === true, "checkout_key presente");
const ordiniDopoA = dbScalar("select count(*) as n from ordini;").n;
check(ordiniDopoA === baseOrdini, "ordini INVARIATO (nessun ordine prima del pagamento)", `${baseOrdini} → ${ordiniDopoA}`);
const stockA = await statoProdotto();
check(stockA.quantita_disponibile === baseStock.quantita_disponibile, "quantita_disponibile invariata (solo riserva)", stockA.quantita_disponibile);
check(stockA.quantita_riservata === baseStock.quantita_riservata + 1, "quantita_riservata +1 (riserva attiva)", stockA.quantita_riservata);
check(Number(sessA?.amount) >= 700, "amount >= prezzo prodotto (700 + spedizione)", sessA?.amount);

// [C] Abbandono: nessun ordine dopo attesa; rilascio riserva via RPC P1
console.log("\n[C] Abbandono — attesa 12s, poi annulla intento (rilascio riserva)…");
await new Promise((r) => setTimeout(r, 12000));
const ordiniDopoAttesa = dbScalar("select count(*) as n from ordini;").n;
check(ordiniDopoAttesa === baseOrdini, "dopo abbandono: NESSUN ordine creato", ordiniDopoAttesa);
const annulla = dbJson(`select checkout_intento_annulla('${checkoutIdA}') as r;`);
check(annulla[0]?.r?.ok === true, "checkout_intento_annulla ok (rilascio riserva)", annulla[0]?.r);
const stockC = await statoProdotto();
check(stockC.quantita_riservata === baseStock.quantita_riservata, "riserva rilasciata (quantita_riservata tornata al baseline)", stockC.quantita_riservata);
const sessC = dbScalar(`select status from pagamenti_sessioni where id='${checkoutIdA}';`);
check(sessC?.status === "expired", "intento abbandonato → status expired", sessC?.status);
const ordiniDopoC = dbScalar("select count(*) as n from ordini;").n;
check(ordiniDopoC === baseOrdini, "DOPO annulla: ancora NESSUN ordine", ordiniDopoC);

// ═══ PARTE D — CHECKOUT COMPLETATO CON PAGAMENTO REALE (TEST MODE) ═══════
console.log("\n[D] Nuovo checkout + pagamento REALE su Stripe TEST (carta 4242)…");
const emailD = `qa-p6-paid-${ts}@example.com`;
const ctx2 = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" });
await ctx2.addCookies([{ name: "lh_guest", value: "1", domain: ".incitta.online", path: "/", httpOnly: true, secure: true }]);
const page2 = await ctx2.newPage();
let statusPostD = null;
page2.on("response", (res) => {
  const url = res.url();
  if (url.replace(/\/$/, "").endsWith("/api/cliente/ordini") && res.request().method() === "POST" && statusPostD === null) {
    statusPostD = res.status();
  }
});
await page2.goto(`${BASE}/prodotto/${SLUG}/acquista/spedizione`, { waitUntil: "networkidle", timeout: 60000 });
await page2.waitForSelector('input[name="spedizione"]', { timeout: 30000 });
await page2.fill("#nome", "Test");
await page2.fill("#cognome", "P6-Paid");
await page2.fill("#telefono", "3331234567");
await page2.fill("#email", emailD);
await page2.fill("#indirizzo", "Via Roma 1");
await page2.fill('input[name="cap"]', "87012");
await page2.waitForTimeout(1200);
const provD = await page2.evaluate(() => document.querySelector('input[name="provincia"]')?.value ?? "");
if (!provD) { await page2.fill('input[name="provincia"]', "CS"); await page2.waitForTimeout(400); }
await page2.locator('input[name="spedizione"]:not([disabled])').first().check({ timeout: 10000 });
const cartaD = page2.locator('input[name="pagamento"][value="carta"]');
check(!(await cartaD.isDisabled().catch(() => true)), "carta selezionabile (secondo checkout)");
await cartaD.check();
await page2.click('button:has-text("Procedi al pagamento")');
await page2.waitForTimeout(8000);
const sessD0 = dbScalar(`select id, redirect_url, status, amount from pagamenti_sessioni where checkout_payload -> 'cliente' ->> 'email' = '${emailD}' order by created_at desc limit 1;`);
const checkoutIdD = sessD0?.id;
const redirectD = sessD0?.redirect_url;
check(statusPostD === 201 || statusPostD === 200, "secondo POST ordini risponde 201/200", statusPostD);
check(!!checkoutIdD, "secondo checkoutId creato", checkoutIdD);
check(!!redirectD, "redirect Stripe presente", redirectD);

const sessD0bis = dbScalar(`select ordine_id, status from pagamenti_sessioni where id='${checkoutIdD}';`);
check(sessD0bis?.ordine_id === null && sessD0bis?.status === "created", "pre-pagamento: intento attivo senza ordine", sessD0bis);

// Vai a Stripe TEST e paga con 4242 (robusto: riempie i campi negli iframe)
async function pagaSuStripe(page, email) {
  await page.goto(redirectD, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Email (necessaria per attivare la sezione metodo di pagamento)
  await page.waitForSelector("#email", { timeout: 30000 });
  await page.fill("#email", email);
  await page.waitForTimeout(1500);
  // Espandi il metodo Carta (accordion): force-click sul label (il radio è
  // controllato da React e coperto da overlay anti-bot).
  try { await page.click("#payment-method-label-card", { force: true, timeout: 8000 }); } catch {}  // Card fields: nativi sulla pagina (#cardNumber/#cardExpiry/#cardCvc).
  // fill() di Playwright + VERIFICA che il valore sia persistito (React può
  // ripulire il campo dopo il fill) — rifill finché non resta.
  const campi = [
    { sel: "#cardNumber", val: "4242 4242 4242 4242" },
    { sel: "#cardExpiry", val: "12 / 34" },
    { sel: "#cardCvc", val: "123" },
  ];
  for (let tentativo = 0; tentativo < 20; tentativo++) {
    let mancanti = false;
    for (const c of campi) {
      const loc = page.locator(c.sel).first();
      if (!(await loc.count().catch(() => 0))) { mancanti = true; continue; }
      const v = await loc.inputValue().catch(() => "");
      if (v.replace(/\s/g, "") !== c.val.replace(/\s/g, "")) {
        try { await loc.fill(c.val, { timeout: 2000 }); } catch {}
        mancanti = true;
      }
    }
    // Nome titolare se presente
    const nomeLoc = page.locator("#billingName").first();
    if (await nomeLoc.count().catch(() => 0)) {
      const v = await nomeLoc.inputValue().catch(() => "");
      if (!v.trim()) { try { await nomeLoc.fill("Test P6", { timeout: 2000 }); } catch {} mancanti = true; }
    }
    if (!mancanti) break;
    await page.waitForTimeout(1200);
  }
  const finali = [];
  for (const c of campi) { finali.push((await page.locator(c.sel).first().inputValue().catch(() => ""))); }
  console.log("    campi card finali:", JSON.stringify(finali.map((v) => v.slice(0, 12))));

  // Pulsante paga
  await page.locator("button[type='submit']").first().click({ timeout: 20000 }).catch(async () => {
    await page.locator("button:has-text('Paga')").first().click({ timeout: 10000 });
  });
  // Se il primo click mostra "Obbligatorio", riprova il fill + click (transient)
  await page.waitForTimeout(2500);
  const ancora = await page.evaluate(() => document.querySelector(".Error, [role='alert'], #errorElement")?.textContent?.trim() ?? "").catch(() => "");
  if (ancora && /obbligatorio|required/i.test(ancora)) {
    for (const c of campi) {
      try { await page.locator(c.sel).first().fill(c.val, { timeout: 2000 }); } catch {}
    }
    await page.locator("button[type='submit']").first().click({ timeout: 20000 }).catch(() => {});
  }
  // Attendi l'esito: redirect fuori da Stripe (successo) O errore visibile.
  let esito = null;
  for (let i = 0; i < 40; i++) {
    const url = page.url();
    if (!url.includes("checkout.stripe.com")) { esito = { tipo: "redirect", url }; break; }
    const errText = await page.evaluate(() => {
      const el = document.querySelector(".Error, [role='alert'], #errorElement, .TextInput-error, [data-testid='error-message']");
      return el ? el.textContent.trim() : null;
    }).catch(() => null);
    if (errText) { esito = { tipo: "errore", testo: errText }; break; }
    await page.waitForTimeout(1000);
  }
  if (!esito) esito = { tipo: "timeout", url: page.url() };
  return esito;
}

try {
  const esitoP = await pagaSuStripe(page2, emailD);
  console.log("    esito Stripe:", JSON.stringify(esitoP).slice(0, 160));
  check(esitoP.tipo === "redirect", "pagamento completato su Stripe TEST (redirect fuori dal checkout)", esitoP);
} catch (e) {
  check(false, "errore pagamento Stripe: " + String(e).slice(0, 200));
  console.log("  pagina attuale:", page2.url());
}

// Attendi il webhook + conferma (poll DB fino a 150s)
console.log("\n  Attendo webhook → conferma intento (polling DB)…");
let confermato = false;
let sessDF = null, ordineD = null, stockD = null, righeD = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  sessDF = dbScalar(`select id, ordine_id, status, payment_id from pagamenti_sessioni where id='${checkoutIdD}';`);
  if (sessDF?.ordine_id) {
    ordineD = dbScalar(`select id, payment_status, payment_provider, payment_id, totale, negozio_id, cliente_email, metodo_pagamento from ordini where id='${sessDF.ordine_id}';`);
    if (ordineD) { confermato = true; break; }
  }
  if (i === 5) console.log("    (ancora in attesa… status:", sessDF?.status, ")");
}
check(confermato, "webhook ricevuto → checkout_intento_conferma → ordine creato");
if (confermato) {
  check(sessDF.status === "paid", "sessione → paid");
  check(ordineD.payment_status === "paid", "ordine payment_status = paid", ordineD.payment_status);
  check(ordineD.payment_provider === "stripe", "payment_provider = stripe");
  check(Number(ordineD.totale) >= 700, "totale ordine >= 700", ordineD.totale);
  check(ordineD.negozio_id === NEGOZIO_ID, "negozio = Panificio Rossi");
  check(ordineD.cliente_email === emailD, "email cliente = quella del checkout");
  righeD = dbJson(`select count(*) as n from ordini_righe where ordine_id='${ordineD.id}';`);
  check(righeD[0].n === 1, "ordini_righe create (1 riga)", righeD[0].n);
  stockD = await statoProdotto();
  check(stockD.quantita_disponibile === baseStock.quantita_disponibile - 1, "stock convertito: quantita_disponibile -1", `${baseStock.quantita_disponibile} → ${stockD.quantita_disponibile}`);
  check(stockD.quantita_riservata === baseStock.quantita_riservata, "riserva consumata (quantita_riservata baseline)", stockD.quantita_riservata);
  const evD = dbJson(`select count(*) as n from pagamenti_eventi where payment_id = '${ordineD.payment_id}' or ordine_id = '${ordineD.id}';`);
  check(evD[0].n >= 1, "pagamenti_eventi registrato (webhook)", evD[0].n);
  const notifD = dbJson(`select count(*) as n from admin_notifiche where (payload::text ilike '%${ordineD.id}%' or payload::text ilike '%${sessDF.payment_id || ""}%') or (payload::text ilike '%Nuovo ordine%' and created_at > now() - interval '5 minutes');`);
  check(notifD[0].n >= 1, "notifica admin creata (dopo conferma)", notifD[0].n);
  const nOrdiniFinale = dbScalar("select count(*) as n from ordini;").n;
  check(nOrdiniFinale === baseOrdini + 1, "UN SOLO ordine creato (totale)", `${baseOrdini} → ${nOrdiniFinale}`);
} else {
  console.log("  ⚠️  webhook non ricevuto entro 150s — ultimo stato sessione:", JSON.stringify(sessDF));
}

await browser.close();

console.log(`\n═══ RISULTATO FASE 9: ${PASS} ✅ / ${FAIL} ❌ ═══`);
console.log("checkoutId abbandonato:", checkoutIdA);
if (ordineD) console.log("ordine creato (id):", ordineD.id, "| payment_id:", ordineD.payment_id);
process.exit(FAIL > 0 ? 1 : 0);