/**
 * TEST BROWSER — UNIFICAZIONE METODI PAGAMENTO CHECKOUT / BUY-NOW.
 *
 * Verifica che /checkout mostri la STESSA disponibilità reale del buy-now
 * (fonte comune getMetodiPagamentoPubblici):
 *   T1  negozio SENZA gateway → solo BONIFICO (carta/klarna assenti);
 *   T2  negozio con carta+bonifico → carta + bonifico (klarna assente);
 *   T3  buy-now sullo stesso negozio senza gateway → solo BONIFICO (parità);
 *   T4  negozio con paypal+bonifico → paypal + bonifico (carta/klarna assenti);
 *   T5  buy-now sullo stesso negozio paypal+bonifico → paypal + bonifico (parità).
 *
 * Nessun submit: zero ordini, zero POST d'ordine. Solo lettura del DOM.
 * Uso: npx tsx scripts/test-checkout-metodi-browser.ts
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

const CHIAVE_TEST = "chiave-checkout-metodi-browser-0001";
const WH_SECRET_STRIPE = "whsec_stripe_metodi_browser";
const STRIPE_SECRET = "sk_test_PLACEHOLDER_NON_VALIDA";
// PayPal: clientId+secret (OAuth2) + webhook id (verifica firma).
const PAYPAL_CLIENT_ID = "AfPaypalClientIdTest";
const PAYPAL_SECRET = "EPaypalSecretTest";
const PAYPAL_WEBHOOK_ID = "webhook_id_paypal_test";

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
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

const PORTA = Number(process.env.CHECKOUT_METODI_PORT ?? 3191);
const BASE = `http://127.0.0.1:${PORTA}`;
let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "checkout-metodi-browser-next-dev.log"), { flags: "w" });
  server = spawn(`npx next dev -p ${PORTA} --webpack`, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST,
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
    if (server.exitCode !== null) throw new Error("Server dev terminato. Vedi " + join(tmpdir(), "checkout-metodi-browser-next-dev.log"));
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini/carrello/metodi`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ negozi: [] }),
      });
      if (res.status === 200) return console.log(`\nServer dev pronto su ${BASE}.\n`);
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

async function apriCheckout(browser: Browser, riga: Record<string, unknown>): Promise<Page> {
  const page = await browser.newPage();
  const righe = [{ varianteId: null, quantita: 1, immagine: null, variante: null, ...riga }];
  await page.addInitScript(
    ({ key, valore }) => localStorage.setItem(key, JSON.stringify(valore)),
    { key: "localhub.carrello.v1", valore: { versione: 1, righe } }
  );
  await page.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000); // idratazione + fetch disponibilità
  return page;
}

async function testiSezione(page: Page): Promise<{ testo: string; carta: boolean; klarna: boolean; bonifico: boolean; paypal: boolean }> {
  const testo = await page.evaluate(() => document.body.innerText);
  return {
    testo,
    carta: testo.includes("Carta di credito/debito"),
    klarna: testo.includes("Paga in 3 rate"),
    bonifico: testo.includes("Bonifico bancario"),
    paypal: testo.includes("PayPal"),
  };
}

async function main() {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_TEST;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const ts = Date.now();

  let negozioZ: string | null = null; // zero gateway
  let negozioC: string | null = null; // carta + bonifico
  let negozioP: string | null = null; // paypal + bonifico
  const slugZ = `metodi-z-${ts}`;
  const slugC = `metodi-c-${ts}`;
  const slugP = `metodi-p-${ts}`;
  let browser: Browser | null = null;

  try {
    console.log("\n[SETUP] negozio Z (zero gateway) + negozio C (carta+bonifico) + negozio P (paypal+bonifico)");
    const { data: nZ } = await db.from("negozi").insert({ nome: `MetodiZ-${ts}`, slug: slugZ, attivo: true, is_demo: true }).select("id").single();
    negozioZ = String(nZ!.id);
    const { data: nC } = await db.from("negozi").insert({ nome: `MetodiC-${ts}`, slug: slugC, attivo: true, is_demo: true }).select("id").single();
    negozioC = String(nC!.id);
    const { data: nP } = await db.from("negozi").insert({ nome: `MetodiP-${ts}`, slug: slugP, attivo: true, is_demo: true }).select("id").single();
    negozioP = String(nP!.id);

    // Negozio C: bonifico (iban) + carta (stripe placeholder) + righe metodi attive.
    await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioC, p_provider: "bonifico", p_attivo: true, p_test_mode: true,
      p_payee_email: "banca@negozio.test", p_iban: "IT60X0542811101000000123456", p_chiave: CHIAVE_TEST,
    });
    await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioC, p_provider: "stripe", p_attivo: true, p_test_mode: true,
      p_client_id: null, p_secret: STRIPE_SECRET, p_webhook_secret: WH_SECRET_STRIPE, p_chiave: CHIAVE_TEST,
    });
    await db.from("negozio_metodi_pagamento").insert([
      { negozio_id: negozioC, metodo: "carta", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioC, metodo: "bonifico", attivo: true, ordine_mostra: 1 },
    ]);

    // Negozio P: bonifico (iban) + paypal (OAuth2 + webhook id) + righe metodi attive.
    await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioP, p_provider: "bonifico", p_attivo: true, p_test_mode: true,
      p_payee_email: "banca@negozio.test", p_iban: "IT60X0542811101000000123456", p_chiave: CHIAVE_TEST,
    });
    await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioP, p_provider: "paypal", p_attivo: true, p_test_mode: true,
      p_client_id: PAYPAL_CLIENT_ID, p_secret: PAYPAL_SECRET, p_webhook_secret: PAYPAL_WEBHOOK_ID, p_chiave: CHIAVE_TEST,
    });
    await db.from("negozio_metodi_pagamento").insert([
      { negozio_id: negozioP, metodo: "paypal", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioP, metodo: "bonifico", attivo: true, ordine_mostra: 1 },
    ]);

    const { data: pZ } = await db.from("prodotti").insert({ negozio_id: negozioZ, nome: `MetodiZ-${ts}`, slug: slugZ, prezzo: 10, quantita_disponibile: 20, attivo: true, ha_varianti: false }).select("id").single();
    const { data: pC } = await db.from("prodotti").insert({ negozio_id: negozioC, nome: `MetodiC-${ts}`, slug: slugC, prezzo: 15, quantita_disponibile: 20, attivo: true, ha_varianti: false }).select("id").single();
    const { data: pP } = await db.from("prodotti").insert({ negozio_id: negozioP, nome: `MetodiP-${ts}`, slug: slugP, prezzo: 18, quantita_disponibile: 20, attivo: true, ha_varianti: false }).select("id").single();

    await avviaServer();
    browser = await chromium.launch({ headless: true });

    // ── T1: checkout su negozio SENZA gateway → solo bonifico ─────────────
    console.log("\n[T1] /checkout — negozio senza gateway: solo BONIFICO");
    {
      const page = await apriCheckout(browser, {
        prodottoId: String(pZ!.id), negozioId: negozioZ!, negozioNome: "MetodiZ", nome: "ProdottoZ", prezzo: 10, slug: slugZ,
      });
      const r = await testiSezione(page);
      check("1a. BONIFICO visibile", r.bonifico);
      check("1b. CARTA assente", !r.carta);
      check("1c. KLARNA assente", !r.klarna);
      await page.close();
    }

    // ── T2: checkout su negozio con carta+bonifico → carta+bonifico ───────
    console.log("\n[T2] /checkout — negozio con carta+bonifico: carta + bonifico (no klarna)");
    {
      const page = await apriCheckout(browser, {
        prodottoId: String(pC!.id), negozioId: negozioC!, negozioNome: "MetodiC", nome: "ProdottoC", prezzo: 15, slug: slugC,
      });
      const r = await testiSezione(page);
      check("2a. BONIFICO visibile", r.bonifico);
      check("2b. CARTA visibile", r.carta);
      check("2c. KLARNA assente", !r.klarna);
      await page.close();
    }

    // ── T3: buy-now sullo stesso negozio senza gateway → solo bonifico ────
    console.log("\n[T3] Buy-Now — stesso negozio senza gateway: solo BONIFICO (parità)");
    {
      const page = await browser.newPage();
      await page.goto(`${BASE}/prodotto/${slugZ}/acquista/spedizione`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      const radios = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")].map((r) => r.value)
      );
      check("3a. unico radio = bonifico", radios.length === 1 && radios[0] === "bonifico", radios);
      await page.close();
    }

    // ── T4: checkout su negozio con paypal+bonifico → paypal+bonifico ─────
    console.log("\n[T4] /checkout — negozio con paypal+bonifico: paypal + bonifico (no carta/klarna)");
    {
      const page = await apriCheckout(browser, {
        prodottoId: String(pP!.id), negozioId: negozioP!, negozioNome: "MetodiP", nome: "ProdottoP", prezzo: 18, slug: slugP,
      });
      const r = await testiSezione(page);
      check("4a. BONIFICO visibile", r.bonifico);
      check("4b. PAYPAL visibile", r.paypal);
      check("4c. CARTA assente", !r.carta);
      check("4d. KLARNA assente", !r.klarna);
      await page.close();
    }

    // ── T5: buy-now sullo stesso negozio paypal+bonifico → parità ─────────
    console.log("\n[T5] Buy-Now — stesso negozio paypal+bonifico: paypal + bonifico (parità)");
    {
      const page = await browser.newPage();
      await page.goto(`${BASE}/prodotto/${slugP}/acquista/spedizione`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      const radios = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")].map((r) => r.value)
      );
      check("5a. radio = [paypal, bonifico]", radios.length === 2 && radios.includes("paypal") && radios.includes("bonifico"), radios);
      check("5b. nessun metodo preselezionato", await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")].every((r) => !r.checked)));
      await page.close();
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`CHECKOUT/BUY-NOW METODI BROWSER: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) process.exitCode = 1;
    else console.log("TUTTI I TEST PASSATI ✓ — stessa disponibilità checkout/buy-now");
  } finally {
    console.log("\n── CLEANUP ──");
    if (browser) await browser.close().catch(() => {});
    for (const id of [negozioZ, negozioC, negozioP]) {
      if (!id) continue;
      const { data: ordini } = await db.from("ordini").select("id").eq("negozio_id", id);
      const ids = (ordini ?? []).map((o: any) => String(o.id));
      if (ids.length > 0) {
        await db.from("pagamenti_eventi").delete().in("ordine_id", ids);
        await db.from("pagamenti_sessioni").delete().in("ordine_id", ids);
        await db.from("ordini").delete().in("id", ids);
      }
      await db.from("prodotti").delete().eq("negozio_id", id);
      await db.from("negozio_metodi_pagamento").delete().eq("negozio_id", id);
      await db.from("negozio_pagamenti").delete().eq("negozio_id", id);
      await db.from("negozi").delete().eq("id", id);
    }
    fermaServer();
    console.log("  Dati di test eliminati.");
  }
}

main().catch((e) => {
  console.error("Errore:", e);
  process.exit(1);
});
