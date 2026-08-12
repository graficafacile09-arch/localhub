/**
 * P2 TEST — CHECKOUT CARTA DAL CARRELLO MULTI-RIGA (mock HTTP Stripe).
 *
 * Verifica il punto P2 emerso dalla verifica browser F2 con il codice
 * ATTUALE (stesso di produzione, commit deployato): il flusso carta dal
 * carrello multi-riga. Unico layer simulato: il server HTTP Stripe (mock
 * locale). DB, RPC, orchestratore (creaSessioneStripePerOrdine) e webhook
 * (gestisciWebhookStripe) sono quelli di produzione.
 *
 *   T1   2 negozi di test con Stripe attivo + prodotti (2 nello stesso
 *        negozio, uno con VARIANTE) + prodotto nel secondo negozio;
 *   T2   carrello multi-riga (API route) → ordine multi-riga negozio A e
 *        ordine negozio B (2 ordini separati, totale con spedizione ×1);
 *   T3   Sessione Stripe ordine A: UN line_item per ogni ordini_righe +
 *        spedizione; quantità/prezzi/variante dagli snapshot DB;
 *        totale sessione = ordine.totale ESATTAMENTE;
 *   T4   payment_provider='stripe' e payment_status='pending' sul DB;
 *   T5   client_reference_id = ordineId (una sessione per ordine);
 *   T6   retry → STESSA sessione, zero nuove chiamate a Stripe;
 *   T7   webhook checkout.session.completed (firma valida) → paid,
 *        provider resta 'stripe', sessione paid;
 *   T8   webhook DUPLICATO → idempotente (un solo evento, non riprocessato);
 *   T9   MULTI-NEGOZIO: 2 ordini → 2 sessioni Stripe SEPARATE (mai una
 *        sessione multi-negozio), redirectUrl/sessioneId distinti;
 *   T10  regressione buy-now (POST /api/cliente/ordini) invariato.
 *
 * Cleanup COMPLETO nel finally (ordini, sessioni, eventi, stock, varianti,
 * prodotti, negozi, config Stripe di test, mock, server).
 *
 * Uso: npx tsx scripts/test-p2-carta-carrello.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { chiavePerNegozio } from "../lib/cliente/ordini-carrello";
import { creaSessioneStripePerOrdine } from "../lib/pagamenti/sessioni";
import { gestisciWebhookStripe } from "../lib/pagamenti/webhook-stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

/** Chiave di cifratura TEST per le credenziali Stripe dei negozi P2. */
const CHIAVE_P2 = "chiave-p2-carta-multiriga-test-0001";
/** Webhook secret TEST condiviso dai negozi P2. */
const WH_SEC_P2 = "whsec_p2_test";

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

const PORTA = Number(process.env.P2_PORT ?? 3147);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "p2-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA, {
    cwd: PROGETTO,
    env: {
      ...process.env,
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
        "Server dev terminato inaspettatamente (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "p2-next-dev.log")
      );
    }
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini/carrello`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.8.8.8" },
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
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "p2-next-dev.log"));
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
// Mock Stripe (cattura il body delle chiamate a /v1/checkout/sessions)
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
        const id = `cs_test_p2_${contatore}`;
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

  return new Promise<{ port: number; chiamate: typeof chiamate; chiudi: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        resolve({ port, chiamate, chiudi: () => new Promise((r) => server.close(() => r())) });
      });
    }
  );
}

/** Parser del body form-urlencoded dell'SDK Stripe. */
function parseFormUrlencoded(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const coppia of body.split("&")) {
    const eq = coppia.indexOf("=");
    if (eq < 0) continue;
    const k = decodeURIComponent(coppia.slice(0, eq).replace(/\+/g, "%20"));
    const v = decodeURIComponent(coppia.slice(eq + 1).replace(/\+/g, "%20"));
    out[k] = v;
  }
  return out;
}

type LineItemCatturato = { quantity: number; unitAmount: number; currency: string; name: string };

/** Estrae i line item dal body (line_items[0][price_data][unit_amount]=...). */
function lineItemsDaBody(body: string): LineItemCatturato[] {
  const campi = parseFormUrlencoded(body);
  const mappa = new Map<number, LineItemCatturato>();
  for (const [k, v] of Object.entries(campi)) {
    const m = k.match(/^line_items\[(\d+)\]\[(.*)\]$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const campo = m[2];
    const riga = mappa.get(idx) ?? { quantity: 0, unitAmount: 0, currency: "", name: "" };
    if (campo === "quantity") riga.quantity = Number(v);
    else if (campo === "price_data][unit_amount") riga.unitAmount = Number(v);
    else if (campo === "price_data][currency") riga.currency = v;
    else if (campo === "price_data][product_data][name") riga.name = v;
    mappa.set(idx, riga);
  }
  return [...mappa.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

// ════════════════════════════════════════════════════════════════════
// Helpers HTTP
// ════════════════════════════════════════════════════════════════════

let ipCounter = 50;

function ipProva(): string {
  ipCounter += 1;
  return `10.7.0.${ipCounter}`;
}

type RispostaJson = {
  status: number;
  success?: boolean;
  data?: { ordini?: any[]; errori?: any[]; ordine?: any; giaEsistente?: boolean };
  error?: { code?: string; message?: string };
};

async function postJson(path: string, body: unknown): Promise<RispostaJson> {
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
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_P2;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const ts = Date.now();

  // ── Dati di test ────────────────────────────────────────────────────────
  let negozioAId: string | null = null;
  let negozioBId: string | null = null;
  let p1: number | null = null; // negozio A: 10.00, stock 40
  let p2: number | null = null; // negozio A: 20.50, stock 25
  let pV: number | null = null; // negozio A: ha_varianti (padre)
  let vM: string | null = null; // variante M: 6.00, stock 10
  let vL: string | null = null; // variante L: 5.50, stock 8
  let pB: number | null = null; // negozio B: 3.00, stock 100

  const chiaviOrdini: string[] = [];
  const ordiniCreati: string[] = [];
  let mockStripe: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;

  try {
    // ── T1: setup 2 negozi con Stripe attivo + prodotti (variante) ────────
    console.log("\n[T1] Setup: 2 negozi con Stripe attivo, prodotti e variante");
    const { data: nA } = await db.from("negozi").insert({ nome: `P2-StoreA-${ts}`, slug: `p2-storea-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioAId = String(nA!.id);
    const { data: nB } = await db.from("negozi").insert({ nome: `P2-StoreB-${ts}`, slug: `p2-storeb-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioBId = String(nB!.id);

    // Stripe ATTIVO (test mode) su ENTRAMBI i negozi, cifrato con CHIAVE_P2.
    for (const nid of [negozioAId, negozioBId]) {
      const { error: cfgErr } = await db.rpc("pagamenti_credenziali_salva", {
        p_negozio_id: nid,
        p_provider: "stripe",
        p_attivo: true,
        p_test_mode: true,
        p_secret: "sk_test_p2_mock",
        p_webhook_secret: WH_SEC_P2,
        p_chiave: CHIAVE_P2,
      });
      if (cfgErr) fail("Salvataggio config Stripe P2 fallito: " + cfgErr.message);
    }
    check("Stripe attivo su entrambi i negozi P2", true);

    const { data: q1 } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `P2-ProdottoA1-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false }).select("id").single();
    p1 = Number(q1!.id);
    const { data: q2 } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `P2-ProdottoA2-${ts}`, prezzo: 20.5, quantita_disponibile: 25, attivo: true, ha_varianti: false }).select("id").single();
    p2 = Number(q2!.id);
    const { data: qv } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `P2-ProdottoVarianti-${ts}`, prezzo: 5.0, quantita_disponibile: 0, attivo: true, ha_varianti: true }).select("id").single();
    pV = Number(qv!.id);
    const { data: v1 } = await db.from("prodotto_varianti").insert({ prodotto_id: pV, nome: "P2-Variante M", attributi: { taglia: "M" }, prezzo: 6.0, quantita_disponibile: 10, quantita_riservata: 0, attivo: true }).select("id").single();
    vM = String(v1!.id);
    const { data: v2 } = await db.from("prodotto_varianti").insert({ prodotto_id: pV, nome: "P2-Variante L", attributi: { taglia: "L" }, prezzo: 5.5, quantita_disponibile: 8, quantita_riservata: 0, attivo: true }).select("id").single();
    vL = String(v2!.id);
    const { data: qB } = await db.from("prodotti").insert({ negozio_id: negozioBId, nome: `P2-ProdottoB-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false }).select("id").single();
    pB = Number(qB!.id);

    const ids = { p1: String(p1), p2: String(p2), pV: String(pV), vM: String(vM), vL: String(vL), pB: String(pB) };

    const baseCheckout = {
      modalita: "spedizione" as const,
      cliente: { nome: "Mario", cognome: "P2", telefono: "3331234567", email: "p2@localhub.test" },
      spedizione: {
        indirizzo: "Via Test 1", cap: "87100", citta: "Cosenza", provincia: "CS",
        metodoSpedizione: "standard" as const, metodoPagamento: "bonifico" as const,
      },
    };

    mockStripe = await avviaMockStripe();
    const gatewayOpts = { host: "127.0.0.1", port: mockStripe.port, protocol: "http" as const };

    await avviaServer();

    // ── T2: carrello multi-riga via API → 2 ordini separati ───────────────
    console.log("\n[T2] Checkout carrello multi-riga (2 prodotti negozio A con variante + 1 negozio B)");
    let ordineAId: string | null = null;
    let ordineAIdTotale = 0;
    let ordineBId: string | null = null;
    let ordineBIdTotale = 0;
    {
      const key = `p2-t2-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.p1, varianteId: null, quantita: 2 },      // negozio A: 10×2
          { prodottoId: ids.pV, varianteId: ids.vM, quantita: 1 },    // negozio A: variante M 6×1
          { prodottoId: ids.pB, varianteId: null, quantita: 2 },      // negozio B: 3×2
        ],
      });
      check("HTTP 201", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("2 ordini separati (uno per negozio)", ordini.length === 2, ordini.map((o: any) => o.negozioId));
      const oA = ordini.find((o: any) => String(o.negozioId) === negozioAId);
      const oB = ordini.find((o: any) => String(o.negozioId) === negozioBId);
      check("ordine A: 2 righe (1 legacy + 1 variante)", Array.isArray(oA?.righe) && oA.righe.length === 2, oA?.righe);
      check("ordine A: totale = 31.90 (10×2 + 6×1 + 5.90 spedizione)", oA && Number(oA.totale) === 31.9, oA?.totale);
      check("ordine B: totale = 11.90 (3×2 + 5.90)", oB && Number(oB.totale) === 11.9, oB?.totale);
      ordineAId = String(oA?.ordineId ?? "");
      ordineAIdTotale = Number(oA?.totale ?? 0);
      ordineBId = String(oB?.ordineId ?? "");
      ordineBIdTotale = Number(oB?.totale ?? 0);
      if (!ordineAId || !ordineBId) fail("T2: ordini non creati");
      ordiniCreati.push(ordineAId, ordineBId);
      chiaviOrdini.push(chiavePerNegozio(key, negozioAId!), chiavePerNegozio(key, negozioBId!));
    }

    // ── T3–T5: sessione Stripe ordine A multi-riga + coerenza totale ──────
    console.log("\n[T3-T5] Sessione Stripe ordine A: line item per riga DB + coerenza totale");
    {
      const sessione = await creaSessioneStripePerOrdine(ordineAId!, gatewayOpts);
      check("sessione A creata con redirectUrl", sessione.ok === true && "redirectUrl" in sessione, sessione);
      if (!sessione.ok) fail("T3: sessione A fallita: " + sessione.errore);

      const items = lineItemsDaBody(mockStripe.chiamate[mockStripe.chiamate.length - 1].body);
      check("3 line item (2 prodotti + spedizione)", items.length === 3, items);
      const rigaP1 = items.find((i) => i.unitAmount === 1000);
      check("prodotto A1: 1000 centesimi ×2 (prezzo DB)", rigaP1?.unitAmount === 1000 && rigaP1?.quantity === 2, rigaP1);
      const rigaVM = items.find((i) => i.unitAmount === 600);
      check("variante M: 600 centesimi ×1 (prezzo VARIANTE, non padre)", rigaVM?.unitAmount === 600 && rigaVM?.quantity === 1, rigaVM);
      check("variante inclusa nel nome", String(rigaVM?.name ?? "").includes("P2-Variante M"), rigaVM?.name);
      const rigaSped = items.find((i) => i.unitAmount === 590);
      check("spedizione: 590 centesimi ×1", rigaSped?.unitAmount === 590 && rigaSped?.quantity === 1, rigaSped);

      // Totale sessione = somma line item = ordine.totale ESATTAMENTE.
      const totaleCentesimi = items.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
      check(`totale sessione = ordine.totale (${Math.round(ordineAIdTotale * 100)})`, totaleCentesimi === Math.round(ordineAIdTotale * 100), totaleCentesimi);

      // T6 di F2.3-style: nessun prezzo dal client — confronta con snapshot ordini_righe.
      const { data: righeDb } = await db.from("ordini_righe").select("nome_prodotto, prezzo_unitario, quantita, variante_nome").eq("ordine_id", ordineAId).order("created_at", { ascending: true });
      const attesi = (righeDb ?? []).map((r: any) => ({ prezzo: Math.round(Number(r.prezzo_unitario) * 100), qta: Number(r.quantita), nome: String(r.nome_prodotto ?? "") }));
      const catturatiProdotti = items.filter((i) => i.name !== "Spedizione");
      check(
        "prezzi/quantità line item == snapshot ordini_righe (mai dal client)",
        attesi.length === catturatiProdotti.length &&
          attesi.every((a: any, i: number) => a.prezzo === catturatiProdotti[i]?.unitAmount && a.qta === catturatiProdotti[i]?.quantity),
        { attesi, catturati: catturatiProdotti }
      );

      // T4: payment_provider/payment_status sul DB.
      const { data: ordineDb } = await db.from("ordini").select("payment_provider, payment_status, payment_id, payment_amount").eq("id", ordineAId).single();
      check("payment_provider = 'stripe'", ordineDb?.payment_provider === "stripe", ordineDb?.payment_provider);
      check("payment_status = 'pending'", ordineDb?.payment_status === "pending", ordineDb?.payment_status);
      check("payment_amount = ordine.totale", Number(ordineDb?.payment_amount ?? 0) === ordineAIdTotale, ordineDb?.payment_amount);

      // T5: client_reference_id = ordineId nella chiamata a Stripe.
      const body = decodeURIComponent(mockStripe.chiamate[mockStripe.chiamate.length - 1].body);
      check("client_reference_id = ordineId", body.includes(`client_reference_id=${ordineAId}`), body.slice(0, 200));
    }

    // ── T6: retry → stessa sessione, zero nuove chiamate ───────────────────
    console.log("\n[T6] Retry → stessa sessione attiva, zero nuove chiamate");
    {
      const nPrima = mockStripe!.chiamate.length;
      const retry = await creaSessioneStripePerOrdine(ordineAId!, gatewayOpts);
      check("retry ok + giaEsistente=true", retry.ok && "giaEsistente" in retry && retry.giaEsistente === true, retry);
      check("nessuna nuova chiamata HTTP a Stripe", mockStripe!.chiamate.length === nPrima, mockStripe!.chiamate.length);
      const { count } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("ordine_id", ordineAId).in("status", ["created", "pending"]);
      check("una sola sessione attiva per ordine", Number(count ?? 0) === 1, count);
    }

    // ── T7–T8: webhook completed → paid + idempotenza ──────────────────────
    console.log("\n[T7-T8] Webhook checkout.session.completed → paid (firma valida) + idempotenza");
    {
      const { data: sessioneDb } = await db.from("pagamenti_sessioni").select("payment_id, amount").eq("ordine_id", ordineAId).single();
      const paymentIdSessione = String(sessioneDb?.payment_id ?? "");
      const importoSessione = Number(sessioneDb?.amount ?? 0);
      const payloadWebhook = JSON.stringify({
        id: "evt_p2_completed_1",
        object: "event",
        api_version: "2024-06-20",
        type: "checkout.session.completed",
        data: {
          object: {
            id: paymentIdSessione,
            client_reference_id: ordineAId,
            metadata: { ordine_id: ordineAId, negozio_id: negozioAId },
            payment_status: "paid",
            amount_total: Math.round(importoSessione * 100),
            currency: "eur",
            payment_intent: "pi_test_p2",
          },
        },
      });
      const header = Stripe.webhooks.generateTestHeaderString({ payload: payloadWebhook, secret: WH_SEC_P2 });
      const esito = await gestisciWebhookStripe(payloadWebhook, new Headers({ "stripe-signature": header }));
      check("webhook completed → HTTP 200", esito.status === 200, esito);

      const { data: ordineDb } = await db.from("ordini").select("payment_status, payment_provider, payment_transaction_id, payment_paid_at").eq("id", ordineAId).single();
      check("payment_status = 'paid'", ordineDb?.payment_status === "paid", ordineDb?.payment_status);
      check("payment_provider RESTA 'stripe'", ordineDb?.payment_provider === "stripe", ordineDb?.payment_provider);
      check("payment_transaction_id = pi_test_p2", ordineDb?.payment_transaction_id === "pi_test_p2", ordineDb?.payment_transaction_id);
      check("payment_paid_at valorizzato", Boolean(ordineDb?.payment_paid_at), ordineDb?.payment_paid_at);

      const { data: sessionePost } = await db.from("pagamenti_sessioni").select("status").eq("ordine_id", ordineAId).single();
      check("sessione A → status 'paid'", sessionePost?.status === "paid", sessionePost);

      // T8: duplicato → idempotente, non riprocessato.
      const esito2 = await gestisciWebhookStripe(payloadWebhook, new Headers({ "stripe-signature": header }));
      check("webhook duplicato → 200 'già processato'", esito2.status === 200, esito2);
      const { count } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", "evt_p2_completed_1");
      check("un solo evento nel DB (idempotenza)", Number(count ?? 0) === 1, count);
    }

    // ── T9: multi-negozio → 2 sessioni SEPARATE ────────────────────────────
    console.log("\n[T9] MULTI-NEGOZIO: 2 ordini → 2 sessioni Stripe separate");
    {
      const nChiamatePrima = mockStripe!.chiamate.length;
      const sessioneB = await creaSessioneStripePerOrdine(ordineBId!, gatewayOpts);
      check("sessione B creata", sessioneB.ok === true, sessioneB);
      if (!sessioneB.ok) fail("T9: sessione B fallita: " + sessioneB.errore);

      const bodyB = decodeURIComponent(mockStripe.chiamate[mockStripe.chiamate.length - 1].body);
      check("client_reference_id B = ordine B", bodyB.includes(`client_reference_id=${ordineBId}`), bodyB.slice(0, 200));
      const itemsB = lineItemsDaBody(mockStripe.chiamate[mockStripe.chiamate.length - 1].body);
      const totaleB = itemsB.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
      check(`totale sessione B = ordine B (${Math.round(ordineBIdTotale * 100)})`, totaleB === Math.round(ordineBIdTotale * 100), totaleB);

      // Una nuova chiamata per la sessione B (mai una sessione multi-negozio).
      check("1 nuova chiamata a Stripe per la sessione B", mockStripe!.chiamate.length === nChiamatePrima + 1, mockStripe!.chiamate.length);

      // 2 sessioni distinte (una per ordine, mai una condivisa). Nota: la
      // sessione A è già 'paid' per il webhook di T7, quindi NON si filtra per
      // status: contiamo tutte le sessioni dei due ordini.
      const { data: sessioni } = await db.from("pagamenti_sessioni").select("ordine_id, payment_id, status").in("ordine_id", [ordineAId, ordineBId]);
      check("2 sessioni totali (una per ordine, A paid + B created)", (sessioni ?? []).length === 2, sessioni);
      check("sessioni su ordini DIVERSI", new Set((sessioni ?? []).map((s) => s.ordine_id)).size === 2, sessioni);
      check("payment_id distinti", new Set((sessioni ?? []).map((s) => s.payment_id)).size === 2, sessioni);

      // Ordine B resta pending (non toccato dal webhook di A).
      const { data: oB } = await db.from("ordini").select("payment_status, payment_provider").eq("id", ordineBId).single();
      check("ordine B: pending + provider stripe", oB?.payment_status === "pending" && oB?.payment_provider === "stripe", oB);
    }

    // ── T10: regressione buy-now ───────────────────────────────────────────
    console.log("\n[T10] Regressione buy-now POST /api/cliente/ordini (invariato)");
    {
      const key = `p2-bn-${ts}`;
      const body = {
        idempotencyKey: key,
        prodottoId: ids.p1,
        varianteId: null,
        quantita: 1,
        modalita: "spedizione",
        cliente: { nome: "Anna", cognome: "P2", telefono: null, email: "p2-bn@localhub.test" },
        spedizione: {
          indirizzo: "Via Test 2", cap: "87100", citta: "Cosenza", provincia: "CS",
          metodoSpedizione: "standard", metodoPagamento: "bonifico",
        },
      };
      const r1 = await postJson("/api/cliente/ordini", body);
      check("buy-now → 201 con ordine", r1.status === 201 && Boolean(r1.data?.ordine?.id), { status: r1.status, ordine: r1.data?.ordine });
      const primoId = r1.data?.ordine?.id;
      if (!primoId) fail("T10: buy-now senza ordine");
      ordiniCreati.push(String(primoId));
      chiaviOrdini.push(key);
      const r2 = await postJson("/api/cliente/ordini", body);
      check("retry buy-now → 200 giaEsistente", r2.status === 200 && r2.data?.giaEsistente === true, { status: r2.status });
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`P2 CARTA MULTI-RIGA TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST P2 ──");
    if (mockStripe) await mockStripe.chiudi().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      const { error: delOrdini } = await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}${delOrdini ? " (ERRORE: " + delOrdini.message + ")" : ""}`);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `p2-%-${ts}%`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `p2-%-${ts}%`);
        console.log(`  Sweep residui ordini: ${residui} eliminati`);
      }
    }
    // Ripristino stock ai valori iniziali
    if (p1 !== null) await db.from("prodotti").update({ quantita_disponibile: 40 }).eq("id", p1);
    if (p2 !== null) await db.from("prodotti").update({ quantita_disponibile: 25 }).eq("id", p2);
    if (pB !== null) await db.from("prodotti").update({ quantita_disponibile: 100 }).eq("id", pB);
    if (vM !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 10 }).eq("id", vM);
    if (vL !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 8 }).eq("id", vL);
    // Varianti → prodotti → negozi → config Stripe di test
    if (pV !== null) {
      await db.from("prodotto_varianti").delete().eq("prodotto_id", pV);
      await db.from("prodotti").delete().eq("id", pV);
    }
    for (const id of [p1, p2, pB]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    for (const id of [negozioAId, negozioBId]) {
      if (id) {
        await db.from("negozio_pagamenti").delete().eq("negozio_id", id).eq("provider", "stripe");
        await db.from("negozi").delete().eq("id", id);
      }
    }
    fermaServer();
    console.log("  Dati di test P2 eliminati (ordini, sessioni, eventi, stock, varianti, prodotti, negozi, config).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
