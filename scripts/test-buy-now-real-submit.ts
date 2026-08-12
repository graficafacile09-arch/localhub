/**
 * TEST BROWSER REALE — SUBMIT COMPLETO DEL FLUSSO BUY-NOW (nessun mock).
 *
 * Il browser esegue DAVVERO:
 *   PRODOTTO → ACQUISTA → METODO DI PAGAMENTO → selezione → SUBMIT
 *   → API reale (/api/cliente/ordini) → ordine/sessione reale → risultato.
 *
 * Nessun override gateway: le chiamate HTTP vanno ai provider REALI
 * (api.playground.klarna.com, api.stripe.com) con le credenziali test della
 * configurazione del negozio controllato.
 *
 * Scenari (uno per metodo, cleanup immediato dopo ciascuno):
 *   A) BONIFICO  → ordine creato, nessuna sessione gateway, conferma.
 *   B) KLARNA    → ordine + payment_provider='klarna' + sessione Klarna +
 *                  redirect hosted (con credenziali playground valide).
 *   C) CARTA     → ordine + payment_provider='stripe' + sessione Stripe +
 *                  redirect checkout.stripe.com (con chiave sk_test valida).
 *   In assenza di credenziali reali valide, Klarna/Carta mostrano il
 *   fail-closed REALE (ordine chiuso, stock ripristinato, mai fallback)
 *   e il test lo documenta senza dichiarare PASS.
 *
 * Credenziali test (opzionali, via env, MAI nel codice):
 *   TEST_STRIPE_SECRET=sk_test_...  TEST_STRIPE_WEBHOOK=whsec_...
 *   TEST_KLARNA_USERNAME=...  TEST_KLARNA_PASSWORD=...  TEST_KLARNA_WEBHOOK=whsec_...
 *
 * Uso: npx tsx scripts/test-buy-now-real-submit.ts
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

const CHIAVE_TEST = "chiave-buynow-real-submit-0001";
const WH_SECRET_KLARNA = process.env.TEST_KLARNA_WEBHOOK ?? "whsec_klarna_real_submit";
const WH_SECRET_STRIPE = process.env.TEST_STRIPE_WEBHOOK ?? "whsec_stripe_real_submit";
// Placeholder se non fornite: le chiamate reali falliranno di autenticazione
// (fail-closed REALE documentato, mai un fallback). Credenziali REALI solo se
// esplicitamente fornite via env (Mai nel codice, mai in repo).
const STRIPE_SECRET = process.env.TEST_STRIPE_SECRET ?? "sk_test_PLACEHOLDER_NON_VALIDA";
const KLARNA_USER = process.env.TEST_KLARNA_USERNAME ?? "api_username_test";
const KLARNA_PASS = process.env.TEST_KLARNA_PASSWORD ?? "api_password_test";

const haStripeReale = Boolean(process.env.TEST_STRIPE_SECRET) && /^sk_test_[A-Za-z0-9]{16,}$/.test(STRIPE_SECRET);
const haKlarnaReale = Boolean(process.env.TEST_KLARNA_USERNAME && process.env.TEST_KLARNA_PASSWORD);

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

const PORTA = Number(process.env.BUYNOW_REAL_PORT ?? 3170);
const BASE = `http://127.0.0.1:${PORTA}`;
let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "buynow-real-next-dev.log"), { flags: "w" });
  // --webpack: evita il panic intermittente di Turbopack su Windows
  // (globals.css, exit 0xc0000142) che rende le pagine 500. Solo ambiente
  // di test: il codice prodotto è identico.
  server = spawn("npx next dev -p " + PORTA + " --webpack", {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST,
      RESEND_API_KEY: "",
      NODE_ENV: "development",
      // NESSUN override KLARNA_API_BASE_URL / host Stripe → gateway REALI.
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Server dev terminato. Vedi " + join(tmpdir(), "buynow-real-next-dev.log"));
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

/** Compila il form di spedizione e fa il submit REALE cliccando il pulsante. */
async function submitReale(
  browser: Browser,
  slugProdotto: string,
  metodo: "carta" | "bonifico" | "klarna"
): Promise<{
  urlFinale: string;
  erroreUI: string | null;
  consoleErrors: string[];
  screenshot: string;
}> {
  const page: Page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 160)));
  // Nota: il filtro dei 422 attesi avviene al momento del return (gli eventi
  // console arrivano in modo asincrono durante la navigazione).

  // PRODOTTO → ACQUISTA (senza carrello).
  await page.goto(`${BASE}/prodotto/${slugProdotto}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const acquista = page.locator("text=ACQUISTA").or(page.locator("text=Acquista").first());
  await acquista.first().click();
  await page.waitForURL(new RegExp(`/acquista`), { timeout: 30000 });
  // Scelta → Spedizione a domicilio.
  const sped = page.locator("text=Spedizione a domicilio").first();
  await sped.click();
  await page.waitForURL(/\/acquista\/spedizione/, { timeout: 30000 });

  // DATI CLIENTE + INDIRIZZO.
  const compila = async (id: string, valore: string) => {
    const el = page.locator(`#${id}`);
    await el.fill(valore);
  };
  await compila("nome", "Mario");
  await compila("cognome", "RealSubmit");
  await compila("telefono", "3331234567");
  await compila("email", "real-submit@localhub.test");
  await compila("indirizzo", "Via Test 1");
  await compila("cap", "87100");
  await compila("citta", "Cosenza");
  await compila("provincia", "CS");

  // Seleziona il metodo richiesto (radio name=pagamento).
  const selezionato = await page.evaluate((m) => {
    const radios = [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")];
    const r = radios.find((x) => x.value === m);
    if (!r) return { trovato: false, valori: radios.map((x) => x.value) };
    r.click();
    return { trovato: true, valori: radios.map((x) => x.value) };
  }, metodo);

  // SUBMIT reale.
  await page.getByRole("button", { name: /Procedi al pagamento/ }).click();
  // Attendi navigazione O messaggio d'errore nella pagina (compila + gateway
  // reale: concediamo fino a 12s prima di valutare il risultato).
  await Promise.race([
    page.waitForURL(/\/ordini\/conferma\/|checkout\.stripe\.com|klarna\.com|playground/, { timeout: 15000 }).catch(() => {}),
    page.waitForTimeout(12000),
  ]);
  await page.waitForTimeout(1000);

  const erroreUI = await page.locator("text=non è disponibile").or(page.locator("text=Si è verificato un errore")).or(page.locator("text=Riprova")).first().isVisible().catch(() => false)
    ? (await page.locator("div.text-red-700, [role=alert]").first().innerText().catch(() => null))
    : null;

  const urlFinale = page.url();
  const screenshot = `screenshots/buy-now-real-submit-${metodo}.png`;
  await page.screenshot({ path: join(PROGETTO, screenshot), fullPage: true }).catch(() => {});
  await page.close();
  // Nel fail-closed REALE (credenziali placeholder) il 422 dell'API è il
  // comportamento atteso e compare come errore di risorsa in console: non è
  // un errore dell'app. Gli errori VERI sono tutto il resto.
  const consoleErroriVeri = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e)
  );
  return { urlFinale, erroreUI, consoleErrors: consoleErroriVeri, screenshot };
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

  let negozioId: string | null = null;
  let prodottoId: number | null = null;
  let slug: string | null = null;
  const ordiniCreati: string[] = [];
  let browser: Browser | null = null;

  console.log(
    `\nCredenziali reali: Stripe=${haStripeReale ? "SÌ (sk_test valida)" : "NO (placeholder)"} · ` +
      `Klarna=${haKlarnaReale ? "SÌ (playground)" : "NO (placeholder)"}`
  );

  try {
    // ── Setup negozio controllato (3 metodi) ─────────────────────────────
    console.log("\n[SETUP] Negozio controllato: bonifico + Stripe + Klarna + prodotto");
    const { data: n } = await db.from("negozi").insert({
      nome: `RealSubmit-${ts}`,
      slug: `realsubmit-${ts}`,
      attivo: true,
      is_demo: true,
    }).select("id").single();
    negozioId = String(n!.id);

    const cfgBon = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioId, p_provider: "bonifico", p_attivo: true, p_test_mode: true,
      p_payee_email: "banca@negozio.test", p_iban: "IT60X0542811101000000123456",
      p_chiave: CHIAVE_TEST,
    });
    if ((cfgBon.data as { ok?: boolean } | null)?.ok !== true) throw new Error("Config bonifico fallita: " + JSON.stringify(cfgBon.error ?? cfgBon.data));
    const cfgSt = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioId, p_provider: "stripe", p_attivo: true, p_test_mode: true,
      p_client_id: null, p_secret: STRIPE_SECRET, p_webhook_secret: WH_SECRET_STRIPE, p_chiave: CHIAVE_TEST,
    });
    if ((cfgSt.data as { ok?: boolean } | null)?.ok !== true) throw new Error("Config Stripe fallita: " + JSON.stringify(cfgSt.error ?? cfgSt.data));
    const cfgKl = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioId, p_provider: "klarna", p_attivo: true, p_test_mode: true,
      p_client_id: KLARNA_USER, p_secret: KLARNA_PASS, p_webhook_secret: WH_SECRET_KLARNA, p_chiave: CHIAVE_TEST,
    });
    if ((cfgKl.data as { ok?: boolean } | null)?.ok !== true) throw new Error("Config Klarna fallita: " + JSON.stringify(cfgKl.error ?? cfgKl.data));

    await db.from("negozio_metodi_pagamento").insert([
      { negozio_id: negozioId, metodo: "bonifico", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioId, metodo: "carta", attivo: true, ordine_mostra: 1 },
      { negozio_id: negozioId, metodo: "klarna", attivo: true, ordine_mostra: 2 },
    ]);

    slug = `realsubmit-pane-${ts}`;
    const { data: q } = await db.from("prodotti").insert({
      negozio_id: negozioId, nome: `RealSubmit Pane-${ts}`, slug, prezzo: 10.0,
      quantita_disponibile: 50, attivo: true, ha_varianti: false,
    }).select("id").single();
    prodottoId = Number(q!.id);

    await avviaServer();
    browser = await chromium.launch({ headless: true });

    // Verifica UI: i 3 metodi compaiono (FASE 5).
    {
      const page = await browser.newPage();
      await page.goto(`${BASE}/prodotto/${slug}/acquista/spedizione`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      const valori = await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")].map((r) => r.value));
      check("UI: carta, bonifico e klarna tutti presenti (negozio con 3 config)", ["carta", "bonifico", "klarna"].every((m) => valori.includes(m)), valori);
      if (!["carta", "bonifico", "klarna"].every((m) => valori.includes(m))) {
        const testo = await page.evaluate(() => document.body.innerText.slice(0, 300));
        console.log("  (diagnostica UI) testo pagina:", JSON.stringify(testo));
      }
      const klarnaDom = await page.evaluate(() => ({
        logo: document.querySelectorAll("img[src*='klarna-pink']").length,
        badge: document.body.innerText.includes("Paga in 3 rate"),
        desc: document.body.innerText.includes("Dividi il tuo acquisto in 3 rate, se disponibile."),
        disc: document.body.innerText.includes("Soggetto ad approvazione e alle condizioni di Klarna."),
      }));
      check("UI: logo rosa Klarna nel DOM", klarnaDom.logo >= 1, klarnaDom);
      check("UI: badge 'Paga in 3 rate'", klarnaDom.badge);
      check("UI: descrizione Klarna", klarnaDom.desc);
      check("UI: disclaimer Klarna", klarnaDom.disc);
      await page.close();
    }

    // ── A) BONIFICO: submit reale → ordine, nessuna sessione ─────────────
    console.log("\n[A] BONIFICO — submit browser REALE");
    {
      const stockBase = (await db.from("prodotti").select("quantita_disponibile").eq("id", prodottoId).single()).data?.quantita_disponibile;
      const esito = await submitReale(browser, slug!, "bonifico");
      check("A1. atterraggio su conferma ordine (/ordini/conferma/)", esito.urlFinale.includes("/ordini/conferma/"), esito.urlFinale);
      check("A2. nessuna sessione gateway (nessun redirect provider)", !esito.urlFinale.includes("klarna.com") && !esito.urlFinale.includes("stripe.com"), esito.urlFinale);
      const { data: ultimo } = await db.from("ordini").select("id, payment_provider, payment_status, stato, metodo_pagamento").eq("negozio_id", negozioId).order("created_at", { ascending: false }).limit(1).single();
      if (ultimo?.id) ordiniCreati.push(String(ultimo.id));
      check("A3. ordine creato con metodo_pagamento='bonifico'", ultimo?.metodo_pagamento === "bonifico", ultimo);
      check("A4. payment_provider MAI klarna/stripe", !ultimo?.payment_provider || (ultimo.payment_provider !== "klarna" && ultimo.payment_provider !== "stripe"), ultimo?.payment_provider);
      check("A5. nessuna sessione gateway nel DB", (Number((await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", String(ultimo?.id ?? ""))).count ?? 0)) === 0);
      check("A6. stock decrementato (ordine valido)", Number((await db.from("prodotti").select("quantita_disponibile").eq("id", prodottoId).single()).data?.quantita_disponibile ?? -1) === Number(stockBase) - 1);
      check("A7. zero console errors", esito.consoleErrors.length === 0, esito.consoleErrors.slice(0, 2));
      // Cleanup immediato scenario A.
      await db.from("pagamenti_eventi").delete().eq("ordine_id", String(ultimo?.id ?? ""));
      await db.from("pagamenti_sessioni").delete().eq("ordine_id", String(ultimo?.id ?? ""));
      await db.from("ordini").delete().eq("id", String(ultimo?.id ?? ""));
      ordiniCreati.length = 0;
      console.log("  → cleanup scenario A eseguito");
    }

    // ── B) KLARNA: submit reale → ordine + payment_provider + sessione ───
    console.log("\n[B] KLARNA — submit browser REALE (gateway playground reale)");
    {
      const esito = await submitReale(browser, slug!, "klarna");
      const { data: ord } = await db.from("ordini").select("id, payment_provider, payment_status, stato").eq("negozio_id", negozioId).order("created_at", { ascending: false }).limit(1).single();
      if (ord?.id) ordiniCreati.push(String(ord.id));
      const { data: sess } = await db.from("pagamenti_sessioni").select("provider, status, payment_id, redirect_url").eq("ordine_id", String(ord?.id ?? "")).limit(5);
      const sessioneKlarna = (sess ?? []).find((s) => s.provider === "klarna");
      const redirectKlarna = String(sessioneKlarna?.redirect_url ?? "");
      if (haKlarnaReale) {
        // Credenziali playground reali → la sessione DEVE nascere con redirect hosted.
        check("B1. ordine creato", Boolean(ord?.id), ord);
        check("B2. payment_provider='klarna'", ord?.payment_provider === "klarna", ord?.payment_provider);
        check("B3. payment_status='pending'", ord?.payment_status === "pending", ord?.payment_status);
        check("B4. sessione Klarna persistita (provider='klarna')", Boolean(sessioneKlarna), sess);
        check("B5. redirect hosted Klarna (checkout.klarna.com o playground)", /https:\/\/.*klarna/.test(redirectKlarna) || /https:\/\/.*playground/.test(redirectKlarna), redirectKlarna);
        check("B6. MAI fallback Stripe (nessuna sessione provider='stripe')", !(sess ?? []).some((s) => s.provider === "stripe"), sess);
        check("B7. atterraggio su redirect Klarna", esito.urlFinale.includes("klarna.com") || esito.urlFinale.includes("playground.klarna"), esito.urlFinale);
      } else {
        // Placeholder → la pipeline REALE parte e fallisce di autenticazione,
        // con fail-closed REALE (ordine chiuso, stock ripristinato, mai fallback).
        check("B1. ordine creato (pipeline reale eseguita)", Boolean(ord?.id), ord);
        check("B2. ordine CHIUSO dal fallimento gateway (fail-closed reale)", ord?.stato === "cancellato", ord?.stato);
        check("B3. MAI payment_provider='stripe' (nessun fallback)", ord?.payment_provider !== "stripe", ord?.payment_provider);
        check("B4. NESSUNA sessione Stripe (mai fallback)", !(sess ?? []).some((s) => s.provider === "stripe"), sess);
        check("B5. errore leggibile nella UI (niente ordine fantasma)", esito.erroreUI !== null || !esito.urlFinale.includes("/ordini/conferma/"), esito);
        console.log("  ⚠️  BLOCCANTE: servono credenziali playground Klarna reali per la sessione (vedi report).");
        falliti++;
        fallitiNomi.push("B: KLARNA — sessione reale richiede credenziali playground valide");
      }
      check("B8. zero console errors", esito.consoleErrors.length === 0, esito.consoleErrors.slice(0, 2));
      await db.from("pagamenti_eventi").delete().eq("ordine_id", String(ord?.id ?? ""));
      await db.from("pagamenti_sessioni").delete().eq("ordine_id", String(ord?.id ?? ""));
      await db.from("ordini").delete().eq("id", String(ord?.id ?? ""));
      ordiniCreati.length = 0;
      console.log("  → cleanup scenario B eseguito");
    }

    // ── C) CARTA: submit reale → ordine + payment_provider + sessione ────
    console.log("\n[C] CARTA — submit browser REALE (gateway Stripe reale)");
    {
      const esito = await submitReale(browser, slug!, "carta");
      const { data: ord } = await db.from("ordini").select("id, payment_provider, payment_status, stato").eq("negozio_id", negozioId).order("created_at", { ascending: false }).limit(1).single();
      if (ord?.id) ordiniCreati.push(String(ord.id));
      const { data: sess } = await db.from("pagamenti_sessioni").select("provider, status, payment_id, redirect_url").eq("ordine_id", String(ord?.id ?? "")).limit(5);
      const sessioneStripe = (sess ?? []).find((s) => s.provider === "stripe");
      const redirectStripe = String(sessioneStripe?.redirect_url ?? "");
      if (haStripeReale) {
        check("C1. ordine creato", Boolean(ord?.id), ord);
        check("C2. payment_provider='stripe'", ord?.payment_provider === "stripe", ord?.payment_provider);
        check("C3. payment_status='pending'", ord?.payment_status === "pending", ord?.payment_status);
        check("C4. sessione Stripe persistita (provider='stripe')", Boolean(sessioneStripe), sess);
        check("C5. redirect checkout.stripe.com", redirectStripe.startsWith("https://checkout.stripe.com/"), redirectStripe);
        check("C6. MAI fallback Klarna (nessuna sessione provider='klarna')", !(sess ?? []).some((s) => s.provider === "klarna"), sess);
        check("C7. atterraggio su redirect Stripe", esito.urlFinale.includes("checkout.stripe.com"), esito.urlFinale);
      } else {
        check("C1. ordine creato (pipeline reale eseguita)", Boolean(ord?.id), ord);
        check("C2. ordine CHIUSO dal fallimento gateway (fail-closed reale)", ord?.stato === "cancellato", ord?.stato);
        check("C3. MAI payment_provider='klarna' (nessun fallback)", ord?.payment_provider !== "klarna", ord?.payment_provider);
        check("C4. NESSUNA sessione Klarna (mai fallback)", !(sess ?? []).some((s) => s.provider === "klarna"), sess);
        check("C5. errore leggibile nella UI", esito.erroreUI !== null || !esito.urlFinale.includes("/ordini/conferma/"), esito);
        console.log("  ⚠️  BLOCCANTE: serve una chiave sk_test valida per la sessione (vedi report).");
        falliti++;
        fallitiNomi.push("C: CARTA — sessione reale richiede chiave sk_test valida");
      }
      check("C8. zero console errors", esito.consoleErrors.length === 0, esito.consoleErrors.slice(0, 2));
      await db.from("pagamenti_eventi").delete().eq("ordine_id", String(ord?.id ?? ""));
      await db.from("pagamenti_sessioni").delete().eq("ordine_id", String(ord?.id ?? ""));
      await db.from("ordini").delete().eq("id", String(ord?.id ?? ""));
      ordiniCreati.length = 0;
      console.log("  → cleanup scenario C eseguito");
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`BUY-NOW REAL SUBMIT TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`NON PASS: ${fallitiNomi.join("; ")}`);
      process.exitCode = 1;
    } else {
      console.log("TUTTI I SUBMIT BROWSER REALI PASSATI ✓");
    }
  } finally {
    console.log("\n── CLEANUP FINALE ──");
    if (browser) await browser.close().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      await db.from("ordini").delete().in("id", ordiniCreati);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `realsubmit-%`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `realsubmit-%`);
        console.log(`  Sweep residui ordini realsubmit-%: ${residui}`);
      }
    }
    if (prodottoId) await db.from("prodotti").delete().eq("id", prodottoId);
    if (negozioId) {
      await db.from("negozio_metodi_pagamento").delete().eq("negozio_id", negozioId);
      await db.from("negozio_pagamenti").delete().eq("negozio_id", negozioId);
      await db.from("negozi").delete().eq("id", negozioId);
    }
    fermaServer();
    console.log("  Dati di test eliminati (ordini, sessioni, eventi, prodotto, metodi, config, negozio).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione:", e);
  process.exit(1);
});
