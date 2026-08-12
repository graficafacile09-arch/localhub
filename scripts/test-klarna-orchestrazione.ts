/**
 * TEST ORCHESTRAZIONE KLARNA — server dev reale + Supabase reale + mock HTTP.
 *
 * Verifica l'integrazione di Klarna nell'orchestratore dei pagamenti
 * (registry + creaSessionePagamentoPerOrdine + dispatch route carrello)
 * senza modificare il comportamento Stripe. Unici layer simulati: l'HTTP
 * di Klarna e di Stripe (server locali, pattern F1/F2.3/F2.6).
 *
 *   T1  dispatch route: klarna NON configurato → 422 KLARNA_NON_DISPONIBILE,
 *       nessun ordine creato (fail-closed pre-flight);
 *   T2  dispatch route: klarna configurato → ordine creato, errore per negozio
 *       KLARNA_* (MAI fallback su stripe), ordine mai marcato provider stripe;
 *   T3  orchestratore positivo (mock Klarna): sessione creata, Basic auth da
 *       config, order_amount = ordine.totale in minor units, line item per
 *       riga DB (variante + spedizione), Klarna-Idempotency-Key, provider
 *       'klarna' su ordini + pagamenti_sessioni, pending, retry → riuso stessa
 *       sessione senza nuove chiamate HTTP;
 *   T4  multi-provider multi-negozio: ordine B (Stripe, mock) → sessione
 *       provider 'stripe'; 2 sessioni totali, una per ordine/provider;
 *   T5  fail-closed orchestratore: klarna su negozio senza config →
 *       PAGAMENTO_NON_DISPONIBILE; scalapay non implementato →
 *       PROVIDER_NON_DISPONIBILE (mai fallback silenzioso);
 *   T6  regressione buy-now (POST /api/cliente/ordini) invariato;
 *   T7  regressione Stripe: line item e totale sessione invariati (mock).
 *
 * Cleanup COMPLETO nel finally (eventi, sessioni, ordini, stock, varianti,
 * prodotti, negozi, config, mock, server).
 *
 * Uso: npx tsx scripts/test-klarna-orchestrazione.ts
 */
import { createHmac } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { creaSessionePagamentoPerOrdine, creaSessioneStripePerOrdine } from "../lib/pagamenti/sessioni";
import { getGatewayProvider, providerGatewayImplementato } from "../lib/pagamenti/registry";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

/** Chiave di cifratura TEST per le credenziali dei negozi (stessa del server dev). */
const CHIAVE_TEST = "chiave-klarna-orchestrazione-test-0001";
const WH_SECRET_KLARNA = "whsec_klarna_test";
const WH_SECRET_STRIPE = "whsec_stripe_test";

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

const PORTA = Number(process.env.KLARNA_ORG_PORT ?? 3148);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "klarna-org-next-dev.log"), { flags: "w" });
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
        "Server dev terminato inaspettatamente (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "klarna-org-next-dev.log")
      );
    }
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini/carrello`, {
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
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "klarna-org-next-dev.log"));
  }
  console.log(`\nServer dev pronto su ${BASE} (route compilata).\n`);
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
// Mock Klarna
// ════════════════════════════════════════════════════════════════════

const AUTH_KLARNA_ATTESA = `Basic ${Buffer.from("api_username_test:api_password_test", "utf8").toString("base64")}`;

function avviaMockKlarna() {
  const chiamate: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }> = [];
  let contatore = 0;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += String(c)));
    req.on("end", () => {
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {}
      chiamate.push({
        method: req.method ?? "GET",
        url: req.url ?? "",
        headers: req.headers as Record<string, string>,
        body,
      });

      const rispondi = (status: number, payload?: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload !== undefined ? JSON.stringify(payload) : "");
      };

      if (req.method === "POST" && req.url === "/checkout/v3/orders") {
        const auth = String(req.headers["authorization"] ?? "");
        if (auth !== AUTH_KLARNA_ATTESA) {
          return rispondi(401, { error_code: "AUTH_FAILED", error_messages: ["Invalid credentials"], correlation_id: "c-401" });
        }
        contatore++;
        const orderId = `klarna_org_${contatore}`;
        return rispondi(200, {
          order_id: orderId,
          redirect_url: `https://checkout.klarna.com/${orderId}`,
          status: "checkout_incomplete",
        });
      }

      if (req.method === "GET" && req.url?.startsWith("/ordermanagement/v1/orders/")) {
        return rispondi(200, { order_status: "AUTHORIZED", order_amount: 3190, remaining_authorized_amount: 3190, refunded_amount: 0 });
      }

      rispondi(404, { error_code: "NOT_FOUND", error_messages: [] });
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
// Mock Stripe
// ════════════════════════════════════════════════════════════════════

function avviaMockStripe() {
  const chiamate: Array<{ url: string; method: string; body: string }> = [];
  let contatore = 0;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      chiamate.push({ url: req.url ?? "", method: req.method ?? "GET", body });
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        contatore++;
        const id = `cs_test_klarna_org_${contatore}`;
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

/** Estrae i line item dal body Stripe (line_items[i][price_data][unit_amount]...). */
function lineItemsStripe(body: string): Array<{ quantity: number; unitAmount: number; name: string }> {
  const out: Record<string, string> = {};
  for (const coppia of body.split("&")) {
    const eq = coppia.indexOf("=");
    if (eq < 0) continue;
    out[decodeURIComponent(coppia.slice(0, eq).replace(/\+/g, "%20"))] = decodeURIComponent(
      coppia.slice(eq + 1).replace(/\+/g, "%20")
    );
  }
  const mappa = new Map<number, { quantity: number; unitAmount: number; name: string }>();
  for (const [k, v] of Object.entries(out)) {
    const m = k.match(/^line_items\[(\d+)\]\[(.*)\]$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const campo = m[2];
    const riga = mappa.get(idx) ?? { quantity: 0, unitAmount: 0, name: "" };
    if (campo === "quantity") riga.quantity = Number(v);
    else if (campo === "price_data][unit_amount") riga.unitAmount = Number(v);
    else if (campo === "price_data][product_data][name") riga.name = v;
    mappa.set(idx, riga);
  }
  return [...mappa.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

// ════════════════════════════════════════════════════════════════════
// Helpers HTTP
// ════════════════════════════════════════════════════════════════════

let ipCounter = 60;

function ipProva(): string {
  ipCounter += 1;
  return `10.8.0.${ipCounter}`;
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

  let negozioAId: string | null = null; // Klarna configurato
  let negozioBId: string | null = null; // Stripe configurato
  let p1: number | null = null; // negozio A: 10.00 stock 40
  let pV: number | null = null; // negozio A: ha_varianti (padre)
  let vM: string | null = null; // variante M: 6.00 stock 10
  let pB: number | null = null; // negozio B: 3.00 stock 100

  const ordiniCreati: string[] = [];
  let mockKlarna: Awaited<ReturnType<typeof avviaMockKlarna>> | null = null;
  let mockStripe: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;

  try {
    // ── Setup: negozi + config + prodotti ────────────────────────────────
    console.log("\n[T0] Setup: negozio A (Klarna) + negozio B (Stripe) + prodotti/variante");
    const { data: nA } = await db.from("negozi").insert({ nome: `KlarnaOrg-A-${ts}`, slug: `klarnaorg-a-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioAId = String(nA!.id);
    const { data: nB } = await db.from("negozi").insert({ nome: `KlarnaOrg-B-${ts}`, slug: `klarnaorg-b-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioBId = String(nB!.id);

    const cfgA = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioAId,
      p_provider: "klarna",
      p_attivo: true,
      p_test_mode: true,
      p_client_id: "api_username_test",
      p_secret: "api_password_test",
      p_webhook_secret: WH_SECRET_KLARNA,
      p_chiave: CHIAVE_TEST,
    });
    if ((cfgA.data as { ok?: boolean } | null)?.ok !== true) {
      fail("Config Klarna negozio A fallita: " + JSON.stringify(cfgA.error ?? cfgA.data));
    }
    const cfgB = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioBId,
      p_provider: "stripe",
      p_attivo: true,
      p_test_mode: true,
      p_secret: "sk_test_klarna_org_mock",
      p_webhook_secret: WH_SECRET_STRIPE,
      p_chiave: CHIAVE_TEST,
    });
    if ((cfgB.data as { ok?: boolean } | null)?.ok !== true) {
      fail("Config Stripe negozio B fallita: " + JSON.stringify(cfgB.error ?? cfgB.data));
    }
    check("Klarna configurato su A e Stripe su B (RPC salva)", true);

    const { data: q1 } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `KlarnaOrg Pane-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false }).select("id").single();
    p1 = Number(q1!.id);
    const { data: qv } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `KlarnaOrg Pizza-${ts}`, prezzo: 5.0, quantita_disponibile: 0, attivo: true, ha_varianti: true }).select("id").single();
    pV = Number(qv!.id);
    const { data: v1 } = await db.from("prodotto_varianti").insert({ prodotto_id: pV, nome: "KlarnaOrg Variante M", attributi: { taglia: "M" }, prezzo: 6.0, quantita_disponibile: 10, quantita_riservata: 0, attivo: true }).select("id").single();
    vM = String(v1!.id);
    const { data: qB } = await db.from("prodotti").insert({ negozio_id: negozioBId, nome: `KlarnaOrg Dolce-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false }).select("id").single();
    pB = Number(qB!.id);

    const ids = { p1: String(p1), pV: String(pV), vM, pB: String(pB) };

    const baseCheckout = {
      modalita: "spedizione" as const,
      cliente: { nome: "Mario", cognome: "KlarnaOrg", telefono: "3331234567", email: "klarna-org@localhub.test" },
      spedizione: {
        indirizzo: "Via Test 1", cap: "87100", citta: "Cosenza", provincia: "CS",
        metodoSpedizione: "standard" as const, metodoPagamento: "bonifico" as const,
      },
    };

    mockKlarna = await avviaMockKlarna();
    mockStripe = await avviaMockStripe();
    const klarnaOpts = { baseUrl: `http://127.0.0.1:${mockKlarna.port}` };
    const stripeOpts = { host: "127.0.0.1", port: mockStripe.port, protocol: "http" as const };

    await avviaServer();

    // ── T1: dispatch route — klarna NON configurato → 422, nessun ordine ─
    console.log("\n[T1] Route: klarna non configurato sul negozio → fail-closed pre-flight");
    {
      const nChiamatePrima = mockKlarna.chiamate.length;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: `klarna-t1-${ts}`, ...baseCheckout,
        spedizione: { ...baseCheckout.spedizione, metodoPagamento: "klarna" },
        righe: [{ prodottoId: ids.pB, varianteId: null, quantita: 2 }], // negozio B: NO klarna
      });
      check("HTTP 422 + KLARNA_NON_DISPONIBILE", esito.status === 422 && esito.error?.code === "KLARNA_NON_DISPONIBILE", { status: esito.status, error: esito.error });
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `klarna-t1-%`);
      check("nessun ordine creato", Number(count ?? 0) === 0, count);
      check("nessuna chiamata HTTP a Klarna (pre-flight puro)", mockKlarna.chiamate.length === nChiamatePrima, mockKlarna.chiamate.length);
    }

    // ── T2: dispatch route — klarna configurato → ordine creato, errore ──
    //    KLARNA_* (MAI fallback silenzioso su stripe).
    console.log("\n[T2] Route: klarna configurato → ordine creato + errore KLARNA_* (no fallback stripe)");
    let ordineT2Id: string | null = null;
    {
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: `klarna-t2-${ts}`, ...baseCheckout,
        spedizione: { ...baseCheckout.spedizione, metodoPagamento: "klarna" },
        righe: [{ prodottoId: ids.p1, varianteId: null, quantita: 1 }], // negozio A: klarna SI
      });
      check("HTTP 201 (ordine creato)", esito.status === 201, esito.status);
      const ordine = esito.data?.ordini?.[0];
      check("ordine presente", Boolean(ordine?.ordineId), ordine);
      ordineT2Id = String(ordine?.ordineId ?? "");
      // La route ha dispatchato su Klarna REALE (credenziali test false) →
      // errore per negozio con codice KLARNA_*: MAI un fallback su stripe.
      const errKlarna = (esito.data?.errori ?? []).some((e: any) => String(e.codice).startsWith("KLARNA_"));
      check("errore per negozio con codice KLARNA_* (niente fallback stripe)", errKlarna, esito.data?.errori);
      if (ordineT2Id) {
        const { data: o } = await db.from("ordini").select("payment_provider, payment_status").eq("id", ordineT2Id).single();
        check("ordine MAI marcato payment_provider=stripe", o?.payment_provider !== "stripe", o);
        check("pagamento chiuso (mai pending orfano)", o?.payment_status === "expired" || o?.payment_status === null, o);
      }
    }

    // ── T3: ordini via route (bonifico) + orchestratore Klarna (mock) ────
    console.log("\n[T3] Orchestratore Klarna (mock): sessione, line item, idempotenza, retry");
    let ordineAId: string | null = null;
    let ordineBId: string | null = null;
    {
      const key = `klarna-t3-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.p1, varianteId: null, quantita: 2 },   // negozio A: 10×2
          { prodottoId: ids.pV, varianteId: ids.vM, quantita: 1 }, // negozio A: variante 6×1
          { prodottoId: ids.pB, varianteId: null, quantita: 2 },   // negozio B: 3×2
        ],
      });
      check("HTTP 201 (2 ordini separati)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("2 ordini (uno per negozio)", ordini.length === 2, ordini.map((o: any) => o.negozioId));
      const oA = ordini.find((o: any) => String(o.negozioId) === negozioAId);
      const oB = ordini.find((o: any) => String(o.negozioId) === negozioBId);
      check("ordine A totale 31.90 (2 righe)", oA && Number(oA.totale) === 31.9, oA?.totale);
      check("ordine B totale 11.90", oB && Number(oB.totale) === 11.9, oB?.totale);
      ordineAId = String(oA?.ordineId ?? "");
      ordineBId = String(oB?.ordineId ?? "");
      if (!ordineAId || !ordineBId) fail("T3: ordini non creati");
      ordiniCreati.push(ordineAId, ordineBId);

      // ── Sessione Klarna (mock) sull'ordine A ──
      const nChiamatePrima = mockKlarna.chiamate.length;
      const sessione = await creaSessionePagamentoPerOrdine(ordineAId, "klarna", klarnaOpts);
      check("3a. sessione Klarna creata (mock redirect)", sessione.ok === true, sessione);
      if (!sessione.ok) fail("T3: sessione Klarna fallita: " + sessione.errore);
      check("3b. redirectUrl = checkout hosted Klarna", sessione.ok && String(sessione.redirectUrl).startsWith("https://checkout.klarna.com/"), sessione);

      const reqKlarna = mockKlarna.chiamate[mockKlarna.chiamate.length - 1];
      const body = (reqKlarna.body ?? {}) as Record<string, unknown>;
      const lines = (body.order_lines ?? []) as Array<Record<string, unknown>>;
      check("3c. Basic auth dalle credenziali config", reqKlarna.headers["authorization"] === AUTH_KLARNA_ATTESA, reqKlarna.headers["authorization"]);
      check("3d. Klarna-Idempotency-Key deterministica", reqKlarna.headers["klarna-idempotency-key"] === `klarna:${ordineAId}`, reqKlarna.headers["klarna-idempotency-key"]);
      check("3e. 3 order_lines (2 prodotti + spedizione)", lines.length === 3, lines);
      const rigaPane = lines.find((l) => String(l.name).startsWith("KlarnaOrg Pane"));
      check("3f. Pane 1000×2 (minor units da DB)", rigaPane?.unit_price === 1000 && rigaPane?.quantity === 2, rigaPane);
      const rigaPizza = lines.find((l) => String(l.name).includes("Pizza"));
      check("3g. variante M: 600×1 e variante nel nome", rigaPizza?.unit_price === 600 && rigaPizza?.quantity === 1 && String(rigaPizza?.name).includes("Variante M"), rigaPizza);
      const rigaSped = lines.find((l) => String(l.name) === "Spedizione");
      check("3h. Spedizione 590×1", rigaSped?.unit_price === 590 && rigaSped?.quantity === 1, rigaSped);
      check("3i. order_amount = 3190 = ordine.totale", Number(body.order_amount) === 3190, body.order_amount);

      // ── DB: provider + stato ──
      const { data: ordineDb } = await db.from("ordini").select("payment_provider, payment_status, payment_id, payment_amount").eq("id", ordineAId).single();
      check("3j. ordine A: payment_provider='klarna'", ordineDb?.payment_provider === "klarna", ordineDb?.payment_provider);
      check("3k. ordine A: payment_status='pending'", ordineDb?.payment_status === "pending", ordineDb?.payment_status);
      check("3l. payment_amount = 31.90", Number(ordineDb?.payment_amount ?? 0) === 31.9, ordineDb?.payment_amount);
      const { data: sessioneDb } = await db.from("pagamenti_sessioni").select("provider, status, amount, payment_id").eq("ordine_id", ordineAId).single();
      check("3m. pagamenti_sessioni: provider='klarna', status='created'", sessioneDb?.provider === "klarna" && sessioneDb?.status === "created", sessioneDb);
      check("3n. payment_id = order_id Klarna", String(sessioneDb?.payment_id ?? "").startsWith("klarna_org_"), sessioneDb?.payment_id);

      // ── Retry: stessa sessione, zero nuove chiamate ──
      const nPrimaRetry = mockKlarna.chiamate.length;
      const retry = await creaSessionePagamentoPerOrdine(ordineAId, "klarna", klarnaOpts);
      const stessaSessione = retry.ok === true && sessione.ok === true && retry.giaEsistente === true && retry.redirectUrl === sessione.redirectUrl;
      check("3o. retry → giaEsistente=true, stesso redirect", stessaSessione, retry);
      check("3p. retry → nessuna nuova chiamata HTTP a Klarna", mockKlarna.chiamate.length === nPrimaRetry, mockKlarna.chiamate.length);
      const { count } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", ordineAId).eq("provider", "klarna").in("status", ["created", "pending"]);
      check("3q. una sola sessione attiva per ordine+provider", Number(count ?? 0) === 1, count);
    }

    // ── T4: multi-provider multi-negozio (ordine B → Stripe mock) ────────
    console.log("\n[T4] Multi-provider: ordine B → sessione Stripe (mock), 2 sessioni separate");
    {
      const sessioneB = await creaSessionePagamentoPerOrdine(ordineBId!, "stripe", stripeOpts);
      check("4a. sessione Stripe creata sull'ordine B", sessioneB.ok === true, sessioneB);
      if (!sessioneB.ok) fail("T4: sessione Stripe fallita: " + sessioneB.errore);

      const bodyStripe = mockStripe!.chiamate[mockStripe!.chiamate.length - 1].body;
      const items = lineItemsStripe(bodyStripe);
      const totaleCentesimi = items.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
      check("4b. line item Stripe: Dolce 300×2 + Spedizione 590 = 1190 = totale ordine B", items.some((i) => i.unitAmount === 300 && i.quantity === 2) && items.some((i) => i.unitAmount === 590) && totaleCentesimi === 1190, items);
      check("4c. client_reference_id = ordine B", decodeURIComponent(bodyStripe).includes(`client_reference_id=${ordineBId}`), bodyStripe.slice(0, 150));

      const { data: ordineB } = await db.from("ordini").select("payment_provider, payment_status").eq("id", ordineBId).single();
      check("4d. ordine B: provider='stripe', pending", ordineB?.payment_provider === "stripe" && ordineB?.payment_status === "pending", ordineB);

      const { data: sessioni } = await db.from("pagamenti_sessioni").select("ordine_id, provider, status").in("ordine_id", [ordineAId, ordineBId]);
      const attive = (sessioni ?? []).filter((s) => ["created", "pending"].includes(s.status));
      check("4e. 2 sessioni attive totali (una per ordine)", attive.length === 2, attive);
      check("4f. una per ordine, provider distinti", new Set(attive.map((s) => s.ordine_id)).size === 2 && new Set(attive.map((s) => s.provider)).size === 2, attive);

      // Wrapper retrocompatibile: riuso della stessa sessione Stripe.
      const wrapper = await creaSessioneStripePerOrdine(ordineBId!, stripeOpts);
      check("4g. wrapper creaSessioneStripePerOrdine → riuso stessa sessione (giaEsistente)", wrapper.ok && "giaEsistente" in wrapper && wrapper.giaEsistente === true, wrapper);
    }

    // ── T5: fail-closed orchestratore ────────────────────────────────────
    console.log("\n[T5] Fail-closed: provider non configurato / non implementato");
    {
      const noCfg = await creaSessionePagamentoPerOrdine(ordineBId!, "klarna", klarnaOpts);
      check("5a. klarna su negozio senza config → PAGAMENTO_NON_DISPONIBILE", !noCfg.ok && noCfg.codice === "PAGAMENTO_NON_DISPONIBILE", noCfg);
      const noImpl = await creaSessionePagamentoPerOrdine(ordineAId!, "scalapay");
      check("5b. scalapay non implementato → PROVIDER_NON_DISPONIBILE (mai fallback)", !noImpl.ok && noImpl.codice === "PROVIDER_NON_DISPONIBILE", noImpl);
      check("5c. registry: klarna implementato, scalapay no", providerGatewayImplementato("klarna") === true && providerGatewayImplementato("scalapay") === false, { klarna: providerGatewayImplementato("klarna"), scalapay: providerGatewayImplementato("scalapay") });
      check("5d. getGatewayProvider('klarna') non-null, ('scalapay') null", getGatewayProvider("klarna") !== null && getGatewayProvider("scalapay") === null);
    }

    // ── T6: regressione buy-now ──────────────────────────────────────────
    console.log("\n[T6] Regressione buy-now (POST /api/cliente/ordini, invariato)");
    {
      const key = `klarna-bn-${ts}`;
      const body = {
        idempotencyKey: key,
        prodottoId: ids.p1,
        varianteId: null,
        quantita: 1,
        modalita: "spedizione",
        cliente: { nome: "Anna", cognome: "KlarnaOrg", telefono: null, email: "klarna-bn@localhub.test" },
        spedizione: {
          indirizzo: "Via Test 2", cap: "87100", citta: "Cosenza", provincia: "CS",
          metodoSpedizione: "standard", metodoPagamento: "bonifico",
        },
      };
      const r1 = await postJson("/api/cliente/ordini", body);
      check("6a. buy-now → 201 con ordine", r1.status === 201 && Boolean(r1.data?.ordine?.id), { status: r1.status, ordine: r1.data?.ordine });
      const primoId = r1.data?.ordine?.id;
      if (primoId) ordiniCreati.push(String(primoId));
      const r2 = await postJson("/api/cliente/ordini", body);
      check("6b. retry buy-now → 200 giaEsistente", r2.status === 200 && r2.data?.giaEsistente === true, { status: r2.status });
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`KLARNA ORCHESTRAZIONE TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST KLARNA ORCHESTRAZIONE ──");
    if (mockKlarna) await mockKlarna.chiudi().catch(() => {});
    if (mockStripe) await mockStripe.chiudi().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}`);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `klarna-%-${ts}%`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `klarna-%-${ts}%`);
        console.log(`  Sweep residui ordini: ${residui}`);
      }
    }
    if (p1 !== null) await db.from("prodotti").update({ quantita_disponibile: 40 }).eq("id", p1);
    if (pB !== null) await db.from("prodotti").update({ quantita_disponibile: 100 }).eq("id", pB);
    if (vM !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 10 }).eq("id", vM);
    if (pV !== null) {
      await db.from("prodotto_varianti").delete().eq("prodotto_id", pV);
      await db.from("prodotti").delete().eq("id", pV);
    }
    for (const id of [p1, pB]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    for (const id of [negozioAId, negozioBId]) {
      if (id) {
        await db.from("negozio_pagamenti").delete().eq("negozio_id", id);
        await db.from("negozi").delete().eq("id", id);
      }
    }
    fermaServer();
    console.log("  Dati di test eliminati (eventi, sessioni, ordini, stock, varianti, prodotti, negozi, config).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
