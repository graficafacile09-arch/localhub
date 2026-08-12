/**
 * TEST MIRATO — KLARNA NEL FLUSSO ACQUISTA (BUY-NOW, contratto UI ↔ backend).
 *
 * Verifica il comportamento REALE del flusso diretto "ACQUISTA" con Klarna:
 *   POST /api/cliente/ordini  body.spedizione.metodoPagamento = "klarna"
 *
 *   T1  disponibilità SERVER-SIDE: getMetodiPagamentoPubblici mostra "klarna"
 *       SOLO se il negozio ha Klarna configurato e attivo (mai per default);
 *   T2  buy-now klarna su negozio NON configurato → 422 KLARNA_NON_DISPONIBILE,
 *       nessun ordine creato (pre-flight fail-closed, mai fallback Stripe);
 *   T3  buy-now klarna su negozio configurato → ordine creato con
 *       metodo_pagamento='klarna' persistito, dispatch al gateway Klarna
 *       (errore KLARNA_* con credenziali test → mai Stripe), ordine chiuso
 *       con stock ripristinato, MAI payment_provider='stripe';
 *   T4  orchestratore positivo (mock HTTP Klarna): sessione con redirect
 *       hosted, order_lines per riga + spedizione, importi in minor units dal
 *       DB, payment_provider='klarna' pending, retry → stessa sessione;
 *   T5  regressione CARTA: pre-flight 422 su negozio senza Stripe, dispatch
 *       mai su klarna, sessione Stripe positiva con mock (invariato);
 *   T6  BONIFICO: 201 senza sessione gateway, mai klarna;
 *   T7  idempotenza: stessa idempotencyKey → 1 ordine, stock decrementato
 *       una sola volta / ripristinato una sola volta.
 *
 * Layer simulati: HTTP Klarna e HTTP Stripe (mock locali, pattern F1/F2.3);
 * DB Supabase reale. Cleanup COMPLETO nel finally.
 *
 * Uso: npx tsx scripts/test-klarna-buynow.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { creaSessionePagamentoPerOrdine } from "../lib/pagamenti/sessioni";
import { creaSessioneStripePerOrdine } from "../lib/pagamenti/sessioni";
import { getMetodiPagamentoPubblici } from "../lib/pagamenti/metodi-pubblici";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const CHIAVE_TEST = "chiave-klarna-buynow-test-0001";
const WH_SECRET_KLARNA = "whsec_klarna_buynow";
const WH_SECRET_STRIPE = "whsec_stripe_buynow";

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
// Server dev
// ════════════════════════════════════════════════════════════════════

const PORTA = Number(process.env.KLARNA_BUYNOW_PORT ?? 3154);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "klarna-buynow-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST,
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
        "Server dev terminato (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "klarna-buynow-next-dev.log")
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
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "klarna-buynow-next-dev.log"));
  }
  console.log(`\nServer dev pronto su ${BASE}.\n`);
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
// Mock Klarna (creazione sessione checkout)
// ════════════════════════════════════════════════════════════════════

function avviaMockKlarna() {
  let contatore = 0;
  const chiamate: Array<{ method: string; url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(body || "{}") as Record<string, unknown>;
      } catch {}
      chiamate.push({
        method: req.method ?? "",
        url: req.url ?? "",
        body: parsed,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
      });
      if (req.method === "POST" && req.url === "/checkout/v3/orders") {
        contatore++;
        const orderId = `klarna_bn_${contatore}`;
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
// Mock Stripe (creazione sessione checkout)
// ════════════════════════════════════════════════════════════════════

function avviaMockStripe() {
  const chiamate: Array<{ method: string; url: string; body: string }> = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      chiamate.push({ method: req.method ?? "", url: req.url ?? "", body });
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        const id = `cs_test_bn_${chiamate.length}`;
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

let ipCounter = 145;

function ipProva(): string {
  ipCounter += 1;
  return `10.8.3.${ipCounter}`;
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

/** Payload del buy-now esattamente come lo costruisce SpedizioneForm. */
function payloadBuyNow(idempotencyKey: string, metodoPagamento: string, prodottoId: string) {
  return {
    idempotencyKey,
    prodottoId: String(prodottoId),
    varianteId: null,
    quantita: 1,
    modalita: "spedizione",
    cliente: { nome: "Mario", cognome: "KlarnaBN", email: "klarna-bn@localhub.test", telefono: "3331234567" },
    spedizione: {
      indirizzo: "Via Test 1",
      cap: "87100",
      citta: "Cosenza",
      provincia: "CS",
      note: null,
      metodoSpedizione: "standard",
      metodoPagamento,
    },
    note: null,
  };
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

  let negozioKId: string | null = null; // Klarna configurato
  let negozioSId: string | null = null; // Stripe configurato
  let negozioNId: string | null = null; // nessun gateway
  let pK: number | null = null;
  let pS: number | null = null;
  let pN: number | null = null;
  let pV: number | null = null;
  let vId: string | null = null;
  const ordiniCreati: string[] = [];
  let mockKlarna: Awaited<ReturnType<typeof avviaMockKlarna>> | null = null;
  let mockStripe: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;

  try {
    // ── Setup ────────────────────────────────────────────────────────────
    console.log("\n[T0] Setup: negozio Klarna + negozio Stripe + negozio senza gateway");
    const { data: nK } = await db.from("negozi").insert({ nome: `KlarnaBN-A-${ts}`, slug: `klarnabn-a-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioKId = String(nK!.id);
    const { data: nS } = await db.from("negozi").insert({ nome: `KlarnaBN-B-${ts}`, slug: `klarnabn-b-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioSId = String(nS!.id);
    const { data: nN } = await db.from("negozi").insert({ nome: `KlarnaBN-C-${ts}`, slug: `klarnabn-c-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioNId = String(nN!.id);

    const cfgK = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioKId, p_provider: "klarna", p_attivo: true, p_test_mode: true,
      p_client_id: "api_username_test", p_secret: "api_password_test",
      p_webhook_secret: WH_SECRET_KLARNA, p_chiave: CHIAVE_TEST,
    });
    if ((cfgK.data as { ok?: boolean } | null)?.ok !== true) fail("Config Klarna fallita: " + JSON.stringify(cfgK.error ?? cfgK.data));
    const cfgS = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioSId, p_provider: "stripe", p_attivo: true, p_test_mode: true,
      p_client_id: null, p_secret: "sk_test_fake", p_webhook_secret: WH_SECRET_STRIPE, p_chiave: CHIAVE_TEST,
    });
    if ((cfgS.data as { ok?: boolean } | null)?.ok !== true) fail("Config Stripe fallita: " + JSON.stringify(cfgS.error ?? cfgS.data));

    // Metodi attivi per il checkout (come li scrive il pannello merchant).
    await db.from("negozio_metodi_pagamento").insert([
      { negozio_id: negozioKId, metodo: "klarna", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioSId, metodo: "carta", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioNId, metodo: "carta", attivo: true, ordine_mostra: 0 },
      { negozio_id: negozioNId, metodo: "klarna", attivo: true, ordine_mostra: 1 },
    ]);

    const { data: qK } = await db.from("prodotti").insert({ negozio_id: negozioKId, nome: `KlarnaBN Pane-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false }).select("id").single();
    pK = Number(qK!.id);
    const { data: qS } = await db.from("prodotti").insert({ negozio_id: negozioSId, nome: `KlarnaBN Latte-${ts}`, prezzo: 5.0, quantita_disponibile: 60, attivo: true, ha_varianti: false }).select("id").single();
    pS = Number(qS!.id);
    const { data: qN } = await db.from("prodotti").insert({ negozio_id: negozioNId, nome: `KlarnaBN Dolce-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false }).select("id").single();
    pN = Number(qN!.id);

    // Prodotto a variante nel negozio Klarna (T8: prezzo variante nel line item).
    const { data: qV } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioKId, nome: `KlarnaBN Variabile-${ts}`, prezzo: 8.0, quantita_disponibile: 0, attivo: true, ha_varianti: true })
      .select("id")
      .single();
    pV = Number(qV!.id);
    const { data: v1 } = await db
      .from("prodotto_varianti")
      .insert({ prodotto_id: pV, nome: "Variante XL", attributi: { taglia: "XL" }, prezzo: 12.5, quantita_disponibile: 30, quantita_riservata: 0, attivo: true })
      .select("id")
      .single();
    vId = String(v1!.id);

    mockKlarna = await avviaMockKlarna();
    mockStripe = await avviaMockStripe();
    const klarnaOpts = { baseUrl: `http://127.0.0.1:${mockKlarna.port}` };
    const stripeOpts = { host: "127.0.0.1", port: mockStripe.port, protocol: "http" as const };
    await avviaServer();

    // ── T1: disponibilità SERVER-SIDE (metodi realmente offerti) ─────────
    console.log("\n[T1] getMetodiPagamentoPubblici: Klarna SOLO se configurato (server-side)");
    {
      const esitoK = await getMetodiPagamentoPubblici(negozioKId);
      const metodiK = esitoK.ok ? esitoK.metodi : [];
      check("1a. negozio con Klarna configurato → klarna presente", metodiK.some((m) => m.metodo === "klarna"), metodiK);
      check("1b. ... e carta ASSENTE (Stripe non configurato)", !metodiK.some((m) => m.metodo === "carta"), metodiK);
      const esitoS = await getMetodiPagamentoPubblici(negozioSId);
      const metodiS = esitoS.ok ? esitoS.metodi : [];
      check("1c. negozio con Stripe configurato → carta presente", metodiS.some((m) => m.metodo === "carta"), metodiS);
      check("1d. ... e klarna ASSENTE (mai per default)", !metodiS.some((m) => m.metodo === "klarna"), metodiS);
      const esitoN = await getMetodiPagamentoPubblici(negozioNId);
      const metodiN = esitoN.ok ? esitoN.metodi : [];
      check("1e. negozio senza gateway → né carta né klarna", !metodiN.some((m) => m.metodo === "carta") && !metodiN.some((m) => m.metodo === "klarna"), metodiN);
    }

    // ── T2: buy-now klarna NON configurato → 422 fail-closed ─────────────
    console.log("\n[T2] Buy-now klarna su negozio NON configurato → 422 KLARNA_NON_DISPONIBILE");
    {
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-klarna-t2-${ts}`, "klarna", String(pN)));
      check("2a. HTTP 422", esito.status === 422, esito.status);
      check("2b. codice KLARNA_NON_DISPONIBILE", esito.error?.code === "KLARNA_NON_DISPONIBILE", esito.error);
      check("2c. messaggio leggibile", typeof esito.error?.message === "string" && String(esito.error.message).length > 10, esito.error?.message);
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `bn-klarna-t2-%`);
      check("2d. nessun ordine creato (pre-flight puro)", Number(count ?? 0) === 0, count);
    }

    // ── T3: buy-now klarna configurato → dispatch Klarna, mai Stripe ─────
    console.log("\n[T3] Buy-now klarna su negozio configurato → ordine + dispatch Klarna (fail-closed su gateway)");
    {
      const { data: stkPrima } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK).single();
      const stockPrima = Number(stkPrima?.quantita_disponibile ?? -1);
      const key = `bn-klarna-t3-${ts}`;
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(key, "klarna", String(pK)));
      const codice = String(esito.error?.code ?? "");
      check("3a. errore del gateway Klarna (codice KLARNA_*)", esito.status === 422 && codice.startsWith("KLARNA_"), { status: esito.status, code: esito.error?.code });
      check("3b. MAI un errore/fallback Stripe", !codice.includes("stripe") && !codice.startsWith("CARTA_"), esito.error);

      const { data: ordine } = await db.from("ordini").select("id, metodo_pagamento, payment_provider, payment_status, stato").like("idempotency_key", `${key}%`).single();
      // Il metodo_pagamento persistito è 'carta' (allowlist RPC, stesso mapping
      // del flusso carrello F2.2): il marcatore autoritativo del provider è
      // payment_provider, impostato dall'orchestratore SOLO a sessione avviata.
      check("3c. ordine creato con metodo_pagamento='carta' (mapping RPC, come carrello)", Boolean(ordine) && ordine?.metodo_pagamento === "carta", ordine);
      if (ordine?.id) ordiniCreati.push(String(ordine.id));
      check("3d. ordine MAI marcato payment_provider='stripe' (né klarna: sessione mai persistita)", !ordine || (ordine.payment_provider !== "stripe" && ordine.payment_provider !== "klarna"), ordine?.payment_provider);
      check("3e. ordine chiuso dal fallimento sessione (stato cancellato)", ordine?.stato === "cancellato", ordine?.stato);

      const { data: prodotto } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK).single();
      check("3f. stock ripristinato al valore iniziale (ordine chiuso)", Number(prodotto?.quantita_disponibile ?? -1) === stockPrima, { prima: stockPrima, dopo: prodotto?.quantita_disponibile });
      if (ordine?.id) {
        const { count: sess } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", String(ordine.id));
        check("3g. nessuna sessione salvata (fallita prima della persistenza)", Number(sess ?? 0) === 0, sess);
      }
    }

    // ── T4: orchestratore positivo (mock Klarna) su ordine buy-now ───────
    console.log("\n[T4] Sessione Klarna positiva (mock HTTP): redirect, line item, provider, retry");
    let ordineT4: string | null = null;
    {
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-bon-t4-${ts}`, "bonifico", String(pK)));
      check("4a. ordine bonifico creato (201)", esito.status === 201 && Boolean(esito.data?.ordine?.id), esito.status);
      ordineT4 = esito.data?.ordine?.id ? String(esito.data.ordine.id) : null;
      if (ordineT4) ordiniCreati.push(ordineT4);

      const sessione = await creaSessionePagamentoPerOrdine(ordineT4!, "klarna", klarnaOpts);
      check("4b. sessione Klarna creata (mock)", sessione.ok === true, sessione);
      if (sessione.ok) {
        check("4c. redirect = checkout hosted Klarna", String(sessione.redirectUrl).startsWith("https://checkout.klarna.com/"), sessione);
      }
      const { data: ordDb } = await db.from("ordini").select("payment_provider, payment_status, payment_amount").eq("id", ordineT4).single();
      check("4d. ordine: payment_provider='klarna', payment_status='pending'", ordDb?.payment_provider === "klarna" && ordDb?.payment_status === "pending", ordDb);

      const ultima = mockKlarna!.chiamate[mockKlarna!.chiamate.length - 1];
      check("4e. chiamata POST /checkout/v3/orders", ultima?.method === "POST" && ultima?.url === "/checkout/v3/orders", ultima);
      check("4f. Basic auth dalle credenziali della config", String(ultima?.headers?.["authorization"] ?? "").startsWith("Basic "), ultima?.headers?.["authorization"]);
      const body = ultima?.body ?? {};
      const ordAmount = Number(body.order_amount);
      const totaleAtteso = Math.round((10.0 + 5.9) * 100); // 1 prodotto + spedizione standard
      check("4g. order_amount = totale ordine DB in minor units", ordAmount === totaleAtteso, { ordAmount, totaleAtteso });
      const lines = (body.order_lines ?? []) as Array<Record<string, unknown>>;
      check("4h. 2 order_lines (1 prodotto + spedizione)", lines.length === 2, lines);
      const prodLine = lines.find((l) => String(l.name).startsWith("KlarnaBN Pane"));
      check("4i. prodotto: unit_price 1000 (prezzo DB) × 1", prodLine?.unit_price === 1000 && prodLine?.quantity === 1, prodLine);
      const shipLine = lines.find((l) => l.type === "shipping_fee");
      check("4j. spedizione standard: 590 (costo DB)", shipLine?.unit_price === 590, shipLine);

      // Retry → stessa sessione, zero nuove chiamate HTTP.
      const nPrima = mockKlarna!.chiamate.length;
      const retry = await creaSessionePagamentoPerOrdine(ordineT4!, "klarna", klarnaOpts);
      const stessoRedirect =
        retry.ok === true && sessione.ok === true && retry.giaEsistente === true && retry.redirectUrl === sessione.redirectUrl;
      check("4k. retry → giaEsistente=true, stesso redirect", stessoRedirect, retry);
      check("4l. retry → nessuna nuova chiamata HTTP", mockKlarna!.chiamate.length === nPrima, mockKlarna!.chiamate.length);
      const { count: attive } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", ordineT4).in("status", ["created", "pending"]);
      check("4m. una sola sessione attiva per ordine+provider", Number(attive ?? 0) === 1, attive);
    }

    // ── T5: regressione CARTA (invariata) ────────────────────────────────
    console.log("\n[T5] Regressione CARTA: pre-flight, nessun fallback klarna, sessione Stripe invariata");
    {
      const noS = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-carta-t5a-${ts}`, "carta", String(pN)));
      check("5a. carta su negozio senza Stripe → 422 CARTA_NON_DISPONIBILE", noS.status === 422 && noS.error?.code === "CARTA_NON_DISPONIBILE", noS.error);
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `bn-carta-t5a-%`);
      check("5b. nessun ordine creato", Number(count ?? 0) === 0, count);

      const key = `bn-carta-t5b-${ts}`;
      const cfg = await postJson("/api/cliente/ordini", payloadBuyNow(key, "carta", String(pS)));
      check("5c. carta su negozio Stripe: ordine creato, sessione Stripe reale fallita (creds test) → 422", cfg.status === 422, { status: cfg.status, error: cfg.error });
      const { data: ordine } = await db.from("ordini").select("id, metodo_pagamento, payment_provider, stato").like("idempotency_key", `${key}%`).single();
      check("5d. ordine carta MAI marcato payment_provider='klarna'", !ordine || ordine.payment_provider !== "klarna", ordine?.payment_provider);
      if (ordine?.id) ordiniCreati.push(String(ordine.id));

      // Stripe POSITIVO con mock: il comportamento F1 resta identico.
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-bon-t5c-${ts}`, "bonifico", String(pS)));
      const ordineS = esito.data?.ordine?.id ? String(esito.data.ordine.id) : null;
      if (ordineS) ordiniCreati.push(ordineS);
      const sessStripe = await creaSessioneStripePerOrdine(ordineS!, stripeOpts);
      const redirectStripe = sessStripe.ok ? sessStripe.redirectUrl : "";
      check("5e. sessione Stripe positiva con mock (invariata)", sessStripe.ok === true && redirectStripe.startsWith("https://checkout.stripe.com/"), sessStripe);
      const { data: ordS } = await db.from("ordini").select("payment_provider, payment_status").eq("id", ordineS).single();
      check("5f. ordine Stripe: payment_provider='stripe', pending", ordS?.payment_provider === "stripe" && ordS?.payment_status === "pending", ordS);
    }

    // ── T6: BONIFICO (invariato) ─────────────────────────────────────────
    console.log("\n[T6] Regressione BONIFICO: 201 senza sessione gateway");
    {
      const esito = await postJson("/api/cliente/ordini", payloadBuyNow(`bn-bon-t6-${ts}`, "bonifico", String(pK)));
      check("6a. bonifico → 201 ordine creato", esito.status === 201 && Boolean(esito.data?.ordine?.id), { status: esito.status });
      if (esito.data?.ordine?.id) ordiniCreati.push(String(esito.data.ordine.id));
      check("6b. bonifico → nessun redirect di pagamento", esito.data?.pagamento == null, esito.data?.pagamento);
      const { data: ord } = await db.from("ordini").select("payment_provider").eq("id", String(esito.data?.ordine?.id ?? "")).single();
      check("6c. ordine MAI marcato payment_provider='klarna'", !ord || ord.payment_provider !== "klarna", ord?.payment_provider);
    }

    // ── T7: idempotenza idempotencyKey (doppio invio) ────────────────────
    console.log("\n[T7] Idempotenza: stessa idempotencyKey → 1 ordine, stock gestito una volta");
    {
      // Stock base = 3 ordini aperti prima (T4, T5c, T6): usiamo delta relativi.
      const { data: stkBase } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK).single();
      const stockBase = Number(stkBase?.quantita_disponibile ?? -1);
      const key = `bn-bon-t7-${ts}`;
      const r1 = await postJson("/api/cliente/ordini", payloadBuyNow(key, "bonifico", String(pK)));
      const r2 = await postJson("/api/cliente/ordini", payloadBuyNow(key, "bonifico", String(pK)));
      check("7a. primo invio → 201, retry → 200", r1.status === 201 && r2.status === 200, { s1: r1.status, s2: r2.status });
      const id1 = String(r1.data?.ordine?.id ?? "");
      const id2 = String(r2.data?.ordine?.id ?? "");
      check("7b. stesso ordine restituito (mai duplicato)", id1 !== "" && id1 === id2, { id1, id2 });
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `${key}%`);
      check("7c. un solo ordine nel DB", Number(count ?? 0) === 1, count);
      const { data: dopo1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK).single();
      check("7d. stock decrementato UNA sola volta (base−1)", Number(dopo1?.quantita_disponibile ?? -1) === stockBase - 1, { base: stockBase, dopo: dopo1?.quantita_disponibile });
      if (id1) ordiniCreati.push(id1);

      // Doppio tentativo klarna (entrambi 422): 1 solo ordine, stock ripristinato una volta.
      const keyK = `bn-klarna-t7-${ts}`;
      const k1 = await postJson("/api/cliente/ordini", payloadBuyNow(keyK, "klarna", String(pK)));
      const k2 = await postJson("/api/cliente/ordini", payloadBuyNow(keyK, "klarna", String(pK)));
      check("7e. doppio klarna → entrambi 422 (gateway test, fail-closed)", k1.status === 422 && k2.status === 422, { s1: k1.status, s2: k2.status });
      const { count: nK7 } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `${keyK}%`);
      check("7f. un solo ordine klarna nel DB", Number(nK7 ?? 0) === 1, nK7);
      if (Number(nK7 ?? 0) === 1) {
        const { data: ordK } = await db.from("ordini").select("id").like("idempotency_key", `${keyK}%`).single();
        if (ordK?.id) ordiniCreati.push(String(ordK.id));
      }
      const { data: dopo2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pK).single();
      check("7g. stock ripristinato UNA sola volta (torna a base−1, mai oltre)", Number(dopo2?.quantita_disponibile ?? -1) === stockBase - 1, { base: stockBase, dopo: dopo2?.quantita_disponibile });
    }

    // ── T8: variante → prezzo variante nel line item Klarna ──────────────
    console.log("\n[T8] Buy-now variante: prezzo variante nel line item Klarna (snapshot DB)");
    {
      // Ordine di appoggio (bonifico) per esercitare l'orchestratore Klarna
      // con mock: il payload buy-now trasporta varianteId (validato dal server).
      const payloadV = payloadBuyNow(`bn-variant-t8-${ts}`, "bonifico", String(pV)) as {
        varianteId: string | null;
        [k: string]: unknown;
      };
      payloadV.varianteId = vId;
      const esito = await postJson("/api/cliente/ordini", payloadV);
      check("8a. ordine con variante creato (201)", esito.status === 201 && Boolean(esito.data?.ordine?.id), esito.status);
      const ordineV = esito.data?.ordine?.id ? String(esito.data.ordine.id) : null;
      if (ordineV) ordiniCreati.push(ordineV);
      const sessione = ordineV ? await creaSessionePagamentoPerOrdine(ordineV, "klarna", klarnaOpts) : null;
      check("8b. sessione Klarna creata (mock)", sessione?.ok === true, sessione);
      const ultima = mockKlarna!.chiamate[mockKlarna!.chiamate.length - 1];
      const lines = (ultima?.body?.order_lines ?? []) as Array<Record<string, unknown>>;
      const prodLine = lines.find((l) => String(l.name).startsWith("KlarnaBN Variabile"));
      // unit_price 1250 = prezzo VARIANTE 12.50 in centesimi (mai prezzo base 8.00).
      check("8c. unit_price = prezzo variante DB (1250), mai 800", prodLine?.unit_price === 1250, prodLine);
      check("8d. quantità = 1 dal payload", prodLine?.quantity === 1, prodLine);
    }

    // ── T10/T12/T13: metodi pubblici coerenti, testi UI, logo asset ──────
    console.log("\n[T10/T12/T13] Metodi pubblici coerenti + testi Klarna + asset logo rosa");
    {
      const esito = await getMetodiPagamentoPubblici(negozioKId);
      const metodi = esito.ok ? esito.metodi : [];
      const klarna = metodi.find((m) => m.metodo === "klarna");
      check("10a. descrizione Klarna = 'Dividi il tuo acquisto in 3 rate, se disponibile.'", klarna?.descrizione === "Dividi il tuo acquisto in 3 rate, se disponibile.", klarna?.descrizione);
      // Nessun dato sensibile/credenziale nel payload pubblico.
      const json = JSON.stringify(metodi);
      check("10b. nessuna credenziale/secret nel payload pubblico", !/(secret|token|password|api_key)/i.test(json), json);
      // Asset logo ufficiale rosa presente localmente.
      const asset = readFileSync(join(PROGETTO, "public/loghi/klarna-pink.svg"), "utf8");
      check("12a. public/loghi/klarna-pink.svg esiste e contiene fill rosa #FFB3C7", asset.includes("FFB3C7"), asset.slice(0, 120));
      check("12b. nessun commento XML che blocca la rasterizzazione canvas", !asset.includes("<!--"), asset.slice(0, 120));
      // Il badge 'Paga in 3 rate' è renderizzato dalla UI buy-now per il metodo klarna
      // (componente SpedizioneForm): verifica statica del contratto UI.
      const ui = readFileSync(join(PROGETTO, "components/acquista/SpedizioneForm.tsx"), "utf8");
      check("13a. SpedizioneForm mostra il badge 'Paga in 3 rate'", ui.includes("Paga in 3 rate"), "badge assente");
      check("13b. SpedizioneForm usa il logo rosa klarna-pink.svg", ui.includes("/loghi/klarna-pink.svg"), "logo assente");
      check("13c. SpedizioneForm mostra il disclaimer Klarna", ui.includes("Soggetto ad approvazione e alle condizioni di Klarna."), "disclaimer assente");
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`KLARNA BUY-NOW TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST KLARNA BUY-NOW ──");
    if (mockKlarna) await mockKlarna.chiudi().catch(() => {});
    if (mockStripe) await mockStripe.chiudi().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}`);
    }
    // Sweep difensivo: tutte le chiavi di questo test (formato bn-*-<ts>).
    // Il like usa 'bn-%-<ts>' per coprire anche i segmenti intermedi (t2/t3/...).
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `bn-%-${ts}`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `bn-%-${ts}`);
        console.log(`  Sweep residui ordini (bn-%-${ts}): ${residui}`);
      }
    }
    if (vId !== null) await db.from("prodotto_varianti").delete().eq("id", vId);
    for (const id of [pK, pS, pN, pV]) {
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
    console.log("  Dati di test eliminati (ordini, sessioni, eventi, prodotti, metodi, negozi, config).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
