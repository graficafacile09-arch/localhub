/**
 * FASE 10 BLOCCO 3C — FINALIZZAZIONE ATOMICA charge.refunded.
 *
 * Esegue la nuova RPC contro il PostgreSQL Supabase locale disposable e
 * verifica anche il percorso reale del webhook per il refund→completed guard.
 * Nessuna chiamata Stripe reale e nessun database remoto.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gestisciWebhookStripe } from "../lib/pagamenti/webhook-stripe";

const CONTAINER = process.env.FASE10_DB_CONTAINER ?? "supabase_db_localhub";
const STORE_ID = "b3c00000-0000-4000-8000-000000000001";
const ORDER_ID = "b3c00000-0000-4000-8000-000000000002";
const SESSION_ID = "cs_3c_local_001";
const PAYMENT_INTENT = "pi_3c_local_001";
const WEBHOOK_SECRET = "whsec_3c_local_test";
const ENCRYPTION_KEY = "fase10-blocco-3c-local-encryption-key";
const STORE_SLUG = "fase10-3c-local-store";

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
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // The caller may provide the local environment explicitly.
  }
}

function dbAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mancano le variabili Supabase locali");
  if (!/^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(url)) {
    throw new Error(`Test bloccato: URL non locale (${url})`);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function psql(sql: string, args: string[] = []): string {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", ...args],
    { input: sql, encoding: "utf8" }
  );
}

function psqlAsync(sql: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(
      "docker",
      ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin?.end(sql);
  });
}

function installMigration(): void {
  psql(readFileSync(join(process.cwd(), "supabase/migrations/20260927_webhook_refund_atomic.sql"), "utf8"));
}

async function setup(db: SupabaseClient): Promise<void> {
  await db.from("pagamenti_eventi").delete().like("event_id", "evt_3c_%");
  await db.from("pagamenti_sessioni").delete().eq("ordine_id", ORDER_ID);
  await db.from("ordini").delete().eq("id", ORDER_ID);
  await db.from("negozio_pagamenti").delete().eq("negozio_id", STORE_ID);
  await db.from("negozi").delete().eq("id", STORE_ID);

  const { error: storeError } = await db.from("negozi").insert({
    id: STORE_ID,
    nome: "Fase 10 Blocco 3C Store",
    slug: STORE_SLUG,
    attivo: true,
    is_demo: true,
  });
  if (storeError) throw new Error(`negozio fixture: ${storeError.message}`);

  const { data: saved, error: configError } = await db.rpc("pagamenti_credenziali_salva", {
    p_negozio_id: STORE_ID,
    p_provider: "stripe",
    p_attivo: true,
    p_test_mode: true,
    p_secret: "sk_test_3c_local",
    p_webhook_secret: WEBHOOK_SECRET,
    p_chiave: ENCRYPTION_KEY,
  });
  if (configError || (saved as { ok?: boolean } | null)?.ok !== true) {
    throw new Error(`config fixture: ${configError?.message ?? JSON.stringify(saved)}`);
  }

  const { error: orderError } = await db.from("ordini").insert({
    id: ORDER_ID,
    idempotency_key: "fase10-3c-order",
    modalita: "ritiro",
    totale: 100,
    negozio_id: STORE_ID,
    negozio_nome: "Fase 10 Blocco 3C Store",
    cliente_nome: "Refund",
    cliente_cognome: "Test",
    cliente_email: "fase10-3c@local.test",
    cliente_telefono: "3330000003",
    payment_status: "paid",
    payment_provider: "stripe",
    payment_id: SESSION_ID,
    payment_transaction_id: PAYMENT_INTENT,
    payment_amount: 100,
    payment_currency: "EUR",
    payment_refunded_amount: 0,
  });
  if (orderError) throw new Error(`ordine fixture: ${orderError.message}`);

  const { error: sessionError } = await db.from("pagamenti_sessioni").insert({
    ordine_id: ORDER_ID,
    negozio_id: STORE_ID,
    provider: "stripe",
    payment_id: SESSION_ID,
    status: "paid",
    amount: 100,
    currency: "EUR",
  });
  if (sessionError) throw new Error(`sessione fixture: ${sessionError.message}`);
}

async function resetOrder(db: SupabaseClient, status: "pending" | "paid" | "partially_refunded" | "refunded" = "paid", refunded = 0): Promise<void> {
  await db.from("pagamenti_eventi").delete().like("event_id", "evt_3c_%");
  await db.from("ordini").update({
    stato: "in_preparazione",
    payment_status: status,
    payment_provider: "stripe",
    payment_id: SESSION_ID,
    payment_transaction_id: PAYMENT_INTENT,
    payment_amount: 100,
    payment_currency: "EUR",
    payment_refunded_amount: refunded,
  }).eq("id", ORDER_ID);
  await db.from("pagamenti_sessioni").update({ status: "paid", amount: 100, currency: "EUR" }).eq("ordine_id", ORDER_ID);
}

async function snapshot(db: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await db.from("ordini").select("payment_status, payment_amount, payment_refunded_amount, payment_transaction_id, payment_currency").eq("id", ORDER_ID).single();
  if (error || !data) throw new Error(`snapshot: ${error?.message ?? "ordine assente"}`);
  return data as Record<string, unknown>;
}

async function rpcRefund(db: SupabaseClient, values: {
  storeId?: string;
  paymentIntent?: string;
  chargeId?: string;
  refunded?: number;
  captured?: number | null;
  currency?: string | null;
} = {}): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const { data, error } = await db.rpc("pagamenti_webhook_rimborso_finalizza", {
    p_ordine_id: ORDER_ID,
    p_negozio_id: values.storeId ?? STORE_ID,
    p_payment_intent: values.paymentIntent ?? PAYMENT_INTENT,
    p_charge_id: values.chargeId ?? `ch_3c_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    p_amount_refunded: values.refunded ?? 30,
    p_amount_captured: values.captured === undefined ? 100 : values.captured,
    p_currency: values.currency === undefined ? "EUR" : values.currency,
  });
  return {
    data: (data ?? null) as Record<string, unknown> | null,
    error: error ? { message: error.message } : null,
  };
}

async function main(): Promise<void> {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = ENCRYPTION_KEY;
  const db = dbAdmin();

  try {
    installMigration();
    await setup(db);

    console.log("\n=== RPC REFUND — VALIDAZIONI E MONOTONICITÀ ===\n");
    await resetOrder(db);
    let result = await rpcRefund(db, { refunded: 30 });
    check("partial refund 30 accettato", result.error === null && result.data?.ok === true && result.data?.stato === "partially_refunded");
    let state = await snapshot(db);
    check("partial refund aggiorna accounting a 30", Number(state.payment_refunded_amount) === 30 && state.payment_status === "partially_refunded", state);

    result = await rpcRefund(db, { refunded: 50 });
    check("cumulative refund 50 accettato", result.error === null && result.data?.ok === true && result.data?.stato === "partially_refunded");
    result = await rpcRefund(db, { refunded: 100 });
    check("full refund 100 accettato", result.error === null && result.data?.ok === true && result.data?.stato === "refunded");
    state = await snapshot(db);
    check("30 → 50 → 100 termina refunded", Number(state.payment_refunded_amount) === 100 && state.payment_status === "refunded", state);
    check("PaymentIntent originale invariato", state.payment_transaction_id === PAYMENT_INTENT);

    result = await rpcRefund(db, { refunded: 30 });
    check("100 → 30 è no-op monotonic", result.error === null && result.data?.ok === true && result.data?.cambiato === false, result);
    state = await snapshot(db);
    check("100 → 30 non regredisce", Number(state.payment_refunded_amount) === 100 && state.payment_status === "refunded", state);
    result = await rpcRefund(db, { refunded: 100 });
    check("100 → 100 è no-op", result.error === null && result.data?.ok === true && result.data?.cambiato === false, result);

    await resetOrder(db);
    result = await rpcRefund(db, { refunded: 101 });
    check("refund 101 > paid 100 rifiutato", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_AMOUNT_INVALID", result);
    state = await snapshot(db);
    check("over-refund non modifica accounting/stato", Number(state.payment_refunded_amount) === 0 && state.payment_status === "paid", state);
    result = await rpcRefund(db, { refunded: 100, captured: 99 });
    check("refund 100 > captured 99 rifiutato", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_AMOUNT_INVALID", result);
    result = await rpcRefund(db, { refunded: 30, currency: "USD" });
    check("currency mismatch rifiutato", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_CURRENCY_MISMATCH", result);
    result = await rpcRefund(db, { refunded: 30, paymentIntent: "pi_other" });
    check("PaymentIntent mismatch rifiutato", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_PAYMENTINTENT_MISMATCH", result);
    result = await rpcRefund(db, { refunded: 30, storeId: "b3c00000-0000-4000-8000-000000000099" });
    check("merchant mismatch rifiutato", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_BINDING_MISMATCH", result);

    await resetOrder(db);
    await db.from("ordini").update({ payment_provider: "paypal" }).eq("id", ORDER_ID);
    result = await rpcRefund(db, { refunded: 30 });
    check("provider mismatch rifiutato", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_PROVIDER_MISMATCH", result);
    await db.from("ordini").update({ payment_provider: "stripe" }).eq("id", ORDER_ID);

    await resetOrder(db);
    const { error: duplicateSessionError } = await db.from("pagamenti_sessioni").insert({
      ordine_id: ORDER_ID,
      negozio_id: STORE_ID,
      provider: "stripe",
      payment_id: SESSION_ID,
      status: "paid",
      amount: 100,
      currency: "EUR",
    });
    check("fixture sessione duplicata creata", duplicateSessionError === null, duplicateSessionError);
    result = await rpcRefund(db, { refunded: 30 });
    check("session ambiguity rifiutata fail-closed", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_SESSION_AMBIGUA", result);
    await db.from("pagamenti_sessioni").delete().eq("ordine_id", ORDER_ID).eq("payment_id", SESSION_ID);
    await db.from("pagamenti_sessioni").insert({ ordine_id: ORDER_ID, negozio_id: STORE_ID, provider: "stripe", payment_id: SESSION_ID, status: "paid", amount: 100, currency: "EUR" });

    await resetOrder(db, "pending", 0);
    result = await rpcRefund(db, { refunded: 30 });
    check("refund su ordine non pagato rifiutato", result.error === null && result.data?.ok === false && result.data?.codice === "REFUND_NON_CONSENTITO", result);
    state = await snapshot(db);
    check("ordine non pagato resta invariato", state.payment_status === "pending" && Number(state.payment_refunded_amount) === 0, state);

    console.log("\n=== RPC REFUND — OUT-OF-ORDER E CONCORRENZA ===\n");
    await resetOrder(db);
    for (const amount of [30, 100, 50]) {
      result = await rpcRefund(db, { refunded: amount });
      check(`sequenza out-of-order con cumulative ${amount} non corrompe`, result.error === null && result.data?.ok === true, result);
    }
    state = await snapshot(db);
    check("30 → 100 → 50 termina 100/refunded", Number(state.payment_refunded_amount) === 100 && state.payment_status === "refunded", state);

    await resetOrder(db);
    const concurrencySql = (amount: number, suffix: string) => `select public.pagamenti_webhook_rimborso_finalizza('${ORDER_ID}', '${STORE_ID}', '${PAYMENT_INTENT}', 'ch_concurrent_${suffix}', ${amount}, 100, 'EUR');`;
    const [a, b] = await Promise.all([psqlAsync(concurrencySql(30, "a")), psqlAsync(concurrencySql(50, "b"))]);
    check("due refund event concorrenti terminano senza errore", a.code === 0 && b.code === 0, { a: a.stderr, b: b.stderr });
    state = await snapshot(db);
    check("concorrenza mantiene il massimo valido", Number(state.payment_refunded_amount) === 50 && state.payment_status === "partially_refunded", state);
    check("concorrenza preserva PaymentIntent", state.payment_transaction_id === PAYMENT_INTENT);

    console.log("\n=== RPC REFUND — FAILURE DB E GUARDIA REFUND→COMPLETED ===\n");
    await resetOrder(db);
    const refundWebhookRaw = JSON.stringify({
      id: "evt_3c_refund_webhook",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_3c_webhook",
          payment_intent: PAYMENT_INTENT,
          amount_refunded: 3000,
          amount_captured: 10000,
          currency: "eur",
        },
      },
    });
    const refundWebhook = await gestisciWebhookStripe(refundWebhookRaw, new Headers({
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({
        payload: refundWebhookRaw,
        secret: WEBHOOK_SECRET,
      }),
    }));
    state = await snapshot(db);
    const { data: refundEvent } = await db.from("pagamenti_eventi").select("status").eq("event_id", "evt_3c_refund_webhook").single();
    check("charge.refunded webhook → HTTP 200", refundWebhook.status === 200, refundWebhook);
    check("charge.refunded converte cents e aggiorna partial", state.payment_status === "partially_refunded" && Number(state.payment_refunded_amount) === 30, state);
    check("charge.refunded event finalized", refundEvent?.status === "processed", refundEvent);

    const refundDuplicate = await gestisciWebhookStripe(refundWebhookRaw, new Headers({
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({
        payload: refundWebhookRaw,
        secret: WEBHOOK_SECRET,
      }),
    }));
    check("charge.refunded duplicate → HTTP 200 no-op", refundDuplicate.status === 200 && refundDuplicate.body.includes("già processato"), refundDuplicate);

    await resetOrder(db);
    const beforeDbFailure = await snapshot(db);
    psql("revoke execute on function public.pagamenti_webhook_rimborso_finalizza(uuid, uuid, text, text, numeric, numeric, text) from service_role;");
    const denied = await rpcRefund(db, { refunded: 30 });
    psql("grant execute on function public.pagamenti_webhook_rimborso_finalizza(uuid, uuid, text, text, numeric, numeric, text) to service_role;");
    check("DB/permission failure restituisce errore, non successo", denied.error !== null, denied.error);
    const afterDbFailure = await snapshot(db);
    check("DB/permission failure lascia ordine invariato", JSON.stringify(afterDbFailure) === JSON.stringify(beforeDbFailure), { beforeDbFailure, afterDbFailure });

    await resetOrder(db, "refunded", 100);
    const completedRaw = JSON.stringify({
      id: "evt_3c_completed_after_refund",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: SESSION_ID,
          client_reference_id: ORDER_ID,
          metadata: { ordine_id: ORDER_ID, negozio_id: STORE_ID },
          payment_status: "paid",
          amount_total: 10000,
          currency: "eur",
          payment_intent: PAYMENT_INTENT,
        },
      },
    });
    const completed = await gestisciWebhookStripe(completedRaw, new Headers({
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: completedRaw, secret: WEBHOOK_SECRET }),
    }));
    state = await snapshot(db);
    check("refund → completed non torna paid", completed.status === 503, completed);
    check("refund → completed preserva refunded/accounting", state.payment_status === "refunded" && Number(state.payment_refunded_amount) === 100, state);
  } catch (error) {
    check("setup/esecuzione 3C", false, error instanceof Error ? error.message : String(error));
  } finally {
    await db.from("pagamenti_eventi").delete().like("event_id", "evt_3c_%");
    await db.from("pagamenti_sessioni").delete().eq("ordine_id", ORDER_ID);
    await db.from("ordini").delete().eq("id", ORDER_ID);
    await db.from("negozio_pagamenti").delete().eq("negozio_id", STORE_ID);
    await db.from("negozi").delete().eq("id", STORE_ID);
  }

  console.log(`\nWEBHOOK REFUND 3C: ${passati} PASS / ${falliti} FAIL`);
  process.exit(falliti === 0 ? 0 : 1);
}

void main();
