/**
 * E2E PAYMENT LIFECYCLE — SOLO SUPABASE/POSTGRES LOCALE.
 *
 * Fixture e asserzioni read-only usano PostgreSQL locale (ruolo postgres).
 * Le transizioni commerciali usano le RPC reali via Supabase locale.
 * Nessun provider reale: il solo traffico Stripe del late-payment passa al
 * mock HTTP loopback tramite il bridge HTTPS locale.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import * as http from "node:http";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PROJECT = process.cwd();
const LOCAL_URL = "http://127.0.0.1:54321";
const DB_CONTAINER = "supabase_db_localhub";
const TEST_KEY = "payment-lifecycle-local-key-0001";
const FIXTURE_PREFIX = `payment-lifecycle-${Date.now()}-${randomUUID().slice(0, 8)}`;
const https = createRequire(import.meta.url)("node:https") as {
  request: (...args: any[]) => any;
  get: (...args: any[]) => any;
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

type JsonObject = Record<string, any>;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
  }
}

function sqlText(value: string): string {
  if (value.includes("$lifecycle$")) throw new Error("fixture SQL non sicura");
  return `$lifecycle$${value}$lifecycle$`;
}

function sqlUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`UUID non valido: ${value}`);
  }
  return `'${value.toLowerCase()}'`;
}

function localPostgres(sql: string): string {
  const result = spawnSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-h", "127.0.0.1", "-d", "postgres", "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (result.error) throw new Error(`psql locale: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`psql locale exit=${result.status}: ${(result.stderr ?? result.stdout ?? "").trim()}`);
  return result.stdout ?? "";
}

function pgRows(sql: string): string[][] {
  return localPostgres(`${sql.trim().replace(/;$/, "")};\n`)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|"));
}

function pgOne(sql: string, label: string): string[] {
  const rows = pgRows(sql);
  if (rows.length !== 1) throw new Error(`${label}: attese 1 riga, trovate ${rows.length}`);
  return rows[0];
}

function localEnv(): { url: string; anonKey: string; serviceRole: string } {
  const npxCli = `${process.execPath.includes("node.exe") ? process.execPath.replace(/node\.exe$/i, "") : ""}node_modules/npm/bin/npx-cli.js`;
  const output = execFileSync(process.execPath, [npxCli, "--no-install", "supabase", "status", "-o", "env"], {
    cwd: PROJECT,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) values.set(line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, ""));
  }
  if (values.get("API_URL") !== LOCAL_URL || !values.get("ANON_KEY") || !values.get("SERVICE_ROLE_KEY")) {
    throw new Error("Supabase locale non disponibile o endpoint inatteso.");
  }
  return { url: LOCAL_URL, anonKey: values.get("ANON_KEY")!, serviceRole: values.get("SERVICE_ROLE_KEY")! };
}

function createFixture(): { storeId: string; productId: string } {
  const slug = `${FIXTURE_PREFIX}-store`;
  const output = localPostgres(`
begin;
with s as (
  insert into public.negozi (nome, slug, attivo, is_demo, pacco_peso_grammi)
  values (${sqlText(`${FIXTURE_PREFIX} store`)}, ${sqlText(slug)}, true, true, 1500)
  returning id
) select 'store|' || id from s;
with p as (
  insert into public.prodotti (negozio_id, nome, slug, prezzo, quantita_disponibile, quantita_riservata, attivo, disponibile, ha_varianti, peso_grammi)
  select id, ${sqlText(`${FIXTURE_PREFIX} product`)}, ${sqlText(`${FIXTURE_PREFIX}-product`)}, 10, 100, 0, true, true, false, 1000
  from public.negozi where slug = ${sqlText(slug)}
  returning id
) select 'product|' || id from p;
commit;
`);
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const i = line.indexOf("|");
    if (i > 0) values.set(line.slice(0, i), line.slice(i + 1));
  }
  const storeId = values.get("store") ?? "";
  const productId = values.get("product") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !/^\d+$/.test(productId)) {
    throw new Error(`fixture output inatteso: ${JSON.stringify(output)}`);
  }
  return { storeId, productId };
}

function cleanupFixture(storeId: string): void {
  localPostgres(`
begin;
delete from public.pagamenti_eventi where negozio_id = ${sqlUuid(storeId)};
delete from public.pagamenti_sessioni where negozio_id = ${sqlUuid(storeId)};
delete from public.ordini where negozio_id = ${sqlUuid(storeId)};
delete from public.negozio_metodi_pagamento where negozio_id = ${sqlUuid(storeId)};
delete from public.negozio_pagamenti where negozio_id = ${sqlUuid(storeId)};
delete from public.prodotti where negozio_id = ${sqlUuid(storeId)};
delete from public.negozi where id = ${sqlUuid(storeId)};
commit;
`);
}

function scalar(table: "prodotti" | "pagamenti_sessioni", id: string, columns: string): JsonObject {
  const idSql = table === "prodotti" ? id : sqlUuid(id);
  const cols = columns.split(",").map((x) => x.trim());
  const row = pgOne(`select ${cols.join(", ")} from public.${table} where id = ${idSql}`, table);
  const result: JsonObject = {};
  cols.forEach((column, index) => { result[column] = row[index] === "" || row[index] === undefined ? null : row[index]; });
  return result;
}

function orderRows(storeId: string): string[][] {
  return pgRows(`select id, payment_status, payment_provider, payment_id, payment_transaction_id from public.ordini where negozio_id = ${sqlUuid(storeId)} order by created_at`);
}

async function rpc<T = JsonObject>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

function ok(data: any): boolean { return data?.ok === true; }
function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} mancante`);
  return value;
}

async function createIntent(db: SupabaseClient, storeId: string, productId: string, suffix: string, quantity: number): Promise<JsonObject> {
  return rpc(db, "checkout_intento_crea", {
    p_payload: {
      checkoutKey: `${FIXTURE_PREFIX}-${suffix}`,
      provider: "stripe",
      modalita: "ritiro",
      clienteNome: "Lifecycle",
      clienteCognome: "Locale",
      clienteEmail: `${FIXTURE_PREFIX}@localhost.test`,
      clienteTelefono: "0000000000",
      clienteIp: "127.0.0.1",
      metodoPagamento: "carta",
      negozioId: storeId,
      righe: [{ prodottoId: productId, quantita: quantity }],
    },
  });
}

function installStripeBridge(mockPort: number): () => void {
  const originalRequest = https.request.bind(https);
  const originalGet = https.get.bind(https);
  const redirect = (options: any, args: any[]): any => {
    const hostname = options?.hostname ?? options?.host;
    if (hostname !== "api.stripe.com") return null;
    const redirected = {
      ...options,
      hostname: "127.0.0.1",
      host: "127.0.0.1",
      port: mockPort,
      protocol: "http:",
      agent: false,
      headers: { ...(options.headers ?? {}), host: `127.0.0.1:${mockPort}` },
    };
    const request = http.request(redirected, ...args);
    request.once("socket", (socket: any) => {
      const secure = () => socket.emit("secureConnect");
      if (socket.connecting) socket.once("connect", secure);
      else process.nextTick(secure);
    });
    return request;
  };
  https.request = (options: any, ...args: any[]): any => {
    return redirect(options, args) ?? originalRequest(options, ...args);
  };
  https.get = (options: any, ...args: any[]): any => {
    return redirect(options, args) ?? originalGet(options, ...args);
  };
  return () => {
    https.request = originalRequest;
    https.get = originalGet;
  };
}

async function startStripeRefundMock(): Promise<{ server: Server; port: number; refunds: number }> {
  let refunds = 0;
  const server = createServer((request, response) => {
    const path = request.url ?? "";
    const finish = (status: number, body: JsonObject) => {
      const encoded = JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": String(Buffer.byteLength(encoded)) });
      response.end(encoded);
    };
    if (request.method === "GET" && /^\/v1\/checkout\/sessions\//.test(path)) {
      finish(200, { id: path.split("/").pop(), object: "checkout.session", status: "complete", payment_status: "paid", payment_intent: "pi_lifecycle_late" });
      return;
    }
    if (request.method === "POST" && path === "/v1/refunds") {
      refunds++;
      finish(200, { id: "re_lifecycle_late_1", object: "refund", status: "succeeded", payment_intent: "pi_lifecycle_late" });
      return;
    }
    finish(404, { error: { message: "mock route not found" } });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock Stripe senza porta");
  return { server, port: address.port, get refunds() { return refunds; } } as { server: Server; port: number; refunds: number };
}

async function main(): Promise<void> {
  const env = localEnv();
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRole;
  process.env.PAYMENTS_ENCRYPTION_KEY = TEST_KEY;
  const db = createClient(env.url, env.serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const self = pgOne("select current_user, current_database(), host(inet_server_addr())", "postgres self-check");
  check("PostgreSQL locale", self[0] === "postgres" && self[1] === "postgres" && self[2] === "127.0.0.1", self);

  let storeId: string | null = null;
  let mock: Awaited<ReturnType<typeof startStripeRefundMock>> | null = null;
  let restoreStripe: (() => void) | null = null;
  try {
    const fixture = createFixture();
    storeId = fixture.storeId;
    const productId = fixture.productId;
    console.log(`[SETUP] fixture isolata: negozio=${storeId}, prodotto=${productId}`);

    // Configurazione fittizia usata solo dal late-payment helper e cifrata dalla RPC reale.
    const config = await rpc(db, "pagamenti_credenziali_salva", {
      p_negozio_id: storeId,
      p_provider: "stripe",
      p_attivo: true,
      p_test_mode: true,
      p_client_id: null,
      p_payee_email: null,
      p_iban: null,
      p_secret: "sk_test_payment_lifecycle_local",
      p_webhook_secret: "whsec_payment_lifecycle_local",
      p_chiave: TEST_KEY,
    });
    check("fixture config Stripe mock salvata", ok(config), config);

    // 1. SUCCESS → ordine creato e stock convertito.
    console.log("\n[1] SUCCESS");
    {
      const before = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderRows(storeId).length;
      const intent = await createIntent(db, storeId, productId, "success", 2);
      const checkoutId = required(intent.checkoutId, "checkout success");
      const payment = await rpc(db, "checkout_intento_conferma", { p_sessione_id: checkoutId, p_payment_id: "pi_success", p_transaction_id: "pi_success_tx", p_importo: Number(intent.totale), p_valuta: "EUR" });
      const session = scalar("pagamenti_sessioni", checkoutId, "status, ordine_id");
      const after = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      check("1a ordine creato dopo paid", ok(payment) && payment.giaEsistente === false && orderRows(storeId).length === beforeOrders + 1, payment);
      check("1b sessione paid collegata", session.status === "paid" && session.ordine_id === payment.ordine?.id, session);
      check("1c stock decrementato e riserva convertita", Number(after.quantita_disponibile) === Number(before.quantita_disponibile) - 2 && Number(after.quantita_riservata) === Number(before.quantita_riservata), after);
    }

    // 2. FAILED → stato informativo, nessun ordine/vendita (come payment_failed webhook).
    console.log("\n[2] FAILED");
    {
      const before = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderRows(storeId).length;
      const intent = await createIntent(db, storeId, productId, "failed", 3);
      const checkoutId = required(intent.checkoutId, "checkout failed");
      localPostgres(`update public.pagamenti_sessioni set status='failed', payment_id=${sqlText(`${FIXTURE_PREFIX}-failed`)} where id=${sqlUuid(checkoutId)};`);
      const session = scalar("pagamenti_sessioni", checkoutId, "status, ordine_id");
      const after = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      check("2a sessione failed senza ordine", session.status === "failed" && session.ordine_id === null, session);
      check("2b nessun ordine commerciale", orderRows(storeId).length === beforeOrders, beforeOrders);
      check("2c stock non venduto e riserva non duplicata", Number(after.quantita_disponibile) === Number(before.quantita_disponibile) && Number(after.quantita_riservata) === Number(before.quantita_riservata) + 3, after);
    }

    // 3. CANCELED → annullamento reale, riserva rilasciata, nessun ordine.
    console.log("\n[3] CANCELED");
    {
      const before = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderRows(storeId).length;
      const intent = await createIntent(db, storeId, productId, "canceled", 4);
      const checkoutId = required(intent.checkoutId, "checkout canceled");
      const canceled = await rpc(db, "checkout_intento_annulla", { p_checkout_id: checkoutId });
      const session = scalar("pagamenti_sessioni", checkoutId, "status, ordine_id");
      const after = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      check("3a annullamento RPC riuscito", ok(canceled) && canceled.annullato === true, canceled);
      check("3b nessun ordine e sessione chiusa", orderRows(storeId).length === beforeOrders && session.status === "expired" && session.ordine_id === null, session);
      check("3c riserva rilasciata una sola volta", Number(after.quantita_riservata) === Number(before.quantita_riservata), after);
    }

    // 4. ABANDONED/INCOMPLETE → resta senza ordine; chiusura con annulla è idempotente.
    console.log("\n[4] ABANDONED / INCOMPLETE");
    {
      const before = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      const intent = await createIntent(db, storeId, productId, "abandoned", 2);
      const checkoutId = required(intent.checkoutId, "checkout abandoned");
      const first = await rpc(db, "checkout_intento_annulla", { p_checkout_id: checkoutId });
      const second = await rpc(db, "checkout_intento_annulla", { p_checkout_id: checkoutId });
      const session = scalar("pagamenti_sessioni", checkoutId, "status, ordine_id");
      check("4a nessun ordine per checkout incompleto", orderRows(storeId).every((row) => row[0] !== checkoutId), session);
      check("4b chiusura incompleta idempotente", ok(first) && first.annullato === true && ok(second) && second.annullato === false, { first, second });
      check("4c riserva rilasciata senza alterare disponibilità", session.status === "expired" && session.ordine_id === null && scalar("prodotti", productId, "quantita_riservata").quantita_riservata === before.quantita_riservata, session);
    }

    // 5. DOPPIA CONFERMA → un ordine e una sola conversione stock.
    console.log("\n[5] DOUBLE CONFIRMATION");
    {
      const before = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderRows(storeId).length;
      const intent = await createIntent(db, storeId, productId, "double-confirm", 5);
      const checkoutId = required(intent.checkoutId, "checkout double");
      const args = { p_sessione_id: checkoutId, p_payment_id: "pi_double", p_transaction_id: "tx_double", p_importo: Number(intent.totale), p_valuta: "EUR" };
      const first = await rpc(db, "checkout_intento_conferma", args);
      const afterFirst = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      const second = await rpc(db, "checkout_intento_conferma", args);
      const afterSecond = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      check("5a prima conferma crea un ordine", ok(first) && first.giaEsistente === false && orderRows(storeId).length === beforeOrders + 1, first);
      check("5b seconda conferma giaEsistente", ok(second) && second.giaEsistente === true && second.ordine?.id === first.ordine?.id, second);
      check("5c stock invariato al retry", Number(afterSecond.quantita_disponibile) === Number(afterFirst.quantita_disponibile) && Number(afterSecond.quantita_riservata) === Number(afterFirst.quantita_riservata) && Number(afterSecond.quantita_disponibile) === Number(before.quantita_disponibile) - 5, afterSecond);
    }

    // 6. INTENTO SCADUTO → RPC P3 rilascia la prenotazione e non crea ordine.
    console.log("\n[6] EXPIRED INTENT");
    {
      const before = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      const beforeOrders = orderRows(storeId).length;
      const intent = await createIntent(db, storeId, productId, "expired", 6);
      const checkoutId = required(intent.checkoutId, "checkout expired");
      localPostgres(`update public.pagamenti_sessioni set expires_at=now()-interval '1 minute' where id=${sqlUuid(checkoutId)};`);
      const expired = await rpc(db, "checkout_intento_scaduto", { p_sessione_id: checkoutId });
      const retry = await rpc(db, "checkout_intento_scaduto", { p_sessione_id: checkoutId });
      const session = scalar("pagamenti_sessioni", checkoutId, "status, ordine_id");
      const after = scalar("prodotti", productId, "quantita_disponibile, quantita_riservata");
      check("6a scadenza RPC riuscita", ok(expired) && expired.cambiato === true && retry.cambiato === false, { expired, retry });
      check("6b sessione expired senza ordine", session.status === "expired" && session.ordine_id === null && orderRows(storeId).length === beforeOrders, session);
      check("6c rilascio riserva idempotente", Number(after.quantita_disponibile) === Number(before.quantita_disponibile) && Number(after.quantita_riservata) === Number(before.quantita_riservata), after);
    }

    // 7. PAGAMENTO TARDIVO → helper reale + mock Stripe, refund una sola volta.
    console.log("\n[7] LATE PAYMENT / IDEMPOTENT REFUND");
    {
      mock = await startStripeRefundMock();
      restoreStripe = installStripeBridge(mock.port);
      const intent = await createIntent(db, storeId, productId, "late-payment", 2);
      const checkoutId = required(intent.checkoutId, "checkout late");
      localPostgres(`update public.pagamenti_sessioni set expires_at=now()-interval '1 minute', payment_id=${sqlText("cs_lifecycle_late")} where id=${sqlUuid(checkoutId)};`);
      const eventId = `${FIXTURE_PREFIX}-late-event`;
      localPostgres(`insert into public.pagamenti_eventi(provider,event_id,event_type,negozio_id,payment_id,payload,status,attempts) values ('stripe',${sqlText(eventId)},'checkout.session.completed',${sqlUuid(storeId)},${sqlText("cs_lifecycle_late")},'{}'::jsonb,'processed',1);`);
      const { gestisciPagamentoTardivoIntento } = await import("../lib/pagamenti/late-payment");
      const input = { checkoutId, negozioId: storeId, provider: "stripe" as const, paymentId: "cs_lifecycle_late", importo: Number(intent.totale), eventId, payload: { id: eventId } };
      const first = await gestisciPagamentoTardivoIntento(input);
      const second = await gestisciPagamentoTardivoIntento(input);
      const session = scalar("pagamenti_sessioni", checkoutId, "status, ordine_id");
      check("7a late payment rimborsato senza ordine", first.ok === true && first.action === "refunded" && session.ordine_id === null && orderRows(storeId).length === orderRows(storeId).length, { first, session });
      check("7b retry late payment gia_gestito", second.ok === true && second.action === "gia_gestito", second);
      check("7c provider refund chiamato una sola volta", mock.refunds === 1, mock.refunds);
      check("7d sessione refunded e nessun ordine collegato", session.status === "refunded" && session.ordine_id === null, session);
    }

    // 8/9. RETRY EVENTO + WEBHOOK DUPLICATO: lifecycle RPC reale.
    console.log("\n[8/9] EVENT RETRY + DUPLICATE WEBHOOK IDEMPOTENCY");
    {
      const eventId = `${FIXTURE_PREFIX}-retry-event`;
      const acquire1 = await rpc(db, "pagamenti_evento_acquisisci", { p_event_id: eventId, p_event_type: "checkout.session.completed", p_ordine_id: null, p_negozio_id: storeId, p_payment_id: "cs_retry", p_payload: { id: eventId } });
      const failure = await rpc(db, "pagamenti_evento_finalizza", { p_event_id: eventId, p_success: false, p_error: "errore sintetico retry", p_attempt: 1 });
      const acquire2 = await rpc(db, "pagamenti_evento_acquisisci", { p_event_id: eventId, p_event_type: "checkout.session.completed", p_ordine_id: null, p_negozio_id: storeId, p_payment_id: "cs_retry", p_payload: { id: eventId } });
      const recovered = await rpc(db, "pagamenti_evento_finalizza", { p_event_id: eventId, p_success: true, p_error: null, p_attempt: 2 });
      const duplicate = await rpc(db, "pagamenti_evento_acquisisci", { p_event_id: eventId, p_event_type: "checkout.session.completed", p_ordine_id: null, p_negozio_id: storeId, p_payment_id: "cs_retry", p_payload: { id: eventId } });
      check("8a retry stesso risultato acquisisce un nuovo tentativo", acquire1.esito === "NEW_EVENT" && failure.esito === "RETRYABLE_ERROR" && acquire2.esito === "RETRYABLE_EXISTING" && acquire2.attempts === 2, { acquire1, failure, acquire2 });
      check("8b retry riuscito finalizza una sola volta", recovered.esito === "PROCESSED", recovered);
      check("9a webhook/evento duplicato è no-op terminale", duplicate.esito === "DUPLICATE_PROCESSED" && duplicate.terminal === true && duplicate.attempts === 2, duplicate);
      check("9b un solo record per event_id", pgOne(`select count(*) from public.pagamenti_eventi where event_id=${sqlText(eventId)}`, "evento duplicato")[0] === "1");
    }

    console.log(`\nPAYMENT LIFECYCLE LOCAL: ${passed} PASS / ${failed} FAIL`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    restoreStripe?.();
    if (mock) await new Promise<void>((resolve) => mock!.server.close(() => resolve()));
    if (storeId) {
      try {
        cleanupFixture(storeId);
        const remaining = pgOne(`select count(*) from public.negozi where id=${sqlUuid(storeId)}`, "cleanup")[0];
        check("cleanup fixture completo", remaining === "0", remaining);
      } catch (error) {
        check("cleanup fixture completo", false, error instanceof Error ? error.message : String(error));
      }
    }
  }
}

void main().catch((error) => {
  console.error("PAYMENT LIFECYCLE LOCAL — ERRORE FATALE:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
