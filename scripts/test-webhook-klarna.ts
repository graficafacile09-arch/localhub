/**
 * TEST WEBHOOK KLARNA — server dev reale + Supabase reale + mock HTTP.
 *
 * Verifica il ciclo end-to-end del webhook Klarna (/api/webhook/pagamenti/klarna):
 * firma HMAC-SHA256 fail-closed, idempotenza via pagamenti_eventi, mapping
 * eventi sulla macchina a stati esistente, importo fail-closed, e che un
 * ordine Stripe non venga MAI toccato. Unici layer simulati: l'HTTP di
 * Klarna e Stripe (creazione sessioni, pattern F1/F2.3) e la firma (HMAC
 * calcolato localmente con il webhook secret di test).
 *
 * Copertura richiesta:
 *   1.  evento AUTHORIZED/CAPTURED valido → 200 + ordine paid;
 *   2.  pagamento → paid;
 *   3.  provider resta klarna;
 *   4.  transaction reference salvata (capture_id);
 *   5.  firma valida;
 *   6.  firma invalida → 400, ordine NON modificato;
 *   7.  firma mancante → 400;
 *   8.  secret errato → 400;
 *   9.  evento duplicato → idempotente (nessuna rielaborazione);
 *   10. evento sconosciuto → registrato ma ignorato (ordine intatto);
 *   11. importo mismatch → fail-closed (ordine NON pagato);
 *   12. CANCELLED → canceled;
 *   13. EXPIRED + ripristino stock;
 *   14. REFUNDED → refunded (+ payment_refunded_at);
 *   15. ordine Stripe NON toccato;
 *   16. nessun dato modificato prima della verifica firma.
 *
 * Cleanup COMPLETO nel finally (eventi, sessioni, ordini, stock, varianti,
 * prodotti, negozi, config, mock, server).
 *
 * Uso: npx tsx scripts/test-webhook-klarna.ts
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
import { creaSessionePagamentoPerOrdine } from "../lib/pagamenti/sessioni";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const CHIAVE_TEST = "chiave-webhook-klarna-test-0001";
const WH_SECRET_KLARNA = "whsec_klarna_webhook_test";
const WH_SECRET_STRIPE = "whsec_stripe_webhook_test";

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

const PORTA = Number(process.env.WEBHOOK_KLARNA_PORT ?? 3151);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "webhook-klarna-next-dev.log"), { flags: "w" });
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
        "Server dev terminato inaspettatamente (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "webhook-klarna-next-dev.log")
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
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "webhook-klarna-next-dev.log"));
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
// Mock Klarna (creazione sessioni: POST /checkout/v3/orders)
// ════════════════════════════════════════════════════════════════════

function avviaMockKlarna() {
  const chiamate: Array<{ method: string; url: string; body: unknown }> = [];
  let contatore = 0;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += String(c)));
    req.on("end", () => {
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {}
      chiamate.push({ method: req.method ?? "GET", url: req.url ?? "", body });

      if (req.method === "POST" && req.url === "/checkout/v3/orders") {
        contatore++;
        const orderId = `klarna_wh_${contatore}`;
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
      res.end(JSON.stringify({ error_code: "NOT_FOUND" }));
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
// Mock Stripe (sessione ordine per il test 15)
// ════════════════════════════════════════════════════════════════════

function avviaMockStripe() {
  const server: Server = createServer((req, res) => {
    if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
      const id = "cs_test_wh_15";
      return res
        .writeHead(200, { "content-type": "application/json" })
        .end(
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

  return new Promise<{ port: number; chiudi: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, chiudi: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// Helpers HTTP
// ════════════════════════════════════════════════════════════════════

let ipCounter = 80;

function ipProva(): string {
  ipCounter += 1;
  return `10.8.1.${ipCounter}`;
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

/** Firma Klarna: Base64(HMAC-SHA256(body RAW, webhook secret)). */
function firmaKlarna(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

/** Invia un evento al webhook Klarna con firma calcolata localmente. */
async function inviaEventoKlarna(
  payload: Record<string, unknown>,
  opts: { secret?: string; signatureOverride?: string } = {}
): Promise<{ status: number; body: string }> {
  const raw = JSON.stringify(payload);
  const secret = opts.secret ?? WH_SECRET_KLARNA;
  const signature = opts.signatureOverride ?? firmaKlarna(raw, secret);
  const res = await fetch(`${BASE}/api/webhook/pagamenti/klarna`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "klarna-signature": signature,
    },
    body: raw,
  });
  return { status: res.status, body: await res.text() };
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

  let negozioKId: string | null = null;
  let negozioSId: string | null = null;
  let p1: number | null = null; // 10.00 stock 40 (negozio Klarna)
  let pStock: number | null = null; // 10.00 stock 40 dedicato al test EXPIRED
  let pS: number | null = null; // 3.00 stock 100 (negozio Stripe)
  const ordiniCreati: string[] = [];
  let mockKlarna: Awaited<ReturnType<typeof avviaMockKlarna>> | null = null;
  let mockStripe: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;

  try {
    // ── Setup ────────────────────────────────────────────────────────────
    console.log("\n[T0] Setup: negozio Klarna + negozio Stripe + prodotti");
    const { data: nK } = await db.from("negozi").insert({ nome: `WhKlarna-A-${ts}`, slug: `whklarna-a-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioKId = String(nK!.id);
    const { data: nS } = await db.from("negozi").insert({ nome: `WhKlarna-B-${ts}`, slug: `whklarna-b-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioSId = String(nS!.id);

    const cfgK = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioKId,
      p_provider: "klarna",
      p_attivo: true,
      p_test_mode: true,
      p_client_id: "api_username_test",
      p_secret: "api_password_test",
      p_webhook_secret: WH_SECRET_KLARNA,
      p_chiave: CHIAVE_TEST,
    });
    if ((cfgK.data as { ok?: boolean } | null)?.ok !== true) {
      fail("Config Klarna fallita: " + JSON.stringify(cfgK.error ?? cfgK.data));
    }
    const cfgS = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioSId,
      p_provider: "stripe",
      p_attivo: true,
      p_test_mode: true,
      p_secret: "sk_test_wh_mock",
      p_webhook_secret: WH_SECRET_STRIPE,
      p_chiave: CHIAVE_TEST,
    });
    if ((cfgS.data as { ok?: boolean } | null)?.ok !== true) {
      fail("Config Stripe fallita: " + JSON.stringify(cfgS.error ?? cfgS.data));
    }
    check("config Klarna + Stripe salvate (RPC)", true);

    const { data: q1 } = await db.from("prodotti").insert({ negozio_id: negozioKId, nome: `WhKlarna Pane-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false, peso_grammi: 1000 }).select("id").single();
    p1 = Number(q1!.id);
    const { data: qS } = await db.from("prodotti").insert({ negozio_id: negozioSId, nome: `WhStripe Dolce-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false, peso_grammi: 1000 }).select("id").single();
    pS = Number(qS!.id);
    // Prodotto DEDICATO al test EXPIRED: stock 40, nessun altro ordine lo tocca.
    const { data: qStock } = await db.from("prodotti").insert({ negozio_id: negozioKId, nome: `WhKlarna Stock-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false, peso_grammi: 1000 }).select("id").single();
    pStock = Number(qStock!.id);

    mockKlarna = await avviaMockKlarna();
    mockStripe = await avviaMockStripe();
    const klarnaOpts = { baseUrl: `http://127.0.0.1:${mockKlarna.port}` };
    const stripeOpts = { host: "127.0.0.1", port: mockStripe.port, protocol: "http" as const };

    await avviaServer();

    /** Crea un ordine (bonifico) via route e lo porta a pending+klarna con sessione reale (mock). */
    async function creaOrdineKlarna(prefix: string, quantita: number, idempotencyKey: string): Promise<string> {
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: idempotencyKey,
        modalita: "spedizione",
        cliente: { nome: "Mario", cognome: "WhKlarna", telefono: "3331234567", email: "wh-klarna@localhub.test" },
        spedizione: {
          indirizzo: "Via Test 1", cap: "87100", citta: "Cosenza", provincia: "CS",
          carrier: "poste_italiane", servizio: "standard", metodoPagamento: "bonifico",
        },
        righe: [{ prodottoId: String(p1), varianteId: null, quantita }],
      });
      const ordine = esito.data?.ordini?.[0];
      if (esito.status !== 201 || !ordine?.ordineId) {
        fail(`${prefix}: ordine non creato (${esito.status}): ` + JSON.stringify(esito.data ?? esito.error ?? ""));
      }
      const ordineId = String(ordine.ordineId);
      ordiniCreati.push(ordineId);
      const sessione = await creaSessionePagamentoPerOrdine(ordineId, "klarna", klarnaOpts);
      if (!sessione.ok) fail(`${prefix}: sessione klarna fallita: ${sessione.errore}`);
      return ordineId;
    }

    // ── T1-T5: AUTHORIZED → paid, firma valida, provider klarna ─────────
    console.log("\n[T1-T5] Evento AUTHORIZED valido → ordine paid");
    let ordineAId: string | null = null;
    {
      const key = `whk-t1-${ts}`;
      const ordineId = await creaOrdineKlarna("T1", 2, key);
      ordineAId = ordineId;
      const { data: ord } = await db.from("ordini").select("id, totale, payment_id, payment_provider, payment_status").eq("id", ordineId).single();
      check("1a. ordine creato con sessione klarna (pending)", ord?.payment_status === "pending" && ord?.payment_provider === "klarna", ord);
      const paymentId = String(ord?.payment_id ?? "");

      const totaleCentesimi = Math.round(Number(ord?.totale ?? 0) * 100);
      const evento = {
        event_id: `evt_klarna_paid_${ts}`,
        event_type: "checkout.order_completed",
        order_id: paymentId,
        order_amount: totaleCentesimi,
      };
      const esito = await inviaEventoKlarna(evento);
      check("5a. firma valida → HTTP 200", esito.status === 200, esito);
      check("5b. body OK", esito.body === "OK", esito.body);

      const { data: dopo } = await db.from("ordini").select("payment_status, payment_provider, payment_paid_at, payment_id").eq("id", ordineId).single();
      check("1b. AUTHORIZED → payment_status=paid", dopo?.payment_status === "paid", dopo);
      check("2.  pagamento → paid (payment_paid_at valorizzato)", Boolean(dopo?.payment_paid_at), dopo);
      check("3.  provider resta klarna", dopo?.payment_provider === "klarna", dopo);
      check("4.  payment_id = order_id Klarna", String(dopo?.payment_id ?? "") === paymentId, dopo);

      const { data: sessione } = await db.from("pagamenti_sessioni").select("status").eq("ordine_id", ordineId).single();
      check("sessione marcata paid", sessione?.status === "paid", sessione);
    }

    // ── T9: duplicato → idempotente ─────────────────────────────────────
    console.log("\n[T9] Evento duplicato → idempotente");
    {
      const { data: ord } = await db.from("ordini").select("payment_id, totale").eq("id", ordineAId).single();
      const paymentId = String(ord?.payment_id ?? "");
      const evento = {
        event_id: `evt_klarna_paid_${ts}`,
        event_type: "checkout.order_completed",
        order_id: paymentId,
        order_amount: Math.round(Number(ord?.totale ?? 0) * 100),
      };
      const esito = await inviaEventoKlarna(evento);
      check("9a. duplicato → HTTP 200 idempotente", esito.status === 200, esito);
      check("9b. body 'già processato'", esito.body === "Evento già processato.", esito.body);
      const { count } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", `evt_klarna_paid_${ts}`);
      check("9c. un solo evento registrato (nessuna rielaborazione)", Number(count ?? 0) === 1, count);
    }

    // ── T10: evento sconosciuto → registrato ma ignorato ────────────────
    console.log("\n[T10] Evento sconosciuto → gestione sicura");
    {
      const { data: ord } = await db.from("ordini").select("payment_id, payment_status").eq("id", ordineAId).single();
      const evento = {
        event_id: `evt_klarna_unknown_${ts}`,
        event_type: "order.phone_updated",
        order_id: String(ord?.payment_id ?? ""),
      };
      const esito = await inviaEventoKlarna(evento);
      check("10a. evento sconosciuto → 200", esito.status === 200, esito);
      const { data: dopo } = await db.from("ordini").select("payment_status").eq("id", ordineAId).single();
      check("10b. ordine intatto (resta paid)", dopo?.payment_status === "paid", dopo);
      const { count } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", `evt_klarna_unknown_${ts}`).eq("status", "processed");
      check("10c. evento registrato e marcato processed", Number(count ?? 0) === 1, count);
    }

    // ── T6-T8 / T16: firme invalide → fail-closed ───────────────────────
    console.log("\n[T6-T8/T16] Firma invalida/mancante/secret errato → fail-closed, nessun dato modificato");
    {
      const { data: ord } = await db.from("ordini").select("payment_id, payment_status, payment_paid_at").eq("id", ordineAId).single();
      const paymentId = String(ord?.payment_id ?? "");

      // T6: firma invalida (garbage)
      const evt6 = { event_id: `evt_bad_sig_${ts}`, event_type: "checkout.order_completed", order_id: paymentId };
      const r6 = await inviaEventoKlarna(evt6, { signatureOverride: "firma-invalida" });
      check("6a. firma invalida → HTTP 400", r6.status === 400, r6);
      check("6b. ordine NON modificato", (await db.from("ordini").select("payment_status, payment_paid_at").eq("id", ordineAId).single()).data?.payment_status === "paid");
      const { count: c6 } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", `evt_bad_sig_${ts}`);
      check("16a. nessun evento registrato prima della verifica firma", Number(c6 ?? 0) === 0, c6);

      // T7: firma mancante
      const raw7 = JSON.stringify({ event_id: `evt_no_sig_${ts}`, event_type: "checkout.order_completed", order_id: paymentId });
      const r7 = await fetch(`${BASE}/api/webhook/pagamenti/klarna`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw7,
      });
      check("7a. firma mancante → HTTP 400", r7.status === 400, r7.status);
      const { count: c7 } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", `evt_no_sig_${ts}`);
      check("16b. nessun evento registrato (firma mancante)", Number(c7 ?? 0) === 0, c7);

      // T8: secret errato (firma con un altro secret)
      const evt8 = { event_id: `evt_wrong_secret_${ts}`, event_type: "checkout.order_completed", order_id: paymentId };
      const r8 = await inviaEventoKlarna(evt8, { secret: "whsec_sbagliato" });
      check("8a. secret errato → HTTP 400", r8.status === 400, r8);
      const { count: c8 } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", `evt_wrong_secret_${ts}`);
      check("16c. nessun evento registrato (secret errato)", Number(c8 ?? 0) === 0, c8);
    }

    // ── T11: importo mismatch → fail-closed ─────────────────────────────
    console.log("\n[T11] Importo mismatch → fail-closed (ordine NON pagato)");
    let ordineMismatchId: string | null = null;
    {
      const ordineId = await creaOrdineKlarna("T11", 1, `whk-t11-${ts}`);
      ordineMismatchId = ordineId;
      const { data: ord } = await db.from("ordini").select("payment_id, totale, payment_status").eq("id", ordineId).single();
      const totaleCentesimi = Math.round(Number(ord?.totale ?? 0) * 100);
      const evento = {
        event_id: `evt_mismatch_${ts}`,
        event_type: "checkout.order_completed",
        order_id: String(ord?.payment_id ?? ""),
        order_amount: totaleCentesimi + 100, // importo DIVERSO dal DB
      };
      const esito = await inviaEventoKlarna(evento);
      check("11a. importo mismatch → 200 (evento registrato, errore)", esito.status === 200 && esito.body !== "OK", esito);
      const { data: dopo } = await db.from("ordini").select("payment_status, payment_paid_at").eq("id", ordineId).single();
      check("11b. ordine NON pagato (fail-closed)", dopo?.payment_status === "pending" && dopo?.payment_paid_at === null, dopo);
      const { data: eventoDb } = await db.from("pagamenti_eventi").select("status").eq("event_id", `evt_mismatch_${ts}`).single();
      check("11c. evento marcato error (tracciabile)", eventoDb?.status === "error", eventoDb);
    }

    // ── T12: CANCELLED → canceled ───────────────────────────────────────
    console.log("\n[T12] CANCELLED → canceled");
    {
      const ordineId = await creaOrdineKlarna("T12", 1, `whk-t12-${ts}`);
      const { data: ord } = await db.from("ordini").select("payment_id").eq("id", ordineId).single();
      const evento = {
        event_id: `evt_cancel_${ts}`,
        event_type: "CANCELLED",
        order_id: String(ord?.payment_id ?? ""),
      };
      const esito = await inviaEventoKlarna(evento);
      check("12a. CANCELLED → 200", esito.status === 200, esito);
      const { data: dopo } = await db.from("ordini").select("payment_status").eq("id", ordineId).single();
      check("12b. ordine → canceled", dopo?.payment_status === "canceled", dopo);
      const { data: sessione } = await db.from("pagamenti_sessioni").select("status").eq("ordine_id", ordineId).single();
      check("12c. sessione marcata canceled", sessione?.status === "canceled", sessione);
    }

    // ── T13: EXPIRED + ripristino stock ─────────────────────────────────
    console.log("\n[T13] EXPIRED → scaduto + ripristino stock");
    {
      const quantita = 3;
      const esito13 = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: `whk-t13-${ts}`,
        modalita: "spedizione",
        cliente: { nome: "Mario", cognome: "WhKlarna", telefono: "3331234567", email: "wh-klarna@localhub.test" },
        spedizione: {
          indirizzo: "Via Test 1", cap: "87100", citta: "Cosenza", provincia: "CS",
          carrier: "poste_italiane", servizio: "standard", metodoPagamento: "bonifico",
        },
        righe: [{ prodottoId: String(pStock), varianteId: null, quantita }],
      });
      const ordineId = String(esito13.data?.ordini?.[0]?.ordineId ?? "");
      if (!ordineId) fail("T13: ordine non creato");
      ordiniCreati.push(ordineId);
      const sessione = await creaSessionePagamentoPerOrdine(ordineId, "klarna", klarnaOpts);
      if (!sessione.ok) fail("T13: sessione klarna fallita: " + sessione.errore);

      const { data: prodotto } = await db.from("prodotti").select("quantita_disponibile").eq("id", pStock).single();
      const stockDopoOrdine = Number(prodotto?.quantita_disponibile ?? 0);
      check("13a. stock decrementato alla creazione", stockDopoOrdine === 40 - quantita, stockDopoOrdine);

      const { data: ord } = await db.from("ordini").select("payment_id").eq("id", ordineId).single();
      const evento = {
        event_id: `evt_expired_${ts}`,
        event_type: "ORDER_EXPIRED",
        order_id: String(ord?.payment_id ?? ""),
      };
      const esito = await inviaEventoKlarna(evento);
      check("13b. EXPIRED → 200", esito.status === 200, esito);
      const { data: dopo } = await db.from("ordini").select("payment_status, stato").eq("id", ordineId).single();
      check("13c. ordine scaduto (payment_status=expired o annullato)", dopo?.payment_status === "expired" || dopo?.payment_status === "canceled", dopo);
      const { data: stock } = await db.from("prodotti").select("quantita_disponibile").eq("id", pStock).single();
      check("13d. stock ripristinato (40)", Number(stock?.quantita_disponibile ?? 0) === 40, stock);
    }

    // ── T14: REFUNDED → refunded ────────────────────────────────────────
    console.log("\n[T14] REFUNDED → refunded (+ payment_refunded_at)");
    {
      const ordineId = await creaOrdineKlarna("T14", 1, `whk-t14-${ts}`);
      const { data: ord } = await db.from("ordini").select("payment_id, totale").eq("id", ordineId).single();
      const paymentId = String(ord?.payment_id ?? "");
      const totaleCentesimi = Math.round(Number(ord?.totale ?? 0) * 100);
      // Prima paga (AUTHORIZED), poi rimborsa (REFUNDED).
      const paid = await inviaEventoKlarna({
        event_id: `evt_ref_paid_${ts}`,
        event_type: "checkout.order_completed",
        order_id: paymentId,
        order_amount: totaleCentesimi,
      });
      check("14a. ordine pagato (premessa)", paid.status === 200, paid);
      const refunded = await inviaEventoKlarna({
        event_id: `evt_refund_${ts}`,
        event_type: "REFUND_ACKNOWLEDGED",
        order_id: paymentId,
        refund_id: `ref_${ts}`,
        refunded_amount: totaleCentesimi,
      });
      check("14b. REFUNDED → 200", refunded.status === 200, refunded);
      const { data: dopo } = await db.from("ordini").select("payment_status, payment_refunded_at, payment_refunded_amount, payment_transaction_id").eq("id", ordineId).single();
      check("14c. ordine → refunded", dopo?.payment_status === "refunded", dopo);
      check("14d. payment_refunded_at valorizzato", Boolean(dopo?.payment_refunded_at), dopo);
      check("14e. payment_refunded_amount coerente", Number(dopo?.payment_refunded_amount ?? 0) === Math.round((totaleCentesimi / 100) * 100) / 100, dopo);
      check("14f. transaction reference = refund_id", String(dopo?.payment_transaction_id ?? "") === `ref_${ts}`, dopo);
    }

    // ── T4: CAPTURED con capture_id → transaction reference salvata ─────
    console.log("\n[T4] CAPTURED con capture_id → transaction reference salvata");
    {
      const ordineId = await creaOrdineKlarna("T4", 2, `whk-t4-${ts}`);
      const { data: ord } = await db.from("ordini").select("payment_id, totale").eq("id", ordineId).single();
      const paymentId = String(ord?.payment_id ?? "");
      const totaleCentesimi = Math.round(Number(ord?.totale ?? 0) * 100);
      const esito = await inviaEventoKlarna({
        event_id: `evt_capture_${ts}`,
        event_type: "CAPTURE_ACKNOWLEDGED",
        order_id: paymentId,
        order_amount: totaleCentesimi,
        capture_id: `capture_${ts}`,
      });
      check("4a. CAPTURED → 200", esito.status === 200, esito);
      const { data: dopo } = await db.from("ordini").select("payment_status, payment_transaction_id").eq("id", ordineId).single();
      check("4b. ordine → paid", dopo?.payment_status === "paid", dopo);
      check("4c. transaction reference = capture_id", String(dopo?.payment_transaction_id ?? "") === `capture_${ts}`, dopo);
    }

    // ── T15: ordine Stripe NON toccato ──────────────────────────────────
    console.log("\n[T15] Ordine Stripe NON toccato da eventi Klarna");
    {
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: `whk-s15-${ts}`,
        modalita: "spedizione",
        cliente: { nome: "Anna", cognome: "WhStripe", telefono: "3337654321", email: "wh-stripe@localhub.test" },
        spedizione: {
          indirizzo: "Via Stripe 2", cap: "87100", citta: "Cosenza", provincia: "CS",
          carrier: "poste_italiane", servizio: "standard", metodoPagamento: "bonifico",
        },
        righe: [{ prodottoId: String(pS), varianteId: null, quantita: 1 }], // negozio Stripe
      });
      // Ordine del NEGOZIO STRIPE: la sessione Stripe (mock) lo porta a pending.
      const ordineId = String(esito.data?.ordini?.[0]?.ordineId ?? "");
      if (!ordineId) fail("T15: ordine non creato");
      ordiniCreati.push(ordineId);
      const sessione = await creaSessionePagamentoPerOrdine(ordineId, "stripe", stripeOpts);
      if (!sessione.ok) fail("T15: sessione stripe fallita: " + sessione.errore);
      const { data: ord } = await db.from("ordini").select("payment_id, payment_provider, payment_status").eq("id", ordineId).single();
      check("15a. ordine è Stripe (premessa)", ord?.payment_provider === "stripe" && ord?.payment_status === "pending", ord);
      const paymentIdStripe = String(ord?.payment_id ?? "");

      // Evento Klarna VALIDO (firma klarna corretta) ma order_id = payment_id Stripe.
      const esitoWh = await inviaEventoKlarna({
        event_id: `evt_stripe_intruso_${ts}`,
        event_type: "checkout.order_completed",
        order_id: paymentIdStripe,
      });
      check("15b. webhook 200 (evento registrato)", esitoWh.status === 200, esitoWh);
      const { data: dopo } = await db.from("ordini").select("payment_status, payment_provider, payment_paid_at").eq("id", ordineId).single();
      check("15c. ordine Stripe NON modificato (resta pending)", dopo?.payment_status === "pending" && dopo?.payment_paid_at === null, dopo);
      check("15d. provider resta stripe", dopo?.payment_provider === "stripe", dopo);
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`WEBHOOK KLARNA TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST WEBHOOK KLARNA ──");
    if (mockKlarna) await mockKlarna.chiudi().catch(() => {});
    if (mockStripe) await mockStripe.chiudi().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}`);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `whk-%-${ts}%`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `whk-%-${ts}%`);
        console.log(`  Sweep residui ordini: ${residui}`);
      }
    }
    {
      const { count: eventi } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).like("event_id", `evt_%-${ts}%`);
      if (Number(eventi ?? 0) > 0) {
        await db.from("pagamenti_eventi").delete().like("event_id", `evt_%-${ts}%`);
        console.log(`  Sweep eventi residui: ${eventi}`);
      }
    }
    for (const id of [p1, pStock, pS]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    for (const id of [negozioKId, negozioSId]) {
      if (id) {
        await db.from("negozio_pagamenti").delete().eq("negozio_id", id);
        await db.from("negozi").delete().eq("id", id);
      }
    }
    fermaServer();
    console.log("  Dati di test eliminati (eventi, sessioni, ordini, stock, prodotti, negozi, config).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
