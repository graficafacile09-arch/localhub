/**
 * FASE 10 BLOCCO 3D — charge.refunded ↔ refund operations.
 *
 * Test reale contro PostgreSQL Supabase locale disposable. I payload sono
 * firmati con Stripe SDK; quando il webhook deve recuperare i Refund non
 * espansi usa esclusivamente un mock HTTP locale, mai Stripe reale.
 */

import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gestisciWebhookStripe } from "../lib/pagamenti/webhook-stripe";

const CONTAINER = process.env.FASE10_DB_CONTAINER ?? "supabase_db_localhub";
const STORE_A = "b3d00000-0000-4000-8000-000000000001";
const STORE_B = "b3d00000-0000-4000-8000-000000000002";
const ORDER_A = "b3d00000-0000-4000-8000-000000000011";
const ORDER_B = "b3d00000-0000-4000-8000-000000000012";
const ORDER_C = "b3d00000-0000-4000-8000-000000000013";
const PI_A = "pi_3d_a";
const PI_B = "pi_3d_b";
const SESSION_A = "cs_3d_a";
const WEBHOOK_SECRET = "whsec_3d_local";
const ENCRYPTION_KEY = "fase10-block-3d-local-encryption-key";
const OWNER = "56608999-f500-4de1-bc82-933871ac825f";

let passati = 0;
let falliti = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passati++;
    console.log(`  PASS ${label}`);
  } else {
    falliti++;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
  }
}

function loadEnv(): void {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Environment may be supplied by the caller.
  }
}

function dbAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mancano le variabili Supabase locali");
  if (!/^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(url)) throw new Error(`Test bloccato: URL non locale (${url})`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function psql(sql: string, args: string[] = []): string {
  return execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", ...args], { input: sql, encoding: "utf8" });
}

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const { data, error } = await db.rpc(fn, args);
  return { data: (data ?? null) as Record<string, unknown> | null, error: error ? { message: error.message } : null };
}

async function setup(db: SupabaseClient): Promise<void> {
  await db.from("pagamenti_eventi").delete().like("event_id", "evt_3d_%");
  await db.from("pagamenti_rimborso_operazioni").delete().in("ordine_id", [ORDER_A, ORDER_B, ORDER_C]);
  await db.from("pagamenti_sessioni").delete().in("ordine_id", [ORDER_A, ORDER_B, ORDER_C]);
  await db.from("ordini").delete().in("id", [ORDER_A, ORDER_B, ORDER_C]);
  await db.from("negozio_pagamenti").delete().in("negozio_id", [STORE_A, STORE_B]);
  await db.from("negozi").delete().in("id", [STORE_A, STORE_B]);

  const { error: storesError } = await db.from("negozi").insert([
    { id: STORE_A, nome: "3D Store A", slug: "fase10-3d-a", attivo: true, is_demo: true, owner_user_id: OWNER },
    { id: STORE_B, nome: "3D Store B", slug: "fase10-3d-b", attivo: true, is_demo: true, owner_user_id: OWNER },
  ]);
  if (storesError) throw new Error(`negozi fixture: ${storesError.message}`);

  for (const store of [STORE_A, STORE_B]) {
    const saved = await rpc(db, "pagamenti_credenziali_salva", {
      p_negozio_id: store,
      p_provider: "stripe",
      p_attivo: true,
      p_test_mode: true,
      p_secret: "sk_test_3d_local",
      p_webhook_secret: WEBHOOK_SECRET,
      p_chiave: ENCRYPTION_KEY,
    });
    if (saved.error || saved.data?.ok !== true) throw new Error(`config ${store}: ${saved.error?.message ?? JSON.stringify(saved.data)}`);
  }

  const orders = [
    { id: ORDER_A, store: STORE_A, pi: PI_A, session: SESSION_A, key: "order-3d-a" },
    { id: ORDER_B, store: STORE_B, pi: PI_B, session: "cs_3d_b", key: "order-3d-b" },
    { id: ORDER_C, store: STORE_A, pi: "pi_3d_c", session: "cs_3d_c", key: "order-3d-c" },
  ];
  for (const order of orders) {
    const { error } = await db.from("ordini").insert({
      id: order.id,
      idempotency_key: order.key,
      modalita: "ritiro",
      totale: 100,
      negozio_id: order.store,
      negozio_nome: order.store === STORE_A ? "3D Store A" : "3D Store B",
      cliente_nome: "Refund",
      cliente_cognome: "3D",
      cliente_email: "refund-3d@local.test",
      payment_status: "paid",
      payment_provider: "stripe",
      payment_id: order.session,
      payment_transaction_id: order.pi,
      payment_amount: 100,
      payment_currency: "EUR",
      payment_refunded_amount: 0,
    });
    if (error) throw new Error(`ordine ${order.id}: ${error.message}`);
    const session = await db.from("pagamenti_sessioni").insert({
      ordine_id: order.id,
      negozio_id: order.store,
      provider: "stripe",
      payment_id: order.session,
      status: "paid",
      amount: 100,
      currency: "EUR",
    });
    if (session.error) throw new Error(`sessione ${order.id}: ${session.error.message}`);
  }
}

async function snapshot(db: SupabaseClient, orderId = ORDER_A): Promise<Record<string, unknown>> {
  const { data, error } = await db.from("ordini").select("payment_status,payment_amount,payment_refunded_amount,payment_transaction_id,payment_provider,negozio_id").eq("id", orderId).single();
  if (error || !data) throw new Error(`snapshot: ${error?.message ?? "ordine assente"}`);
  return data as Record<string, unknown>;
}

async function operation(db: SupabaseClient, orderId = ORDER_A, amount = 30, key = `key-${Date.now()}-${Math.random()}`): Promise<{ id: string; key: string }> {
  const result = await rpc(db, "pagamenti_rimborso_operazione_prepara", {
    p_ordine_id: orderId,
    p_importo: amount,
    p_merchant_user_id: OWNER,
    p_idempotency_key: key,
  });
  if (result.error || result.data?.ok !== true) throw new Error(`prepare operation: ${result.error?.message ?? JSON.stringify(result.data)}`);
  return { id: String(result.data.operazione_id), key: String(result.data.idempotency_key ?? key) };
}

function payload(eventId: string, orderId: string, paymentIntent: string, chargeId: string, amountRefunded: number, refunds: unknown[], previous?: number): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "charge.refunded",
    data: {
      object: {
        id: chargeId,
        payment_intent: paymentIntent,
        amount_refunded: amountRefunded * 100,
        amount_captured: 10000,
        currency: "eur",
        refunds: { object: "list", data: refunds },
      },
      ...(previous === undefined ? {} : { previous_attributes: { amount_refunded: previous * 100 } }),
    },
    metadata_order_for_test: orderId,
  });
}

async function webhook(raw: string): Promise<{ status: number; body: string }> {
  return gestisciWebhookStripe(raw, new Headers({ "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: WEBHOOK_SECRET }) }));
}

function refund(id: string, amount: number, operationId?: string, paymentIntent = PI_A, chargeId = "ch_3d_a"): Record<string, unknown> {
  return {
    id,
    object: "refund",
    amount: amount * 100,
    status: "succeeded",
    currency: "eur",
    metadata: operationId ? { refund_operation_id: operationId } : {},
    payment_intent: paymentIntent,
    charge: chargeId,
  };
}

async function reset(db: SupabaseClient, orderId = ORDER_A, paymentIntent = PI_A): Promise<void> {
  await db.from("pagamenti_eventi").delete().like("event_id", "evt_3d_%");
  await db.from("pagamenti_rimborso_operazioni").delete().in("ordine_id", [ORDER_A, ORDER_B, ORDER_C]);
  const { error: orderError } = await db.from("ordini").update({
    payment_status: "paid",
    payment_refunded_amount: 0,
    payment_transaction_id: paymentIntent,
    payment_provider: "stripe",
    stato: "in_preparazione",
  }).eq("id", orderId);
  if (orderError) throw new Error(`reset ordine: ${orderError.message}`);
  const { error: sessionError } = await db.from("pagamenti_sessioni").update({ status: "paid" }).eq("ordine_id", orderId);
  if (sessionError) throw new Error(`reset sessione: ${sessionError.message}`);
}

async function main(): Promise<void> {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = ENCRYPTION_KEY;
  const db = dbAdmin();
  try {
    psql(readFileSync(join(process.cwd(), "supabase/migrations/20260927_webhook_refund_atomic.sql"), "utf8"));
    psql(readFileSync(join(process.cwd(), "supabase/migrations/20260928_webhook_refund_operations.sql"), "utf8"));
    await setup(db);

    console.log("\n=== MATCHING, REFUND ID, IDEMPOTENZA ===\n");
    let op = await operation(db, ORDER_A, 30, "stable-key-3d");
    const same = await operation(db, ORDER_A, 30, "different-key-3d");
    check("stable idempotency key converge sulla stessa operation", op.id === same.id && same.key === "stable-key-3d");
    let raw = payload("evt_3d_match", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_30", 30, op.id)]);
    let result = await webhook(raw);
    let state = await snapshot(db);
    let opRow = (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").eq("id", op.id).single()).data;
    check("operation + metadata matching → HTTP 200", result.status === 200, result);
    check("Refund ID reale persistito e operation completata", opRow?.stato === "succeeded" && opRow.refund_id === "re_3d_30", opRow);
    check("accounting operation 30 e PaymentIntent originale invariato", Number(state.payment_refunded_amount) === 30 && state.payment_transaction_id === PI_A, state);

    result = await webhook(raw);
    check("duplicate stesso event ID → no-op 200", result.status === 200 && result.body.includes("già processato"), result);
    raw = payload("evt_3d_same_refund", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_30", 30, op.id)]);
    result = await webhook(raw);
    state = await snapshot(db);
    check("event ID diverso stesso Refund ID → un solo completamento", result.status === 200 && Number(state.payment_refunded_amount) === 30, state);

    await reset(db);
    op = await operation(db, ORDER_A, 30, "failed-key-3d");
    await rpc(db, "pagamenti_rimborso_operazione_fallita", { p_operazione_id: op.id, p_stato: "failed", p_codice: "PROVIDER_4XX", p_dettaglio: "test" });
    result = await webhook(payload("evt_3d_failed_then_success", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_failed_success", 30, op.id)]));
    opRow = (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").eq("id", op.id).single()).data;
    check("operation failed + conferma Stripe successiva riconcilia", result.status === 200 && opRow?.stato === "succeeded", opRow);

    console.log("\n=== FALLBACK, AMBIGUITÀ, MISMATCH ===\n");
    await reset(db);
    op = await operation(db, ORDER_A, 20, "fallback-key-3d");
    result = await webhook(payload("evt_3d_fallback", ORDER_A, PI_A, "ch_3d_a", 50, [refund("re_3d_20", 20)], 30));
    opRow = (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").eq("id", op.id).single()).data;
    state = await snapshot(db);
    check("metadata mancante + delta cumulativo deterministico → match", result.status === 200 && opRow?.stato === "succeeded" && Number(state.payment_refunded_amount) === 50, { result, opRow, state });

    await reset(db);
    const op10 = await operation(db, ORDER_A, 10, "ambiguous-10");
    const op20 = await operation(db, ORDER_A, 20, "ambiguous-20");
    result = await webhook(payload("evt_3d_ambiguous", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_10", 10), refund("re_3d_20", 20)]));
    state = await snapshot(db);
    const ambiguousRows = (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").in("id", [op10.id, op20.id])).data;
    check("più operation compatibili → ambiguity fail-closed", result.status === 503 && Number(state.payment_refunded_amount) === 0 && (ambiguousRows ?? []).every((row) => row.stato === "pending" && row.refund_id === null), { result, state, ambiguousRows });

    await reset(db);
    op = await operation(db, ORDER_A, 30, "invalid-pi");
    result = await webhook(payload("evt_3d_invalid_pi", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_wrong_pi", 30, op.id, "pi_other")])) ;
    state = await snapshot(db);
    check("Refund ID appartenente a PaymentIntent diverso → fail closed", result.status === 503 && Number(state.payment_refunded_amount) === 0, { result, state });

    await reset(db);
    op = await operation(db, ORDER_A, 30, "invalid-order");
    result = await webhook(payload("evt_3d_invalid_metadata", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_invalid_metadata", 30, "b3d00000-0000-4000-8000-000000000099")])) ;
    state = await snapshot(db);
    check("metadata refund_operation_id inesistente → fail closed", result.status === 503 && Number(state.payment_refunded_amount) === 0, { result, state });
    void op;

    await reset(db);
    op = await operation(db, ORDER_A, 30, "amount-mismatch");
    result = await webhook(payload("evt_3d_amount_mismatch", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_amount_mismatch", 50, op.id)]));
    state = await snapshot(db);
    check("Refund individuale con amount diverso dall'operation → fail closed", result.status === 503 && Number(state.payment_refunded_amount) === 0, { result, state });

    const orderOperation = await operation(db, ORDER_B, 30, "order-mismatch");
    const orderMismatch = await rpc(db, "pagamenti_webhook_rimborso_operazione_finalizza", {
      p_ordine_id: ORDER_A, p_negozio_id: STORE_A, p_payment_intent: PI_A, p_operation_id: orderOperation.id, p_refund_id: "re_order_mismatch", p_refund_amount: 30, p_amount_refunded: 30, p_amount_captured: 100, p_currency: "EUR",
    });
    check("refund_operation di altro ordine → fail closed", orderMismatch.data?.ok === false && orderMismatch.data.codice === "REFUND_OPERATION_BINDING_MISMATCH", orderMismatch);

    await reset(db);
    op = await operation(db, ORDER_A, 30, "provider-mismatch");
    await db.from("ordini").update({ payment_provider: "paypal" }).eq("id", ORDER_A);
    const providerMismatch = await rpc(db, "pagamenti_webhook_rimborso_operazione_finalizza", {
      p_ordine_id: ORDER_A, p_negozio_id: STORE_A, p_payment_intent: PI_A, p_operation_id: op.id, p_refund_id: "re_provider_mismatch", p_refund_amount: 30, p_amount_refunded: 30, p_amount_captured: 100, p_currency: "EUR",
    });
    check("provider locale diverso da Stripe → fail closed", providerMismatch.data?.ok === false && providerMismatch.data.codice === "REFUND_PROVIDER_MISMATCH", providerMismatch);
    await db.from("ordini").update({ payment_provider: "stripe" }).eq("id", ORDER_A);

    await reset(db);
    op = await operation(db, ORDER_A, 30, "metadata-inconsistent");
    await db.from("pagamenti_rimborso_operazioni").update({ refund_id: "re_already_bound" }).eq("id", op.id);
    result = await webhook(payload("evt_3d_metadata_inconsistent", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_actual", 30, op.id)]));
    state = await snapshot(db);
    check("metadata e Refund ID persistito incoerenti → fail closed", result.status === 503 && Number(state.payment_refunded_amount) === 0, { result, state });

    const directMismatch = await rpc(db, "pagamenti_webhook_rimborso_operazione_finalizza", {
      p_ordine_id: ORDER_A, p_negozio_id: STORE_B, p_payment_intent: PI_A, p_operation_id: op.id, p_refund_id: "re_nope", p_refund_amount: 30, p_amount_refunded: 30, p_amount_captured: 100, p_currency: "EUR",
    });
    check("merchant mismatch RPC → fail closed", directMismatch.data?.ok === false && directMismatch.data.codice === "REFUND_BINDING_MISMATCH", directMismatch);

    console.log("\n=== OPERATION COMPLETED, PARTIAL, OUT-OF-ORDER, EXTERNAL ===\n");
    await reset(db);
    op = await operation(db, ORDER_A, 30, "completed-operation");
    result = await webhook(payload("evt_3d_completed_operation_first", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_completed_operation", 30, op.id)]));
    const completedDuplicate = await webhook(payload("evt_3d_completed_operation_duplicate", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_completed_operation", 30, op.id)]));
    state = await snapshot(db);
    check("operation già completed + webhook duplicate → no-op", completedDuplicate.status === 200 && Number(state.payment_refunded_amount) === 30, { result, completedDuplicate, state });

    await reset(db);
    const operationA = await operation(db, ORDER_A, 30, "multiple-partial-a");
    result = await webhook(payload("evt_3d_partial_a", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_partial_a", 30, operationA.id)]));
    const operationB = await operation(db, ORDER_A, 20, "multiple-partial-b");
    result = await webhook(payload("evt_3d_partial_b", ORDER_A, PI_A, "ch_3d_a", 50, [refund("re_3d_partial_a", 30, operationA.id), refund("re_3d_partial_b", 20, operationB.id)]));
    state = await snapshot(db);
    const partialRows = (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").in("id", [operationA.id, operationB.id])).data;
    check("multiple partial operation 30 + 20 → accounting 50", result.status === 200 && Number(state.payment_refunded_amount) === 50 && (partialRows ?? []).every((row) => row.stato === "succeeded"), { result, state, partialRows });
    const duplicatePartial = await webhook(payload("evt_3d_partial_a_duplicate", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_partial_a", 30, operationA.id)]));
    state = await snapshot(db);
    check("partial duplicate non duplica accounting", duplicatePartial.status === 200 && Number(state.payment_refunded_amount) === 50, { duplicatePartial, state });

    await reset(db);
    for (const [id, amount, previous] of [["evt_3d_ext_30", 30, undefined], ["evt_3d_ext_100", 100, 30], ["evt_3d_ext_50", 50, 100]] as const) {
      result = await webhook(payload(id, ORDER_C, "pi_3d_c", "ch_3d_c", amount, [], previous));
      check(`external cumulative ${amount} → processing non falso`, result.status === 200, result);
    }
    state = await snapshot(db, ORDER_C);
    const externalOps = (await db.from("pagamenti_rimborso_operazioni").select("id").eq("ordine_id", ORDER_C)).data;
    check("external refund senza operation non inventa operation", externalOps?.length === 0);
    check("external 30→100→50 mantiene accounting massimo e stato finale", Number(state.payment_refunded_amount) === 100 && state.payment_status === "refunded", state);

    console.log("\n=== ROLLBACK E CONCORRENZA ===\n");
    await reset(db);
    op = await operation(db, ORDER_A, 30, "rollback-key");
    const before = await snapshot(db);
    psql("revoke execute on function public.pagamenti_webhook_rimborso_operazione_finalizza(uuid, uuid, text, uuid, text, numeric, numeric, numeric, text) from service_role;");
    result = await webhook(payload("evt_3d_db_failure", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_db_failure", 30, op.id)]));
    psql("grant execute on function public.pagamenti_webhook_rimborso_operazione_finalizza(uuid, uuid, text, uuid, text, numeric, numeric, numeric, text) to service_role;");
    const after = await snapshot(db);
    check("DB/RPC failure → HTTP 503 e evento non processato", result.status === 503, result);
    check("DB/RPC failure rollback accounting e operation", JSON.stringify(before) === JSON.stringify(after) && (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").eq("id", op.id).single()).data?.stato === "pending", { before, after });

    await reset(db);
    op = await operation(db, ORDER_A, 30, "concurrent-key");
    const concurrentRawA = payload("evt_3d_concurrent_a", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_concurrent", 30, op.id)]);
    const concurrentRawB = payload("evt_3d_concurrent_b", ORDER_A, PI_A, "ch_3d_a", 30, [refund("re_3d_concurrent", 30, op.id)]);
    const [concurrentA, concurrentB] = await Promise.all([webhook(concurrentRawA), webhook(concurrentRawB)]);
    state = await snapshot(db);
    check("concorrenza stesso Refund ID → entrambi retry-safe", [concurrentA.status, concurrentB.status].every((status) => status === 200) && Number(state.payment_refunded_amount) === 30, { concurrentA, concurrentB, state });
    check("concorrenza persiste un solo Refund ID e una operation succeeded", (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").eq("id", op.id).single()).data?.refund_id === "re_3d_concurrent", op);

    console.log("\n=== STRIPE MOCK LOCALE — REFUND NON ESPANSO ===\n");
    await reset(db);
    op = await operation(db, ORDER_A, 15, "lookup-key");
    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        if (req.url?.startsWith("/v1/charges/")) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: "ch_3d_lookup", payment_intent: PI_A, amount_refunded: 1500, amount_captured: 10000, currency: "eur" }));
          return;
        }
        if (req.url?.startsWith("/v1/refunds")) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ object: "list", data: [refund("re_3d_lookup", 15, op.id, PI_A, "ch_3d_lookup")] }));
          return;
        }
        res.writeHead(404);
        res.end(body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    process.env.STRIPE_API_HOST = "127.0.0.1";
    process.env.STRIPE_API_PORT = String(port);
    process.env.STRIPE_API_PROTOCOL = "http";
    try {
      result = await webhook(payload("evt_3d_lookup", ORDER_A, PI_A, "ch_3d_lookup", 15, []));
    } finally {
      delete process.env.STRIPE_API_HOST;
      delete process.env.STRIPE_API_PORT;
      delete process.env.STRIPE_API_PROTOCOL;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    opRow = (await db.from("pagamenti_rimborso_operazioni").select("stato,refund_id").eq("id", op.id).single()).data;
    check("Refund non espanso: lookup locale Stripe mock usa il vero Refund ID", result.status === 200 && opRow?.refund_id === "re_3d_lookup" && opRow.stato === "succeeded", { result, opRow });
  } catch (error) {
    check("setup/esecuzione 3D", false, error instanceof Error ? error.message : String(error));
  } finally {
    await db.from("pagamenti_eventi").delete().like("event_id", "evt_3d_%");
    await db.from("pagamenti_rimborso_operazioni").delete().in("ordine_id", [ORDER_A, ORDER_B, ORDER_C]);
    await db.from("pagamenti_sessioni").delete().in("ordine_id", [ORDER_A, ORDER_B, ORDER_C]);
    await db.from("ordini").delete().in("id", [ORDER_A, ORDER_B, ORDER_C]);
    await db.from("negozio_pagamenti").delete().in("negozio_id", [STORE_A, STORE_B]);
    await db.from("negozi").delete().in("id", [STORE_A, STORE_B]);
  }
  console.log(`\nWEBHOOK REFUND 3D: ${passati} PASS / ${falliti} FAIL`);
  process.exit(falliti === 0 ? 0 : 1);
}

void main();
