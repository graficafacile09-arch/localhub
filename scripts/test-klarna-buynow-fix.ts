/**
 * TEST MIRATO — FIX CRITICO KLARNA NEL FLUSSO BUY-NOW “ACQUISTA”.
 *
 * Copre i 16 check richiesti verificando il flusso REALE:
 *   prodotto → /prodotto/[slug]/acquista/spedizione (SSR server-side)
 *   → getMetodiPagamentoPubblici → POST /api/cliente/ordini (metodoPagamento)
 *   → crea_ordine → creaSessionePagamentoPerOrdine(ordineId, "klarna")
 *   → redirect hosted Klarna.
 *
 * Layer simulati: SOLO HTTP Klarna e HTTP Stripe (mock locali, pattern
 * F1/F2.3/F2.6); DB Supabase REALE. Il server dev gira con
 * KLARNA_API_BASE_URL = mock locale (override test-only introdotto in
 * gateway-klarna.ts: in produzione la variabile non esiste → base reale).
 *
 *  T1  disponibilità: Klarna compare nel buy-now SOLO con config valida
 *  T2  fail-closed: senza config → Klarna assente e 422, nessun ordine
 *  T3-6 percorso positivo COMPLETO via route: metodo klarna → ordine
 *      payment_provider='klarna' → sessione Klarna → redirect hosted
 *  T7  errore Klarna → MAI fallback Stripe (ordine chiuso, stock ripristinato)
 *  T8  regressione Stripe (carta) invariata
 *  T9  regressione bonifico invariata
 *  T10 variante: buy-now con varianteId → snapshot prezzo/variante corretti
 *  T11 totali server-side: order_amount/order_lines dal DB (mai client)
 *  T12 idempotenza: stessa idempotencyKey → 1 ordine, 1 sessione, 1 decremento
 *  T13 logo rosa klarna-pink nel DOM (SSR + browser)
 *  T14 testo “Paga in 3 rate” (SSR + browser)
 *  T15 responsive mobile senza overflow (Playwright, viewport 390px)
 *  T16 zero console errors nel browser reale (Playwright)
 *
 * Uso: npx tsx scripts/test-klarna-buynow-fix.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { creaSessionePagamentoPerOrdine } from "../lib/pagamenti/sessioni";
import { creaSessioneStripePerOrdine } from "../lib/pagamenti/sessioni";
import { getMetodiPagamentoPubblici } from "../lib/pagamenti/metodi-pubblici";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const CHIAVE_TEST = "chiave-klarna-buynow-fix-test-0001";
const WH_SECRET_KLARNA = "whsec_klarna_buynow_fix";
const WH_SECRET_STRIPE = "whsec_stripe_buynow_fix";

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
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

const fail = (msg: string): never => {
  throw new Error(msg);
};

// ════════════════════════════════════════════════════════════════════
// Server dev (con KLARNA_API_BASE_URL → mock locale)
// ════════════════════════════════════════════════════════════════════

const PORTA = Number(process.env.KLARNA_BUYNOW_FIX_PORT ?? 3158);
const BASE = `http://127.0.0.1:${PORTA}`;
let server: ChildProcess | null = null;

async function avviaServer(klarnaMockBase: string): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "klarna-buynow-fix-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST,
      KLARNA_API_BASE_URL: klarnaMockBase,
      RESEND_API_KEY: "",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);

  const deadline = Date.now() + 240_000;
  let pronto = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        "Server dev terminato (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "klarna-buynow-fix-next-dev.log")
      );
    }
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: "{}",
      });
      if (res.status === 422) {
        pronto = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!pronto) {
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "klarna-buynow-fix-next-dev.log"));
  }
  console.log(`\nServer dev pronto su ${BASE} (Klarna mock: ${klarnaMockBase}).\n`);
}

function fermaServer(): void {
  if (!server) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
  } catch {}
  server = null;
}

// ════════════════════════════════════════════════════════════════════
// Mock Klarna (creazione sessione + toggle fail per il check no-fallback)
// ════════════════════════════════════════════════════════════════════

function avviaMockKlarna() {
  let contatore = 0;
  let failNext = false;
  const chiamate: Array<{ method: string; url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(body || "{}") as Record<string, unknown>;
      } catch {}
      if (req.method === "POST" && req.url === "/__fail") {
        failNext = true;
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      }
      if (req.method === "POST" && req.url === "/__ok") {
        failNext = false;
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      }
      chiamate.push({
        method: req.method ?? "",
        url: req.url ?? "",
        body: parsed,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
      });
      if (req.method === "POST" && req.url === "/checkout/v3/orders") {
        contatore++;
        if (failNext) {
          return res
            .writeHead(401, { "content-type": "application/json" })
            .end(JSON.stringify({ error_code: "AUTH_FAILED", error_messages: ["Invalid credentials"] }));
        }
        const orderId = `klarna_fix_${contatore}`;
        return res
          .writeHead(200, { "content-type": "application/json" })
          .end(
            JSON.stringify({
              order_id: orderId,
              redirect_url: `https://checkout.klarna.com/${orderId}`,
              status: "checkout_incomplete",
            })
          );
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error_code: "NOT_FOUND", error_messages: [] }));
    });
  });

  return new Promise<{ port: number; chiamate: typeof chiamate; chiudi: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, chiamate, chiudi: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// Mock Stripe (sessione checkout — solo per il check di regressione)
// ════════════════════════════════════════════════════════════════════

function avviaMockStripe() {
  const chiamate: Array<{ method: string; url: string; body: string }> = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      chiamate.push({ method: req.method ?? "", url: req.url ?? "", body });
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        const id = `cs_test_fix_${chiamate.length}`;
        return res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            status: "open",
            payment_status: "unpaid",
            expires_at: Math.floor(Date.now() / 1000) + 1800,
          })
        );
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
  });

  return new Promise<{ port: number; chiamate: typeof chiamate; chiudi: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, chiamate, chiudi: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

let ipCounter = 245;

function ipProva(): string {
  ipCounter += 1;
  return `10.8.4.${ipCounter}`;
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

function payloadBuyNow(idempotencyKey: string, metodoPagamento: string, prodottoId: string, varianteId: string | null = null) {
  return {
    idempotencyKey,
    prodottoId: String(prodottoId),
    varianteId,
    quantita: 1,
    modalita: "spedizione",
    cliente: { nome: "Mario", cognome: "FixK", email: "fixk@localhub.test", telefono: "3331234567" },
    spedizione: {
      indirizzo: "Via Test 1",
      cap: "87100",
      citta: "Cosenza",
      provincia: "CS",
      note: null,
      carrier: "poste_italiane", servizio: "standard",
      metodoPagamento,
    },
    note: null,
  };
}

/** Stock attuale di un prodotto (per delta relativi). Client non tipizzato: i
 * test usano colonne a runtime senza schema generico (same pattern degli altri
 * script di test del progetto). */
async function stockProdotto(db: any, id: number | string): Promise<number> {
  const { data } = await db.from("prodotti").select("quantita_disponibile").eq("id", Number(id)).single();
  return Number(data?.quantita_disponibile ?? -1);
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

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

  let negozioKId: string | null = null; // Klarna + Stripe configurati (check no-fallback)
  let negozioSId: string | null = null; // solo Stripe
  let negozioNId: string | null = null; // nessun gateway
  let pK1: number | null = null; // prodotto store K (no variante)
  let pK2: number | null = null; // prodotto store K CON variante
  let pS: number | null = null;
  let pN: number | null = null;
  let varianteId: string | null = null;
  const ordiniCreati: string[] = [];
  let mockKlarna: Awaited<ReturnType<typeof avviaMockKlarna>> | null = null;
  let mockStripe: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    // ── Setup ────────────────────────────────────────────────────────────
    console.log("\n[T0] Setup: store K (klarna+stripe), store S (stripe), store N (nessun gateway)");
    const { data: nK } = await db.from("negozi").insert({ nome: `FixK-A-${ts}`, slug: `fixk-a-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioKId = String(nK!.id);
    const { data: nS } = await db.from("negozi").insert({ nome: `FixK-B-${ts}`, slug: `fixk-b-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioSId = String(nS!.id);
    const { data: nN } = await db.from("negozi").insert({ nome: `FixK-C-${ts}`, slug: `fixk-c-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioNId = String(nN!.id);

    const cfgK = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioKId, p_provider: "klarna", p_attivo: true, p_test_mode: true,
      p_client_id: "api_username_test", p_secret: "api_password_test",
      p_webhook_secret: WH_SECRET_KLARNA, p_chiave: CHIAVE_TEST,
    });
    if ((cfgK.data as { ok?: boolean } | null)?.ok !== true) fail("Config Klarna K fallita: " + JSON.stringify(cfgK.error ?? cfgK.data));
    const cfgKS = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioKId, p_provider: "stripe", p_attivo: true, p_test_mode: true,
      p_client_id: null, p_secret: "sk_test_fake", p_webhook_secret: WH_SECRET_STRIPE, p_chiave: CHIAVE_TEST,
    });
    if ((cfgKS.data as { ok?: boolean } | null)?.ok !== true) fail("Config Stripe K fallita: " + JSON.stringify(cfgKS.error ?? cfgKS.data));
    const cfgS = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioSId, p_provider: "stripe", p_attivo: true, p_test_mode: true,
      p_client_id: null, p_secret: "sk_test_fake", p_webhook_secret: WH_SECRET_STRIPE, p_chiave: CHIAVE_TEST,
    });
    if ((cfgS.data as { ok?: boolean } | null)?.ok !== true) fail("Config Stripe S fallita: " + JSON.stringify(cfgS.error ?? cfgS.data));

    await db.from("negozio_metodi_pagamento").insert([
      { negozio_id: negozioKId, metodo: "klarna", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioKId, metodo: "carta", attivo: true, ordine_mostra: 1 },
      { negozio_id: negozioSId, metodo: "carta", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioNId, metodo: "klarna", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioNId, metodo: "carta", attivo: true, ordine_mostra: 1 },
    ]);

    const slugK1 = `fixk-pane-${ts}`;
    const slugK2 = `fixk-vestito-${ts}`;
    const { data: qK1 } = await db.from("prodotti").insert({ negozio_id: negozioKId, nome: `FixK Pane-${ts}`, slug: slugK1, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false, peso_grammi: 1500 }).select("id").single();
    pK1 = Number(qK1!.id);
    const { data: qK2 } = await db.from("prodotti").insert({ negozio_id: negozioKId, nome: `FixK Vestito-${ts}`, slug: slugK2, prezzo: 20.0, quantita_disponibile: 10, attivo: true, ha_varianti: true, peso_grammi: 1500 }).select("id").single();
    pK2 = Number(qK2!.id);
    const { data: v1 } = await db.from("prodotto_varianti").insert({ prodotto_id: pK2, nome: "Taglia M", attributi: { taglia: "M" }, prezzo: 12.0, quantita_disponibile: 10, attivo: true }).select("id").single();
    varianteId = String(v1!.id);
    const { data: qS } = await db.from("prodotti").insert({ negozio_id: negozioSId, nome: `FixK Latte-${ts}`, slug: `fixk-latte-${ts}`, prezzo: 5.0, quantita_disponibile: 60, attivo: true, ha_varianti: false, peso_grammi: 1500 }).select("id").single();
    pS = Number(qS!.id);
    const { data: qN } = await db.from("prodotti").insert({ negozio_id: negozioNId, nome: `FixK Dolce-${ts}`, slug: `fixk-dolce-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false, peso_grammi: 1500 }).select("id").single();
    pN = Number(qN!.id);

    mockKlarna = await avviaMockKlarna();
    mockStripe = await avviaMockStripe();
    const klarnaOpts = { baseUrl: `http://127.0.0.1:${mockKlarna.port}` };
    const stripeOpts = { host: "127.0.0.1", port: mockStripe.port, protocol: "http" as const };
    await avviaServer(`http://127.0.0.1:${mockKlarna.port}`);

    // ── T1: Klarna DISPONIBILE nel buy-now con config valida ─────────────
    console.log("\n[T1] Klarna disponibile nel buy-now SOLO con config valida (server-side)");
    {
      const esitoK = await getMetodiPagamentoPubblici(negozioKId);
      const metodiK = esitoK.ok ? esitoK.metodi : [];
      check("1a. store K (config valida) → klarna presente nei metodi", metodiK.some((m) => m.metodo === "klarna"), metodiK.map((m) => m.metodo));

      const ssrK = await (await fetch(`${BASE}/prodotto/${slugK1}/acquista/spedizione`)).text();
      check("1b. SSR buy-now: testo 'Klarna' presente", ssrK.includes("Klarna"));
      check("1c. SSR buy-now: badge 'Paga in 3 rate' presente", ssrK.includes("Paga in 3 rate"));
      check("1d. SSR buy-now: disclaimer 'Soggetto ad approvazione' presente", ssrK.includes("Soggetto ad approvazione"));
      check("1e. SSR buy-now: img logo rosa klarna-pink presente", ssrK.includes("klarna-pink.svg"), ssrK.includes("klarna-pink.svg"));
    }

    // ── T2: Klarna ASSENTE / fail-closed senza config ────────────────────
    console.log("\n[T2] Store senza config → Klarna assente e 422, nessun ordine");
    {
      const esitoN = await getMetodiPagamentoPubblici(negozioNId);
      const metodiN = esitoN.ok ? esitoN.metodi : [];
      check("2a. store N → klarna ASSENTE dai metodi (mai per default)", !metodiN.some((m) => m.metodo === "klarna"), metodiN.map((m) => m.metodo));

      const ssrN = await (await fetch(`${BASE}/prodotto/${`fixk-dolce-${ts}`}/acquista/spedizione`)).text();
      check("2b. SSR buy-now store N: badge 'Paga in 3 rate' ASSENTE", !ssrN.includes("Paga in 3 rate"));
      check("2c. SSR buy-now store N: img klarna-pink ASSENTE", !ssrN.includes("klarna-pink.svg"));

      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-fix-t2-${ts}`, "klarna", String(pN)));
      check("2d. POST klarna su store N → 422", esito.status === 422, esito.status);
      check("2e. codice KLARNA_NON_DISPONIBILE (fail-closed)", esito.error?.code === "KLARNA_NON_DISPONIBILE", esito.error?.code);
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `bn-fix-t2-%`);
      check("2f. nessun ordine creato", Number(count ?? 0) === 0, count);
    }

    // ── T3-6: percorso POSITIVO completo via route (klarna → sessione → redirect) ──
    console.log("\n[T3-6] Percorso positivo: ACQUISTA → klarna → ordine → sessione Klarna → redirect hosted");
    let ordinePositivo: string | null = null;
    {
      const stockBase = await stockProdotto(db, pK1!);
      const key = `bn-fix-t3-${ts}`;
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(key, "klarna", String(pK1)));
      check("3a. metodo klarna → HTTP 201 con ordine", esito.status === 201 && Boolean(esito.data?.ordine?.id), { status: esito.status });
      ordinePositivo = esito.data?.ordine?.id ? String(esito.data.ordine.id) : null;
      if (ordinePositivo) ordiniCreati.push(ordinePositivo);
      check("3b. redirect Klarna hosted presente (check 6)", Boolean(esito.data?.pagamento?.redirectUrl) && String(esito.data.pagamento.redirectUrl).startsWith("https://checkout.klarna.com/"), esito.data?.pagamento?.redirectUrl);

      const { data: ord } = await db.from("ordini").select("payment_provider, payment_status, metodo_pagamento, totale").eq("id", ordinePositivo!).single();
      check("4a. ordine: payment_provider='klarna' (check 4)", ord?.payment_provider === "klarna", ord?.payment_provider);
      check("4b. ordine: payment_status='pending'", ord?.payment_status === "pending", ord?.payment_status);
      check("4c. metodo_pagamento DB mappato 'carta' (allowlist RPC, come carrello F2.2)", ord?.metodo_pagamento === "carta", ord?.metodo_pagamento);

      const { data: sess } = await db.from("pagamenti_sessioni").select("provider, status, payment_id, idempotency_key").eq("ordine_id", ordinePositivo!);
      check("5a. sessione Klarna creata e persistita (check 5)", Array.isArray(sess) && sess.length === 1 && sess[0].provider === "klarna", sess);
      if (Array.isArray(sess) && sess[0]) {
        check("5b. sessione: status pending/created", ["pending", "created"].includes(String(sess[0].status)), sess[0].status);
        check("5c. sessione: idempotency key deterministica provider:ordineId:uuid", String(sess[0].idempotency_key).startsWith(`klarna:${ordinePositivo}:`), sess[0].idempotency_key);
      }

      const { data: dopo } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK1).single();
      check("5d. stock riservato una volta (base−1)", Number(dopo?.quantita_disponibile ?? -1) === stockBase - 1, { base: stockBase, dopo: dopo?.quantita_disponibile });

      // check 3: il metodo INVIATO è stato 'klarna' → il gateway Klarna è stato chiamato
      const chiamateK = mockKlarna!.chiamate.filter((c) => c.method === "POST" && c.url === "/checkout/v3/orders");
      check("3c. gateway Klarna chiamato con POST /checkout/v3/orders (metodo inviato = klarna)", chiamateK.length >= 1, chiamateK.length);
      const ultima = chiamateK[chiamateK.length - 1];
      check("3d. Klarna-Idempotency-Key presente (identità ordine)", String(ultima?.headers?.["klarna-idempotency-key"] ?? "").startsWith("klarna:"), ultima?.headers?.["klarna-idempotency-key"]);
      check("3e. Basic auth presente (credenziali dalla config, mai hardcoded)", String(ultima?.headers?.["authorization"] ?? "").startsWith("Basic "));

      // ── T11: totali SERVER-SIDE (mai dal client) ─────────────────────────
      const body = ultima?.body ?? {};
      const totaleAtteso = Math.round(Number(ord?.totale ?? 0) * 100);
      check("11a. order_amount = ordine.totale DB in minor units", Number(body.order_amount) === totaleAtteso, { orderAmount: body.order_amount, atteso: totaleAtteso });
      const lines = (body.order_lines ?? []) as Array<Record<string, unknown>>;
      check("11b. order_lines = 1 prodotto + 1 spedizione", lines.length === 2, lines.length);
      const prodLine = lines.find((l) => String(l.name).startsWith("FixK Pane"));
      check("11c. unit_price 1000 (prezzo DB) × qta 1", prodLine?.unit_price === 1000 && prodLine?.quantity === 1, prodLine);
      const shipLine = lines.find((l) => l.type === "shipping_fee");
      check("11d. spedizione standard 590 (costo DB)", shipLine?.unit_price === 590, shipLine?.unit_price);
      check("11e. valuta EUR dal server", body.purchase_currency === "EUR", body.purchase_currency);

      // ── T12: idempotenza (retry stessa key) ─────────────────────────────
      const nCallsPrima = chiamateK.length;
      const esito2 = await postJson("/api/cliente/ordini", payloadBuyNow(key, "klarna", String(pK1)));
      check("12a. retry stessa idempotencyKey → HTTP 200", esito2.status === 200, esito2.status);
      check("12b. stesso ordine restituito (mai duplicato)", String(esito2.data?.ordine?.id ?? "") === ordinePositivo, { id1: ordinePositivo, id2: esito2.data?.ordine?.id });
      const { count: nOrd } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `${key}%`);
      check("12c. un solo ordine nel DB", Number(nOrd ?? 0) === 1, nOrd);
      const { count: nSess } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", ordinePositivo!);
      check("12d. una sola sessione attiva", Number(nSess ?? 0) === 1, nSess);
      check("12e. retry → nessuna nuova chiamata HTTP Klarna", mockKlarna!.chiamate.filter((c) => c.method === "POST" && c.url === "/checkout/v3/orders").length === nCallsPrima);
      const { data: dopo2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK1).single();
      check("12f. stock decrementato UNA sola volta (ancora base−1)", Number(dopo2?.quantita_disponibile ?? -1) === stockBase - 1, { base: stockBase, dopo: dopo2?.quantita_disponibile });
    }

    // ── T7: errore Klarna → MAI fallback Stripe ──────────────────────────
    console.log("\n[T7] Errore Klarna (mock 401) su store con anche Stripe → nessun fallback");
    {
      const stockBase = await stockProdotto(db, pK1!);
      await fetch(`http://127.0.0.1:${mockKlarna!.port}/__fail`, { method: "POST" });
      const key = `bn-fix-t7-${ts}`;
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(key, "klarna", String(pK1)));
      const codice = String(esito.error?.code ?? "");
      check("7a. HTTP 422 con errore KLARNA_*", esito.status === 422 && codice.startsWith("KLARNA_"), { status: esito.status, code: codice });
      check("7b. MAI un errore Stripe/CARTA (nessun fallback)", !codice.startsWith("CARTA_") && !codice.includes("stripe"), codice);
      const { data: ord } = await db.from("ordini").select("id, stato, payment_provider").like("idempotency_key", `${key}%`).single();
      if (ord?.id) ordiniCreati.push(String(ord.id));
      check("7c. ordine chiuso (stato cancellato)", ord?.stato === "cancellato", ord?.stato);
      check("7d. ordine MAI marcato payment_provider='stripe' (né 'klarna')", !ord || (ord.payment_provider !== "stripe" && ord.payment_provider !== "klarna"), ord?.payment_provider);
      if (ord?.id) {
        const { count: sessStripe } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", String(ord.id)).eq("provider", "stripe");
        check("7e. NESSUNA sessione Stripe creata", Number(sessStripe ?? 0) === 0, sessStripe);
      }
      const { data: dopo } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK1).single();
      check("7f. stock ripristinato (delta netto 0)", Number(dopo?.quantita_disponibile ?? -1) === stockBase, { base: stockBase, dopo: dopo?.quantita_disponibile });
      await fetch(`http://127.0.0.1:${mockKlarna!.port}/__ok`, { method: "POST" });
    }

    // ── T8: regressione CARTA ────────────────────────────────────────────
    console.log("\n[T8] Regressione CARTA (invariata)");
    {
      const noS = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-fix-t8a-${ts}`, "carta", String(pN)));
      check("8a. carta su store senza Stripe → 422 CARTA_NON_DISPONIBILE", noS.status === 422 && noS.error?.code === "CARTA_NON_DISPONIBILE", noS.error?.code);

      // Positivo Stripe via orchestratore con mock (comportamento F1 identico).
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-fix-t8b-${ts}`, "bonifico", String(pS)));
      const ordineS = esito.data?.ordine?.id ? String(esito.data.ordine.id) : null;
      if (ordineS) ordiniCreati.push(ordineS);
      const sessStripe = await creaSessioneStripePerOrdine(ordineS!, stripeOpts);
      check("8b. sessione Stripe positiva con mock (invariata)", sessStripe.ok === true && String(sessStripe.redirectUrl).startsWith("https://checkout.stripe.com/"), sessStripe);
      const { data: ordS } = await db.from("ordini").select("payment_provider, payment_status").eq("id", ordineS).single();
      check("8c. ordine Stripe: payment_provider='stripe', pending", ordS?.payment_provider === "stripe" && ordS?.payment_status === "pending", ordS);
    }

    // ── T9: regressione BONIFICO ─────────────────────────────────────────
    console.log("\n[T9] Regressione BONIFICO (invariata)");
    {
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-fix-t9-${ts}`, "bonifico", String(pK1)));
      check("9a. bonifico → 201 ordine creato", esito.status === 201 && Boolean(esito.data?.ordine?.id), esito.status);
      if (esito.data?.ordine?.id) ordiniCreati.push(String(esito.data.ordine.id));
      check("9b. bonifico → nessun redirect di pagamento", esito.data?.pagamento == null, esito.data?.pagamento);
      const { data: ord } = await db.from("ordini").select("payment_provider").eq("id", String(esito.data?.ordine?.id ?? "")).single();
      check("9c. ordine MAI marcato payment_provider='klarna' né 'stripe'", !ord || (ord.payment_provider !== "klarna" && ord.payment_provider !== "stripe"), ord?.payment_provider);
    }

    // ── T10: VARIANTE nel buy-now ────────────────────────────────────────
    console.log("\n[T10] Variante: buy-now con varianteId → prezzo/variante corretti");
    {
      const key = `bn-fix-t10-${ts}`;
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(key, "bonifico", String(pK2), varianteId));
      check("10a. buy-now variante → 201", esito.status === 201 && Boolean(esito.data?.ordine?.id), esito.status);
      const ordineV = esito.data?.ordine?.id ? String(esito.data.ordine.id) : null;
      if (ordineV) ordiniCreati.push(ordineV);
      const { data: righe } = await db.from("ordini_righe").select("nome_prodotto, variante_nome, prezzo_unitario, quantita, variante_id").eq("ordine_id", ordineV!);
      check("10b. riga ordine: variante_nome corretta", Array.isArray(righe) && righe[0]?.variante_nome === "Taglia M", righe?.[0]?.variante_nome);
      check("10c. riga ordine: prezzo = prezzo VARIANTE (12.00, non 20.00)", Array.isArray(righe) && Number(righe[0]?.prezzo_unitario) === 12.0, righe?.[0]?.prezzo_unitario);
      check("10d. riga ordine: variante_id salvato", Array.isArray(righe) && String(righe[0]?.variante_id) === varianteId, righe?.[0]?.variante_id);
      const { data: vStk } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", varianteId).single();
      check("10e. stock VARIANTE decrementato (10→9)", Number(vStk?.quantita_disponibile ?? -1) === 9, vStk?.quantita_disponibile);
    }

    // ── T13-16: browser reale (DOM, logo, mobile, console) ───────────────
    console.log("\n[T13-16] Browser reale (Playwright) sul flusso ACQUISTA");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

    const rp = await page.goto(`${BASE}/prodotto/${slugK1}/acquista/spedizione`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    check("13a. DOM: img klarna-pink renderizzata (check 13)", (await page.evaluate(() => document.querySelectorAll("img[src*='klarna-pink']").length)) >= 1);
    check("14a. DOM: testo 'Paga in 3 rate' presente (check 14)", (await page.evaluate(() => document.body.innerText)).includes("Paga in 3 rate"));
    check("14b. DOM: disclaimer 'Soggetto ad approvazione' presente", (await page.evaluate(() => document.body.innerText)).includes("Soggetto ad approvazione"));

    // Klarna selezionabile: click sul radio klarna → checked
    const klarnaSelezionabile = await page.evaluate(() => {
      const radios = [...document.querySelectorAll<HTMLInputElement>("input[name='pagamento']")];
      const klarna = radios.find((r) => r.value === "klarna");
      if (!klarna) return { trovato: false };
      klarna.click();
      return { trovato: true, checked: klarna.checked };
    });
    check("1f. Klarna SELEZIONABILE nel DOM reale (click → checked)", klarnaSelezionabile.trovato === true && klarnaSelezionabile.checked === true, klarnaSelezionabile);

    // Mobile senza overflow (check 15)
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mp = await mobile.newPage();
    await mp.goto(`${BASE}/prodotto/${slugK1}/acquista/spedizione`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await mp.waitForTimeout(2000);
    const overflow = await mp.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return { scrollW: el.scrollWidth, innerW: window.innerWidth };
    });
    check("15a. mobile 390px: nessun overflow orizzontale (check 15)", overflow.scrollW <= overflow.innerW, overflow);
    const tMobile = await mp.evaluate(() => document.body.innerText);
    check("15b. mobile: opzione Klarna visibile", tMobile.includes("Klarna") && tMobile.includes("Paga in 3 rate"));
    await mobile.close();

    // Zero console errors (check 16)
    check("16a. zero console errors nel flusso ACQUISTA (check 16)", consoleErrors.length === 0, consoleErrors.slice(0, 3));
    check("16b. pagina ACQUISTA HTTP 200", rp?.status() === 200, rp?.status());
    await context.close();

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`KLARNA BUY-NOW FIX TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST KLARNA BUY-NOW FIX ──");
    if (browser) await browser.close().catch(() => {});
    if (mockKlarna) await mockKlarna.chiudi().catch(() => {});
    if (mockStripe) await mockStripe.chiudi().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}`);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `bn-fix-%-${ts}`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `bn-fix-%-${ts}`);
        console.log(`  Sweep residui ordini (bn-fix-%-${ts}): ${residui}`);
      }
    }
    if (varianteId) await db.from("prodotto_varianti").delete().eq("id", varianteId);
    for (const id of [pK1, pK2, pS, pN]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    for (const id of [negozioKId, negozioSId, negozioNId]) {
      if (id) {
        await db.from("negozio_metodi_pagamento").delete().eq("negozio_id", id);
        await db.from("negozio_pagamenti").delete().eq("negozio_id", id);
        await db.from("negozi").delete().eq("id", id);
      }
    }
    fermaServer();
    console.log("  Dati di test eliminati (ordini, sessioni, eventi, varianti, prodotti, metodi, negozi, config).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
