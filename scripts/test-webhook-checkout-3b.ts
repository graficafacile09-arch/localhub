/**
 * FASE 10 BLOCCO 3B — checkout.session.completed hardening.
 *
 * Usa il Supabase locale reale (service role) e una firma Stripe generata
 * localmente. Nessuna chiamata Stripe reale e nessun database remoto.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  gestisciWebhookStripe,
  validaCheckoutSessionCompletata,
} from "../lib/pagamenti/webhook-stripe";

const STORE_ID = "b3000000-0000-4000-8000-000000000001";
const ORDER_ID = "b3000000-0000-4000-8000-000000000002";
const SESSION_ID = "cs_3b_local_001";
const PAYMENT_INTENT = "pi_3b_local_001";
const WEBHOOK_SECRET = "whsec_3b_local_test";
const ENCRYPTION_KEY = "fase10-blocco-3b-local-encryption-key";
const PREFIX = "fase10-3b-local";

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
    // The caller may already have supplied the local environment.
  }
}

function dbAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mancano le variabili Supabase locali");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: `evt_3b_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: SESSION_ID,
        client_reference_id: ORDER_ID,
        metadata: { ordine_id: ORDER_ID, negozio_id: STORE_ID },
        payment_status: "paid",
        amount_total: 2500,
        currency: "eur",
        payment_intent: PAYMENT_INTENT,
        ...overrides,
      },
    },
  });
}

function sign(raw: string): Headers {
  return new Headers({
    "stripe-signature": Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: WEBHOOK_SECRET,
    }),
  });
}

function localBinding() {
  return {
    session: {
      ordineId: ORDER_ID,
      negozioId: STORE_ID,
      provider: "stripe",
      paymentId: SESSION_ID,
      status: "pending",
      amount: 25,
      currency: "EUR",
    },
    ordine: {
      id: ORDER_ID,
      negozioId: STORE_ID,
      totale: 25,
      paymentProvider: "stripe",
      paymentId: SESSION_ID,
      paymentTransactionId: null,
      paymentAmount: 25,
      paymentCurrency: "EUR",
      paymentStatus: "pending",
      stato: "in_preparazione",
    },
  };
}

async function installFixture(db: SupabaseClient): Promise<void> {
  await db.from("pagamenti_eventi").delete().like("event_id", "evt_3b_%");
  await db.from("pagamenti_sessioni").delete().eq("ordine_id", ORDER_ID);
  await db.from("ordini").delete().eq("id", ORDER_ID);
  await db.from("negozio_pagamenti").delete().eq("negozio_id", STORE_ID);
  await db.from("negozi").delete().eq("id", STORE_ID);

  const { error: storeError } = await db.from("negozi").insert({
    id: STORE_ID,
    nome: "Fase 10 Blocco 3B Store",
    slug: `${PREFIX}-store`,
    attivo: true,
    is_demo: true,
  });
  if (storeError) throw new Error(`negozio fixture: ${storeError.message}`);

  const { data: saved, error: configError } = await db.rpc("pagamenti_credenziali_salva", {
    p_negozio_id: STORE_ID,
    p_provider: "stripe",
    p_attivo: true,
    p_test_mode: true,
    p_secret: "sk_test_3b_local",
    p_webhook_secret: WEBHOOK_SECRET,
    p_chiave: ENCRYPTION_KEY,
  });
  if (configError || (saved as { ok?: boolean } | null)?.ok !== true) {
    throw new Error(`config fixture: ${configError?.message ?? JSON.stringify(saved)}`);
  }

  const { error: orderError } = await db.from("ordini").insert({
    id: ORDER_ID,
    idempotency_key: `${PREFIX}-order`,
    modalita: "ritiro",
    totale: 25,
    negozio_id: STORE_ID,
    negozio_nome: "Fase 10 Blocco 3B Store",
    cliente_nome: "Test",
    cliente_cognome: "Checkout",
    cliente_email: "fase10-3b@local.test",
    cliente_telefono: "3330000000",
    payment_status: "pending",
    payment_provider: "stripe",
    payment_id: SESSION_ID,
    payment_amount: 25,
    payment_currency: "EUR",
    payment_transaction_id: null,
  });
  if (orderError) throw new Error(`ordine fixture: ${orderError.message}`);

  const { error: sessionError } = await db.from("pagamenti_sessioni").insert({
    ordine_id: ORDER_ID,
    negozio_id: STORE_ID,
    provider: "stripe",
    payment_id: SESSION_ID,
    status: "pending",
    amount: 25,
    currency: "EUR",
  });
  if (sessionError) throw new Error(`sessione fixture: ${sessionError.message}`);
}

async function resetPending(db: SupabaseClient): Promise<void> {
  await db.from("pagamenti_eventi").delete().like("event_id", "evt_3b_%");
  await db.from("ordini").update({
    stato: "in_preparazione",
    payment_status: "pending",
    payment_provider: "stripe",
    payment_id: SESSION_ID,
    payment_transaction_id: null,
    payment_amount: 25,
    payment_currency: "EUR",
  }).eq("id", ORDER_ID);
  await db.from("pagamenti_sessioni").update({ status: "pending" }).eq("ordine_id", ORDER_ID);
}

async function cleanup(db: SupabaseClient): Promise<void> {
  await db.from("pagamenti_eventi").delete().like("event_id", "evt_3b_%");
  await db.from("pagamenti_sessioni").delete().eq("ordine_id", ORDER_ID);
  await db.from("ordini").delete().eq("id", ORDER_ID);
  await db.from("negozio_pagamenti").delete().eq("negozio_id", STORE_ID);
  await db.from("negozi").delete().eq("id", STORE_ID);
}

async function main(): Promise<void> {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = ENCRYPTION_KEY;
  const db = dbAdmin();

  try {
    await installFixture(db);
    const base = localBinding();

    console.log("\n=== VALIDATORE CHECKOUT SESSION — FAIL CLOSED ===\n");
    const valid = {
      id: SESSION_ID,
      clientReferenceId: ORDER_ID,
      metadata: { ordine_id: ORDER_ID, negozio_id: STORE_ID },
      paymentStatus: "paid",
      amountTotal: 2500,
      currency: "eur",
      paymentIntent: PAYMENT_INTENT,
    };
    check("happy path: binding completo valido", validaCheckoutSessionCompletata(valid, STORE_ID, base).ok === true);
    check("amount inferiore rifiutato", validaCheckoutSessionCompletata({ ...valid, amountTotal: 2499 }, STORE_ID, base).ok === false);
    check("amount superiore rifiutato", validaCheckoutSessionCompletata({ ...valid, amountTotal: 2501 }, STORE_ID, base).ok === false);
    check("amount null rifiutato", validaCheckoutSessionCompletata({ ...valid, amountTotal: null }, STORE_ID, base).ok === false);
    check("currency diversa rifiutata", validaCheckoutSessionCompletata({ ...valid, currency: "usd" }, STORE_ID, base).ok === false);
    check("payment_status unpaid rifiutato", validaCheckoutSessionCompletata({ ...valid, paymentStatus: "unpaid" }, STORE_ID, base).ok === false);
    check("payment_status no_payment_required rifiutato", validaCheckoutSessionCompletata({ ...valid, paymentStatus: "no_payment_required" }, STORE_ID, base).ok === false);
    check("payment_status mancante rifiutato", validaCheckoutSessionCompletata({ ...valid, paymentStatus: undefined }, STORE_ID, base).ok === false);
    check("merchant mismatch rifiutato", validaCheckoutSessionCompletata(valid, "b3000000-0000-4000-8000-000000000099", base).ok === false);
    check("provider mismatch rifiutato", validaCheckoutSessionCompletata(valid, STORE_ID, { ...base, ordine: { ...base.ordine, paymentProvider: "paypal" } }).ok === false);
    check("client_reference_id e metadata divergenti rifiutati", validaCheckoutSessionCompletata({ ...valid, clientReferenceId: "b3000000-0000-4000-8000-000000000099" }, STORE_ID, base).ok === false);
    check("Checkout Session diversa rifiutata", validaCheckoutSessionCompletata({ ...valid, id: "cs_other" }, STORE_ID, base).ok === false);
    check("PaymentIntent diverso rifiutato", validaCheckoutSessionCompletata({ ...valid, paymentIntent: "pi_other" }, STORE_ID, { ...base, ordine: { ...base.ordine, paymentTransactionId: PAYMENT_INTENT } }).ok === false);
    check("ordine cancellato rifiutato", validaCheckoutSessionCompletata(valid, STORE_ID, { ...base, ordine: { ...base.ordine, stato: "cancellato" } }).ok === false);

    console.log("\n=== WEBHOOK REALE — POSTGRESQL LOCALE ===\n");
    const happyRaw = payload();
    const happy = await gestisciWebhookStripe(happyRaw, sign(happyRaw));
    const { data: paidOrder } = await db.from("ordini").select("payment_status, payment_transaction_id, payment_amount").eq("id", ORDER_ID).single();
    const { data: paidSession } = await db.from("pagamenti_sessioni").select("status").eq("ordine_id", ORDER_ID).single();
    check("happy path webhook → HTTP 200", happy.status === 200, happy);
    check("happy path marca paid e conserva importo", paidOrder?.payment_status === "paid" && Number(paidOrder.payment_amount) === 25, paidOrder);
    check("happy path salva il PaymentIntent corretto", paidOrder?.payment_transaction_id === PAYMENT_INTENT, paidOrder?.payment_transaction_id);
    check("happy path aggiorna la sessione corretta", paidSession?.status === "paid", paidSession);

    const duplicate = await gestisciWebhookStripe(happyRaw, sign(happyRaw));
    check("duplicate processed → HTTP 200 senza doppio processing", duplicate.status === 200 && duplicate.body.includes("già processato"), duplicate);

    await resetPending(db);
    const mismatchRaw = payload({ amount_total: 2499 });
    const mismatch = await gestisciWebhookStripe(mismatchRaw, sign(mismatchRaw));
    const { data: unchanged } = await db.from("ordini").select("payment_status, payment_amount").eq("id", ORDER_ID).single();
    const { data: mismatchEvent } = await db.from("pagamenti_eventi").select("status").eq("event_id", JSON.parse(mismatchRaw).id).single();
    check("amount mismatch webhook → HTTP 503", mismatch.status === 503, mismatch);
    check("amount mismatch non marca paid e non altera importo", unchanged?.payment_status === "pending" && Number(unchanged.payment_amount) === 25, unchanged);
    check("amount mismatch evento retryable", mismatchEvent?.status === "error", mismatchEvent);

    await resetPending(db);
    const sessionDuplicate = await db.from("pagamenti_sessioni").insert({
      ordine_id: ORDER_ID,
      negozio_id: STORE_ID,
      provider: "stripe",
      payment_id: SESSION_ID,
      status: "paid",
      amount: 25,
      currency: "EUR",
    });
    check("fixture ambigua: seconda sessione compatibile rifiutata dal DB-path", sessionDuplicate.error === null, sessionDuplicate.error);
    const ambiguousRaw = payload();
    const ambiguous = await gestisciWebhookStripe(ambiguousRaw, sign(ambiguousRaw));
    check("correlazione ambigua → HTTP 503/fail closed", ambiguous.status === 503, ambiguous);
  } catch (error) {
    check("setup/esecuzione 3B", false, error instanceof Error ? error.message : String(error));
  } finally {
    await cleanup(db);
  }

  console.log(`\nCHECKOUT 3B: ${passati} PASS / ${falliti} FAIL`);
  process.exit(falliti === 0 ? 0 : 1);
}

void main();
