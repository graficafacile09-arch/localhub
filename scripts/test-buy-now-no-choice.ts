/**
 * TEST ACCETTAZIONE — BUY-NOW: NESSUNA SCELTA DI PAGAMENTO = ZERO ORDINI.
 *
 * REGOLA ASSOLUTA: il buy-now NON deve MAI creare un ordine se l'utente non
 * ha fatto una scelta ESPLICITA del metodo di pagamento. Vale in ogni caso
 * (0 metodi, 1 metodo, 3 metodi, negozio non configurato, stato del browser…).
 *
 *   BUY-NOW + NESSUNA SCELTA
 *   = ZERO POST /api/cliente/ordini
 *   + ZERO ORDINI NEL DB
 *   + ZERO STOCK MODIFICATO
 *   + ZERO SESSIONI DI PAGAMENTO.
 *
 * Copre i TEST 1-7 richiesti:
 *   T1 zero metodi        → UI chiaro + pulsante disabilitato + nessun POST;
 *   T2 solo bonifico      → bloccato senza click; dopo click esplicito ordine;
 *   T3 solo carta         → bloccato senza click; dopo click ordine (carta);
 *   T4 solo klarna        → bloccato senza click; dopo click ordine (klarna);
 *   T5 tre metodi         → stato iniziale null, nessun auto-selezione;
 *   T6 cambio scelta      → vince SEMPRE l'ultima selezione esplicita;
 *   T7 API senza metodo   → POST senza/ null / "" / non valido → 422, 0 ordini.
 *
 * Browser reale con network interception per dimostrare il punto 7:
 * nessun POST parte senza selezione esplicita.
 *
 * Gateway: chiamate REALI (nessun override). Le credenziali Stripe/Klarna
 * sono placeholder test → i submit carta/klarna provano il dispatch fino al
 * gateway (fail-closed reale senza credenziali, mai fallback). Il contratto
 * oggetto di questo test (scelta esplicita) NON richiede credenziali.
 *
 * Uso: npx tsx scripts/test-buy-now-no-choice.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const CHIAVE_TEST = "chiave-buynow-nochoice-0001";
const WH_SECRET_STRIPE = "whsec_stripe_nochoice";
const WH_SECRET_KLARNA = "whsec_klarna_nochoice";
// Placeholder (il test NON richiede sessioni reali): il dispatch reale
// fallirà di autenticazione in modo fail-closed, mai un fallback.
const STRIPE_SECRET = "sk_test_PLACEHOLDER_NON_VALIDA";
const KLARNA_USER = "api_username_test";
const KLARNA_PASS = "api_password_test";

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

const PORTA = Number(process.env.BUYNOW_NOCHOICE_PORT ?? 3175);
const BASE = `http://127.0.0.1:${PORTA}`;
let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "buynow-nochoice-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA + " --webpack", {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST,
      // Limiti alzati SOLO per l'ambiente di test (var già documentate nel
      // rate-limiter): il browser non può inviare x-forwarded-for.
      ORDINI_RATE_LIMIT_PER_MINUTE: "1000",
      ORDINI_RATE_LIMIT_PER_HOUR: "10000",
      RESEND_API_KEY: "",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Server dev terminato. Vedi " + join(tmpdir(), "buynow-nochoice-next-dev.log"));
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: "{}",
      });
      if (res.status === 422) return console.log(`\nServer dev pronto su ${BASE} (gateway REALI).\n`);
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Server dev non pronto entro 240s.");
}

function fermaServer(): void {
  if (!server) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {}
  server = null;
}

let ipCounter = 345;
function ipProva(): string {
  ipCounter += 1;
  return `10.8.6.${ipCounter}`;
}

async function postJson(path: string, body: unknown): Promise<{ status: number } & Record<string, any>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ipProva() },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, ...(json ?? {}) };
}

function payloadSpedizione(idempotencyKey: string, prodottoId: string, metodoPagamento?: unknown) {
  const p: Record<string, unknown> = {
    idempotencyKey,
    prodottoId: String(prodottoId),
    varianteId: null,
    quantita: 1,
    modalita: "spedizione",
    cliente: { nome: "Mario", cognome: "NoChoice", email: "no-choice@localhub.test", telefono: "3331234567" },
    spedizione: {
      indirizzo: "Via Test 1",
      cap: "87100",
      citta: "Cosenza",
      provincia: "CS",
      note: null,
      metodoSpedizione: "standard",
    },
    note: null,
  };
  if (metodoPagamento !== undefined) {
    (p.spedizione as Record<string, unknown>).metodoPagamento = metodoPagamento;
  }
  return p;
}

// ── Helpers browser ─────────────────────────────────────────────────────────

async function apriSpedizione(browser: Browser, slug: string, percorsoCompleto: boolean): Promise<{ page: Page; postOrdini: string[] }> {
  const page: Page = await browser.newPage();
  const postOrdini: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (req.method() === "POST" && u.includes("/api/cliente/ordini") && !u.includes("/carrello")) {
      postOrdini.push(u);
    }
  });
  if (percorsoCompleto) {
    // Percorso REALE: prodotto → ACQUISTA → scelta → spedizione.
    await page.goto(`${BASE}/prodotto/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const acquista = page.locator("text=ACQUISTA").or(page.locator("text=Acquista").first());
    await acquista.first().click();
    await page.waitForURL(/\/acquista/, { timeout: 30000 });
    await page.locator("text=Spedizione a domicilio").first().click();
    await page.waitForURL(/\/acquista\/spedizione/, { timeout: 30000 });
  } else {
    await page.goto(`${BASE}/prodotto/${slug}/acquista/spedizione`, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  await page.waitForTimeout(1200); // idratazione
  return { page, postOrdini };
}

async function compilaForm(page: Page): Promise<void> {
  const campi: Array<[string, string]> = [
    ["nome", "Mario"],
    ["cognome", "NoChoice"],
    ["telefono", "3331234567"],
    ["email", "no-choice@localhub.test"],
    ["indirizzo", "Via Test 1"],
    ["cap", "87100"],
    ["citta", "Cosenza"],
    ["provincia", "CS"],
  ];
  for (const [id, v] of campi) await page.locator(`#${id}`).fill(v);
}

function radioSelezionati(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")]
      .filter((r) => r.checked)
      .map((r) => r.value)
  );
}

async function selezionaEInvia(page: Page, metodo: string): Promise<void> {
  await page.locator(`input[name="pagamento"][value="${metodo}"]`).click();
  await page.getByRole("button", { name: /Procedi al pagamento/ }).click();
  await Promise.race([
    page.waitForURL(/\/ordini\/conferma\/|checkout\.stripe\.com|klarna\.com|playground/, { timeout: 15000 }).catch(() => {}),
    page.waitForTimeout(10000),
  ]);
  await page.waitForTimeout(1000);
}

async function ultimoOrdine(db: any, negozioId: string) {
  const { data } = await db
    .from("ordini")
    .select("id, metodo_pagamento, payment_provider, stato, payment_status")
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function contaOrdini(db: any, negozioId: string): Promise<number> {
  const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).eq("negozio_id", negozioId);
  return Number(count ?? 0);
}

async function main() {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_TEST;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const ts = Date.now();

  const negozi: Record<string, string> = {}; // chiave → negozioId
  const prodotti: Record<string, number> = {}; // chiave → prodottoId
  const slug: Record<string, string> = {};
  let browser: Browser | null = null;

  try {
    // ── Setup: 5 negozi controllati (ZERO / BON / CARTA / KLARNA / TRE) ──
    console.log("\n[SETUP] 5 negozi controllati + prodotti");
    const definizioni: Array<{ chiave: string; metodi: string[] }> = [
      { chiave: "zero", metodi: [] },
      { chiave: "bon", metodi: ["bonifico"] },
      { chiave: "carta", metodi: ["carta"] },
      { chiave: "klarna", metodi: ["klarna"] },
      { chiave: "tre", metodi: ["carta", "bonifico", "klarna"] },
    ];
    for (const d of definizioni) {
      const { data: n } = await db
        .from("negozi")
        .insert({ nome: `NoChoice-${d.chiave}-${ts}`, slug: `nochoice-${d.chiave}-${ts}`, attivo: true, is_demo: true })
        .select("id")
        .single();
      negozi[d.chiave] = String(n!.id);
      slug[d.chiave] = `nochoice-${d.chiave}-${ts}`;

      if (d.metodi.includes("bonifico")) {
        await db.rpc("pagamenti_credenziali_salva", {
          p_negozio_id: negozi[d.chiave], p_provider: "bonifico", p_attivo: true, p_test_mode: true,
          p_payee_email: "banca@negozio.test", p_iban: "IT60X0542811101000000123456", p_chiave: CHIAVE_TEST,
        });
      }
      if (d.metodi.includes("carta")) {
        await db.rpc("pagamenti_credenziali_salva", {
          p_negozio_id: negozi[d.chiave], p_provider: "stripe", p_attivo: true, p_test_mode: true,
          p_client_id: null, p_secret: STRIPE_SECRET, p_webhook_secret: WH_SECRET_STRIPE, p_chiave: CHIAVE_TEST,
        });
      }
      if (d.metodi.includes("klarna")) {
        await db.rpc("pagamenti_credenziali_salva", {
          p_negozio_id: negozi[d.chiave], p_provider: "klarna", p_attivo: true, p_test_mode: true,
          p_client_id: KLARNA_USER, p_secret: KLARNA_PASS, p_webhook_secret: WH_SECRET_KLARNA, p_chiave: CHIAVE_TEST,
        });
      }
      if (d.metodi.length > 0) {
        await db.from("negozio_metodi_pagamento").insert(
          d.metodi.map((m, i) => ({ negozio_id: negozi[d.chiave], metodo: m, attivo: true, ordine_mostra: i }))
        );
      }
      const { data: q } = await db
        .from("prodotti")
        .insert({ negozio_id: negozi[d.chiave], nome: `NoChoice ${d.chiave}-${ts}`, slug: slug[d.chiave], prezzo: 10.0, quantita_disponibile: 50, attivo: true, ha_varianti: false })
        .select("id")
        .single();
      prodotti[d.chiave] = Number(q!.id);
    }

    await avviaServer();
    browser = await chromium.launch({ headless: true });

    // ── TEST 1 — ZERO METODI (browser, percorso completo) ──────────────────
    console.log("\n[T1] Negozi senza metodi: nessuna scelta possibile, zero POST");
    {
      const { page, postOrdini } = await apriSpedizione(browser, slug.zero, true);
      const testo = await page.evaluate(() => document.body.innerText);
      check("1a. UI: messaggio 'non ha configurato pagamenti online' visibile", testo.includes("non ha configurato pagamenti online"));
      check("1b. UI: NESSUN radio di pagamento presente", (await page.locator('input[name="pagamento"]').count()) === 0);
      const bottone = page.getByRole("button", { name: /Procedi al pagamento/ });
      check("1c. pulsante DISABILITATO", await bottone.isDisabled());
      await bottone.dispatchEvent("click"); // tentativo di click → nessun effetto
      await page.waitForTimeout(1000);
      check("1d. ZERO POST /api/cliente/ordini", postOrdini.length === 0, postOrdini);
      check("1e. ZERO ordini nel DB per questo negozio", (await contaOrdini(db, negozi.zero)) === 0);
      await page.screenshot({ path: join(PROGETTO, "screenshots/no-choice-t1-zero-metodi.png"), fullPage: true }).catch(() => {});
      await page.close();
    }

    // ── TEST 2 — SOLO BONIFICO ────────────────────────────────────────────
    console.log("\n[T2] Solo bonifico: bloccato senza scelta; ordine dopo click esplicito");
    {
      const { page, postOrdini } = await apriSpedizione(browser, slug.bon, false);
      check("2a. nessun metodo selezionato all'apertura", (await radioSelezionati(page)).length === 0, await radioSelezionati(page));
      const bottone = page.getByRole("button", { name: /Procedi al pagamento/ });
      check("2b. pulsante DISABILITATO senza scelta", await bottone.isDisabled());
      await bottone.dispatchEvent("click");
      await page.waitForTimeout(800);
      check("2c. click senza scelta → ZERO POST", postOrdini.length === 0, postOrdini);
      check("2d. ZERO ordini (prima di qualsiasi selezione)", (await contaOrdini(db, negozi.bon)) === 0);

      // Scelta ESPLICITA → submit consentito.
      const stockBase = (await db.from("prodotti").select("quantita_disponibile").eq("id", prodotti.bon).single()).data?.quantita_disponibile;
      await compilaForm(page);
      await selezionaEInvia(page, "bonifico");
      check("2e. scelta esplicita → 1 POST", postOrdini.length === 1, postOrdini);
      check("2f. atterraggio su conferma ordine", page.url().includes("/ordini/conferma/"), page.url());
      const ord = await ultimoOrdine(db, negozi.bon);
      check("2g. ordine con metodo_pagamento='bonifico'", ord?.metodo_pagamento === "bonifico", ord);
      check("2h. MAI payment_provider klarna/stripe", !ord?.payment_provider || (ord.payment_provider !== "klarna" && ord.payment_provider !== "stripe"), ord?.payment_provider);
      check("2i. nessuna sessione gateway", (Number((await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", String(ord?.id ?? ""))).count ?? 0)) === 0);
      check("2j. stock decrementato una volta", Number((await db.from("prodotti").select("quantita_disponibile").eq("id", prodotti.bon).single()).data?.quantita_disponibile ?? -1) === Number(stockBase) - 1);
      await page.screenshot({ path: join(PROGETTO, "screenshots/no-choice-t2-bonifico.png"), fullPage: true }).catch(() => {});
      await page.close();
    }

    // ── TEST 3 — SOLO CARTA ───────────────────────────────────────────────
    console.log("\n[T3] Solo carta: bloccato senza scelta; ordine 'carta' dopo click esplicito");
    {
      const { page, postOrdini } = await apriSpedizione(browser, slug.carta, false);
      check("3a. nessun metodo selezionato all'apertura", (await radioSelezionati(page)).length === 0);
      const bottone = page.getByRole("button", { name: /Procedi al pagamento/ });
      check("3b. pulsante DISABILITATO senza scelta", await bottone.isDisabled());
      await bottone.dispatchEvent("click");
      await page.waitForTimeout(800);
      check("3c. click senza scelta → ZERO POST", postOrdini.length === 0, postOrdini);
      check("3d. ZERO ordini (prima di qualsiasi selezione)", (await contaOrdini(db, negozi.carta)) === 0);

      await compilaForm(page);
      await selezionaEInvia(page, "carta");
      check("3e. scelta esplicita carta → 1 POST", postOrdini.length === 1, postOrdini);
      const ord = await ultimoOrdine(db, negozi.carta);
      check("3f. ordine creato con metodo_pagamento='carta' (scelta rispettata, MAI bonifico)", ord?.metodo_pagamento === "carta", ord);
      // Dispatch: senza credenziali reali il gateway Stripe rifiuta (fail-closed
      // reale) → ordine chiuso. MAI un fallback a bonifico/klarna.
      check("3g. MAI fallback: payment_provider mai 'klarna'", ord?.payment_provider !== "klarna", ord?.payment_provider);
      await page.screenshot({ path: join(PROGETTO, "screenshots/no-choice-t3-carta.png"), fullPage: true }).catch(() => {});
      await page.close();
    }

    // ── TEST 4 — SOLO KLARNA ──────────────────────────────────────────────
    console.log("\n[T4] Solo klarna: bloccato senza scelta; ordine dopo click esplicito");
    {
      const { page, postOrdini } = await apriSpedizione(browser, slug.klarna, false);
      check("4a. nessun metodo selezionato all'apertura", (await radioSelezionati(page)).length === 0);
      const bottone = page.getByRole("button", { name: /Procedi al pagamento/ });
      check("4b. pulsante DISABILITATO senza scelta", await bottone.isDisabled());
      await bottone.dispatchEvent("click");
      await page.waitForTimeout(800);
      check("4c. click senza scelta → ZERO POST", postOrdini.length === 0, postOrdini);
      check("4d. ZERO ordini (prima di qualsiasi selezione)", (await contaOrdini(db, negozi.klarna)) === 0);

      await compilaForm(page);
      await selezionaEInvia(page, "klarna");
      check("4e. scelta esplicita klarna → 1 POST", postOrdini.length === 1, postOrdini);
      const ord = await ultimoOrdine(db, negozi.klarna);
      // Colonna RPC: klarna → 'carta' (marcatore autoritativo payment_provider).
      check("4f. ordine creato (colonna RPC 'carta', MAI bonifico)", Boolean(ord) && ord.metodo_pagamento !== "bonifico", ord);
      check("4g. MAI fallback: payment_provider mai 'stripe'", ord?.payment_provider !== "stripe", ord?.payment_provider);
      await page.screenshot({ path: join(PROGETTO, "screenshots/no-choice-t4-klarna.png"), fullPage: true }).catch(() => {});
      await page.close();
    }

    // ── TEST 5 — TRE METODI: stato iniziale null, mai auto-selezione ──────
    console.log("\n[T5] Tre metodi: nessuna auto-selezione; scelte esplicite rispettate");
    {
      const { page, postOrdini } = await apriSpedizione(browser, slug.tre, false);
      const radios = await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")].map((r) => r.value));
      check("5a. tutti e 3 i metodi presenti", ["carta", "bonifico", "klarna"].every((m) => radios.includes(m)), radios);
      check("5b. NESSUN metodo selezionato all'apertura (stato iniziale null)", (await radioSelezionati(page)).length === 0, await radioSelezionati(page));
      const bottone = page.getByRole("button", { name: /Procedi al pagamento/ });
      check("5c. pulsante DISABILITATO all'apertura", await bottone.isDisabled());
      await bottone.dispatchEvent("click");
      await page.waitForTimeout(800);
      check("5d. click senza scelta → ZERO POST", postOrdini.length === 0, postOrdini);
      await page.screenshot({ path: join(PROGETTO, "screenshots/no-choice-t5-iniziale.png"), fullPage: true }).catch(() => {});

      // carta → ordine carta; pagina fresca → ancora nessuna selezione.
      await compilaForm(page);
      await selezionaEInvia(page, "carta");
      const ordCarta = await ultimoOrdine(db, negozi.tre);
      check("5e. selezione carta → ordine carta (mai bonifico)", ordCarta?.metodo_pagamento === "carta", ordCarta);
      await page.close();

      const { page: p2, postOrdini: post2 } = await apriSpedizione(browser, slug.tre, false);
      check("5f. pagina fresca: nessun metodo pre-selezionato (mai il precedente)", (await radioSelezionati(p2)).length === 0, await radioSelezionati(p2));
      await compilaForm(p2);
      await selezionaEInvia(p2, "bonifico");
      const ordBon = await ultimoOrdine(db, negozi.tre);
      check("5g. selezione bonifico → ordine bonifico", ordBon?.metodo_pagamento === "bonifico", ordBon);
      await p2.close();

      const { page: p3, postOrdini: post3 } = await apriSpedizione(browser, slug.tre, false);
      await compilaForm(p3);
      await selezionaEInvia(p3, "klarna");
      const ordKl = await ultimoOrdine(db, negozi.tre);
      check("5h. selezione klarna → ordine creato (mai bonifico/carta)", Boolean(ordKl) && ordKl.metodo_pagamento !== "bonifico", ordKl);
      check("5i. klarna: mai fallback su stripe", ordKl?.payment_provider !== "stripe", ordKl?.payment_provider);
      await p3.close();
    }

    // ── TEST 6 — CAMBIO SCELTA: vince sempre l'ultima ─────────────────────
    console.log("\n[T6] Cambio scelta: l'ultima selezione esplicita vince");
    {
      const { page, postOrdini } = await apriSpedizione(browser, slug.tre, false);
      await compilaForm(page);
      await page.locator('input[name="pagamento"][value="carta"]').click();
      await page.locator('input[name="pagamento"][value="bonifico"]').click();
      await page.getByRole("button", { name: /Procedi al pagamento/ }).click();
      await Promise.race([
        page.waitForURL(/\/ordini\/conferma\//, { timeout: 15000 }).catch(() => {}),
        page.waitForTimeout(10000),
      ]);
      const ord1 = await ultimoOrdine(db, negozi.tre);
      check("6a. carta→bonifico: ordine BONIFICO (ultima scelta)", ord1?.metodo_pagamento === "bonifico", ord1);
      await page.close();

      const { page: p2, postOrdini: post2 } = await apriSpedizione(browser, slug.tre, false);
      await compilaForm(p2);
      await p2.locator('input[name="pagamento"][value="klarna"]').click();
      await p2.locator('input[name="pagamento"][value="carta"]').click();
      await p2.getByRole("button", { name: /Procedi al pagamento/ }).click();
      await Promise.race([
        p2.waitForURL(/\/ordini\/conferma\/|checkout\.stripe\.com/, { timeout: 15000 }).catch(() => {}),
        p2.waitForTimeout(10000),
      ]);
      const ord2 = await ultimoOrdine(db, negozi.tre);
      check("6b. klarna→carta: ordine CARTA (ultima scelta, mai bonifico)", ord2?.metodo_pagamento === "carta", ord2);
      await p2.close();
    }

    // ── TEST 7 — API SENZA METODO: 422, zero ordini, zero stock, zero sessioni ──
    console.log("\n[T7] POST /api/cliente/ordini senza metodo esplicito → 422, zero ordini");
    {
      const stockBase = (await db.from("prodotti").select("quantita_disponibile").eq("id", prodotti.tre).single()).data?.quantita_disponibile;
      const casi: Array<{ nome: string; payload: Record<string, unknown> }> = [
        { nome: "metodo ASSENTE", payload: payloadSpedizione(`nc-absent-${ts}`, String(prodotti.tre)) },
        { nome: "metodo null", payload: payloadSpedizione(`nc-null-${ts}`, String(prodotti.tre), null) },
        { nome: "metodo stringa vuota", payload: payloadSpedizione(`nc-empty-${ts}`, String(prodotti.tre), "") },
        { nome: "metodo 'qualcosa'", payload: payloadSpedizione(`nc-qualcosa-${ts}`, String(prodotti.tre), "qualcosa") },
        { nome: "metodo 'paypal'", payload: payloadSpedizione(`nc-paypal-${ts}`, String(prodotti.tre), "paypal") },
      ];
      for (const c of casi) {
        const esito = await postJson("/api/cliente/ordini", c.payload);
        const ok = esito.status === 422;
        check(`7.${c.nome} → HTTP 422`, ok, { status: esito.status, error: esito.error });
        if (!ok) {
          const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `nc-${c.nome.split(" ")[1] ?? ""}-${ts}%`);
          console.log("    (ordini creati con questa chiave:", count, ")");
        }
      }
      const { count: totali } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `nc-%-${ts}`);
      check("7a. ZERO ordini creati da TUTTI i casi (prefisso nc-%-ts)", Number(totali ?? 0) === 0, totali);
      const stockDopo = (await db.from("prodotti").select("quantita_disponibile").eq("id", prodotti.tre).single()).data?.quantita_disponibile;
      check("7b. stock INVARIATO", Number(stockDopo) === Number(stockBase), { prima: stockBase, dopo: stockDopo });
      check("7c. ZERO sessioni di pagamento", (Number((await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true })).count ?? 0)) === 0);
      // Errore dedicato per il caso assente/null (contratto leggibile).
      const assente = await postJson("/api/cliente/ordini", payloadSpedizione(`nc-check-${ts}`, String(prodotti.tre)));
      check("7d. errore dedicato METODO_PAGAMENTO_NON_SCELTO per metodo assente", assente.status === 422 && assente.error?.code === "METODO_PAGAMENTO_NON_SCELTO", assente.error);
      check("7e. messaggio leggibile 'Seleziona un metodo di pagamento per continuare.'", assente.error?.message === "Seleziona un metodo di pagamento per continuare.", assente.error?.message);

      // Regressione: modalità RITIRO senza metodo resta valida (nessun pagamento online).
      const ritiro = await postJson("/api/cliente/ordini", {
        idempotencyKey: `nc-ritiro-${ts}`,
        prodottoId: String(prodotti.tre),
        varianteId: null,
        quantita: 1,
        modalita: "ritiro",
        cliente: { nome: "Mario", cognome: "NoChoice", telefono: "3331234567" },
        ritiro: { data: null, fascia: null },
        note: null,
      });
      check("7f. regressione RITIRO: ordine creato senza metodo (201)", ritiro.status === 201 && Boolean(ritiro.data?.ordine?.id), { status: ritiro.status, error: ritiro.error });
      if (ritiro.data?.ordine?.id) {
        await db.from("pagamenti_eventi").delete().eq("ordine_id", String(ritiro.data.ordine.id));
        await db.from("pagamenti_sessioni").delete().eq("ordine_id", String(ritiro.data.ordine.id));
        await db.from("ordini").delete().eq("id", String(ritiro.data.ordine.id));
      }
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`BUY-NOW NO-CHOICE TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join("; ")}`);
      process.exitCode = 1;
    } else {
      console.log("TUTTI I TEST PASSATI ✓ — BUY-NOW + NESSUNA SCELTA = ZERO ORDINI");
    }
  } finally {
    console.log("\n── CLEANUP ──");
    if (browser) await browser.close().catch(() => {});
    for (const chiave of ["zero", "bon", "carta", "klarna", "tre"]) {
      const id = negozi[chiave];
      if (!id) continue;
      const { data: ordini } = await db.from("ordini").select("id").eq("negozio_id", id);
      const ids = (ordini ?? []).map((o: any) => String(o.id));
      if (ids.length > 0) {
        await db.from("pagamenti_eventi").delete().in("ordine_id", ids);
        await db.from("pagamenti_sessioni").delete().in("ordine_id", ids);
        await db.from("ordini").delete().in("id", ids);
      }
      if (prodotti[chiave]) await db.from("prodotti").delete().eq("id", prodotti[chiave]);
      await db.from("negozio_metodi_pagamento").delete().eq("negozio_id", id);
      await db.from("negozio_pagamenti").delete().eq("negozio_id", id);
      await db.from("negozi").delete().eq("id", id);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `nc-%-${ts}`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `nc-%-${ts}`);
        console.log(`  Sweep residui nc-%-${ts}: ${residui}`);
      }
    }
    fermaServer();
    console.log("  Dati di test eliminati (ordini, sessioni, eventi, prodotti, metodi, config, negozi).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione:", e);
  process.exit(1);
});
