/**
 * PAGAMENTI — WEBHOOK STRIPE (FASE F1, solo server).
 *
 * Riceve gli eventi di Stripe Checkout per TUTTI i negozi (endpoint unico
 * /api/webhook/pagamenti/stripe): la firma viene verificata provando i
 * signing secret delle configurazioni Stripe attive (la firma identifica
 * anche l'account del negozio mittente).
 *
 * Idempotenza: ogni evento viene registrato in `pagamenti_eventi` con
 * event_id UNIQUE → un webhook duplicato non viene mai riprocessato.
 * Il doppio pagamento/doppia cattura è inoltre bloccato dalla macchina a
 * stati `aggiorna_payment_status` (paid→paid = no-op).
 *
 * Eventi gestiti (endpoint UNICO della piattaforma, un solo
 * STRIPE_WEBHOOK_SECRET):
 *   - checkout.session.completed  → payment_status = paid + email conferma
 *   - checkout.session.expired    → RPC pagamenti_ordine_scaduto (riserva
 *                                   stock con scadenza, ordine annullato)
 *   - charge.refunded             → refunded | partially_refunded
 *   - payment_intent.payment_failed → sessione failed (ordine resta pending)
 *   - charge.dispute.created/closed → marcatore payment_disputed_at
 *   - payout.paid/failed/updated  → tracking payout interno (V1)
 *   - account.updated             → stato onboarding del connected account
 *                                   (Soluzione A: integrato qui, NON su un
 *                                   secondo endpoint — un solo whsec)
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getConfigStripeNegozio,
  getNegozioIdByStripeAccount,
  getStripeConnectAccount,
} from "./config";
import { GatewayStripe, verificaEventoStripe, type GatewayStripeOptions } from "./stripe";
import {
  getStripePlatformWebhookSecret,
  statoOnboardingDaAccount,
} from "./stripe-connect";
import type Stripe from "stripe";
import { inviaEmailConfermaPagamento } from "@/lib/cliente/ordine-email";
import { inviaNotificaNuovoOrdine } from "@/lib/notifiche/whatsapp";
import { notificaNuovoOrdineAdmin } from "@/lib/amministratore/notifiche";

export type EsitoWebhook = { status: number; body: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventoConfronto = {
  eventId: string;
  eventType: string;
  negozioId: string;
  ordineId: string | null;
  paymentId: string;
};

type EsitoAcquisizioneEvento =
  | { ok: true; acquired: boolean; terminal: boolean; inCorso: boolean; attempts: number }
  | { ok: false; errore: string };

type EsitoFinalizzazioneEvento =
  | { ok: true; stato: "processed" | "error"; giaProcessato?: boolean }
  | { ok: false; errore: string };

type CheckoutSessionLocalBinding = {
  session: {
    ordineId: string;
    negozioId: string;
    provider: string;
    paymentId: string | null;
    status: string;
    amount: unknown;
    currency: unknown;
  };
  ordine: {
    id: string;
    negozioId: string;
    totale: unknown;
    paymentProvider: string | null;
    paymentId: string | null;
    paymentTransactionId: string | null;
    paymentAmount: unknown;
    paymentCurrency: unknown;
    paymentStatus: string | null;
    stato: string;
  };
};

type CheckoutSessionCompletedPayload = {
  id: unknown;
  clientReferenceId: unknown;
  metadata: Record<string, unknown> | null;
  paymentStatus: unknown;
  amountTotal: unknown;
  currency: unknown;
  paymentIntent: unknown;
};

type EsitoValidazioneCheckout =
  | { ok: true; importo: number; transactionId: string | null }
  | { ok: false; errore: string };

type RefundCandidate = {
  id: string;
  amount: unknown;
  status: unknown;
  metadata?: Record<string, unknown> | null;
  payment_intent?: unknown;
  charge?: unknown;
  currency?: unknown;
};

type RefundMatch =
  | { kind: "matched"; operationId: string; refundId: string; amount: number }
  | { kind: "unmatched_external"; reason: string }
  | { kind: "ambiguous"; reason: string }
  | { kind: "invalid"; reason: string }
  | { kind: "duplicate"; operationId: string; refundId: string; amount: number }
  | { kind: "duplicate_cumulative"; reason: string };

function stringaNonVuota(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Converte un importo locale major-unit in centesimi senza floating point. */
function euroInCentesimi(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const [interi, decimali = ""] = raw.split(".");
  const cents = Number(`${interi}${decimali.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

function stripeMinorUnits(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function stripeMinorUnitsToEuro(value: unknown): number | null {
  const minorUnits = stripeMinorUnits(value);
  if (minorUnits === null) return null;
  const majorUnits = minorUnits / 100;
  return Number.isSafeInteger(minorUnits) && Number.isFinite(majorUnits) ? majorUnits : null;
}

function valuta(value: unknown): string | null {
  const normalized = stringaNonVuota(value)?.toUpperCase() ?? null;
  return normalized;
}

function uuid(value: unknown): string | null {
  const text = stringaNonVuota(value);
  return text && UUID_RE.test(text) ? text : null;
}

function refundCandidatesDaCharge(charge: Record<string, unknown>): RefundCandidate[] {
  const refunds = charge.refunds as { data?: RefundCandidate[] } | null | undefined;
  return Array.isArray(refunds?.data) ? refunds.data : [];
}

function metadataOperationBinding(refund: RefundCandidate): { present: boolean; operationId: string | null } {
  const metadata = refund.metadata ?? null;
  if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, "refund_operation_id")) {
    return { present: false, operationId: null };
  }
  return { present: true, operationId: uuid(metadata.refund_operation_id) };
}

function operationMatch(
  operation: { id: string; importo: unknown; stato: string; refund_id: string | null },
  refund: RefundCandidate,
  expectedPaymentIntent: string,
  expectedChargeId: string,
  expectedCurrency: string
): RefundMatch {
  const refundId = stringaNonVuota(refund.id);
  const amount = stripeMinorUnitsToEuro(refund.amount);
  const refundPaymentIntent = typeof refund.payment_intent === "string"
    ? refund.payment_intent
    : (refund.payment_intent as { id?: unknown } | null)?.id;
  if (!refundId || amount === null) return { kind: "invalid", reason: "Refund Stripe incompleto" };
  const refundCharge = typeof refund.charge === "string"
    ? refund.charge
    : (refund.charge as { id?: unknown } | null)?.id;
  if (refundPaymentIntent && refundPaymentIntent !== expectedPaymentIntent) {
    return { kind: "invalid", reason: "Refund con PaymentIntent diverso" };
  }
  if (refundCharge && refundCharge !== expectedChargeId) {
    return { kind: "invalid", reason: "Refund con Charge diverso" };
  }
  if (refund.currency != null && valuta(refund.currency) !== expectedCurrency) {
    return { kind: "invalid", reason: "Refund con valuta diversa" };
  }
  if (amount !== Number(operation.importo)) return { kind: "invalid", reason: "importo Refund diverso dall'operation" };
  return operation.stato === "succeeded"
    ? { kind: "duplicate", operationId: operation.id, refundId, amount }
    : { kind: "matched", operationId: operation.id, refundId, amount };
}

function scegliRefund(
  charge: Record<string, unknown>,
  operations: Array<{ id: string; importo: unknown; stato: string; refund_id: string | null }>,
  amountRefunded: number,
  paymentIntent: string,
  chargeId: string,
  accounting: number,
  refundDelta: number | null,
  currency: string
): RefundMatch {
  const succeeded = refundCandidatesDaCharge(charge)
    .filter((refund) => refund.status === "succeeded" && stringaNonVuota(refund.id));
  if (succeeded.length === 0) return { kind: "unmatched_external", reason: "refund object non espanso" };

  // Strongest binding: Refund metadata written by the durable refund path.
  const metadataBound = succeeded.map((refund) => ({ refund, binding: metadataOperationBinding(refund) }))
    .filter(({ binding }) => binding.present);
  const metadataMatches = metadataBound
    .map(({ refund, binding }) => ({ refund, operation: binding.operationId ? operations.find((candidate) => candidate.id === binding.operationId) : undefined }))
    .filter(({ operation }) => operation);
  if (metadataBound.some(({ binding }) => binding.present && !binding.operationId)) {
    return { kind: "invalid", reason: "refund_operation_id metadata non valido" };
  }
  if (metadataMatches.length > 1) {
    const unresolved = metadataMatches.filter(({ operation }) => operation && operation.stato !== "succeeded");
    if (unresolved.length !== 1) return { kind: "ambiguous", reason: "più Refund metadata-bound" };
    return operationMatch(unresolved[0].operation as NonNullable<typeof unresolved[0]["operation"]>, unresolved[0].refund, paymentIntent, chargeId, currency);
  }
  if (metadataBound.length === 1 && metadataMatches.length === 0) {
    return { kind: "invalid", reason: "refund_operation_id inesistente" };
  }
  if (metadataMatches.length === 1) {
    const { refund, operation } = metadataMatches[0];
    if (operation?.refund_id && operation.refund_id !== String(refund.id)) {
      return { kind: "invalid", reason: "metadata e Refund ID persistito divergenti" };
    }
    return operationMatch(operation as NonNullable<typeof operation>, refund, paymentIntent, chargeId, currency);
  }

  // Second strongest binding: the Refund ID already stored locally. If a
  // historical operation is already complete, keep looking for the current
  // unresolved refund in the same cumulative Charge.
  const persisted = succeeded.map((refund) => ({
    refund,
    operation: operations.find((operation) => operation.refund_id === String(refund.id)),
  })).filter(({ operation }) => operation);
  const persistedUnresolved = persisted.filter(({ operation }) => operation?.stato !== "succeeded");
  if (persistedUnresolved.length > 1) return { kind: "ambiguous", reason: "più operation associate allo stesso Refund ID" };
  if (persistedUnresolved.length === 1) {
    return operationMatch(persistedUnresolved[0].operation as NonNullable<typeof persistedUnresolved[0]["operation"]>, persistedUnresolved[0].refund, paymentIntent, chargeId, currency);
  }
  if (persisted.length > 0 && amountRefunded <= accounting) {
    return { kind: "duplicate_cumulative", reason: "Refund già contabilizzato" };
  }

  // Weak fallback is allowed only when exactly one local unresolved operation
  // and exactly one individual Refund make the binding deterministic. The
  // cumulative amount alone never selects an operation.
  const compatible = operations.filter((operation) =>
    ["pending", "processing", "failed", "reconciliation_required"].includes(operation.stato)
    && Number(operation.importo) > 0
    && Number(operation.importo) <= amountRefunded
  );
  const deltaCompatible = refundDelta !== null && refundDelta > 0
    ? compatible.filter((operation) => Number(operation.importo) === refundDelta)
    : [];
  const operationsForFallback = deltaCompatible.length === 1 ? deltaCompatible : compatible;
  const individualMatches = succeeded.filter((refund) =>
    operationsForFallback.some((operation) => stripeMinorUnitsToEuro(refund.amount) === Number(operation.importo))
  );
  const operationByIndividualAmount = operationsForFallback.filter((operation) =>
    individualMatches.some((refund) => stripeMinorUnitsToEuro(refund.amount) === Number(operation.importo))
  );
  if (operationByIndividualAmount.length !== 1 || individualMatches.length !== 1) {
    return operationByIndividualAmount.length > 1 || individualMatches.length > 1
      ? { kind: "ambiguous", reason: "più operation compatibili per PaymentIntent/importo" }
      : { kind: "unmatched_external", reason: "nessuna operation locale deterministica" };
  }
  return operationMatch(operationByIndividualAmount[0], individualMatches[0], paymentIntent, chargeId, currency);
}

function opzioniLookupStripe(): GatewayStripeOptions | undefined {
  const host = stringaNonVuota(process.env.STRIPE_API_HOST);
  if (!host) return undefined;
  const port = Number(process.env.STRIPE_API_PORT ?? 443);
  return {
    host,
    port: Number.isInteger(port) && port > 0 ? port : 443,
    protocol: process.env.STRIPE_API_PROTOCOL === "http" ? "http" : "https",
  };
}

async function arricchisciChargeStripe(
  negozioId: string,
  chargeId: string,
  charge: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const embedded = refundCandidatesDaCharge(charge);
  if (embedded.length > 0) return charge;

  try {
    let cred: { secret?: string; webhookSecret?: string; stripeAccountId?: string; testMode: boolean } | null = null;
    const config = await getConfigStripeNegozio(negozioId);
    if (config) {
      cred = {
        secret: config.secretKey,
        webhookSecret: config.webhookSecret,
        stripeAccountId: config.accountId,
        testMode: config.testMode,
      };
    } else {
      const connect = await getStripeConnectAccount(negozioId);
      if (connect) {
        cred = {
          stripeAccountId: connect.accountId,
          testMode: connect.testMode,
        };
      }
    }
    // Local operations require a real Refund object and its Refund ID. If the
    // verified merchant credentials are unavailable, retry the event instead
    // of downgrading a local operation to an external refund.
    if (!cred) return null;

    const details = await new GatewayStripe(opzioniLookupStripe()).refundsDaCharge(chargeId, cred);
    if (details.paymentIntent && details.paymentIntent !== String(charge.payment_intent ?? "")) {
      throw new Error("Charge lookup con PaymentIntent divergente");
    }
    return {
      ...charge,
      amount_refunded: details.amountRefunded,
      amount_captured: details.amountCaptured,
      currency: details.currency,
      refunds: { data: details.refunds },
    };
  } catch (error) {
    console.warn(`[pagamenti] impossibile arricchire Charge ${chargeId}: ${error instanceof Error ? error.message : "errore"}`);
    return null;
  }
}

/**
 * Verifica tutto il binding disponibile prima di marcaPagato(). Il PaymentIntent
 * viene confrontato quando il modello locale ne possiede già uno; il normale
 * pending flow lo persiste solo dopo questa prima conferma, quindi in quel caso
 * la correlazione forte è Checkout Session + ordine + merchant + importo.
 */
export function validaCheckoutSessionCompletata(
  payload: CheckoutSessionCompletedPayload,
  negozioId: string,
  locale: CheckoutSessionLocalBinding
): EsitoValidazioneCheckout {
  const sessionId = stringaNonVuota(payload.id);
  if (!sessionId) return { ok: false, errore: "Checkout Session ID mancante" };
  if (sessionId !== locale.session.paymentId || sessionId !== locale.ordine.paymentId) {
    return { ok: false, errore: "Checkout Session non associata alla sessione locale" };
  }
  if (locale.session.ordineId !== locale.ordine.id) {
    return { ok: false, errore: "Ordine/sessione locale incoerenti" };
  }
  if (locale.session.negozioId !== negozioId || locale.ordine.negozioId !== negozioId) {
    return { ok: false, errore: "Merchant non associato all'ordine" };
  }
  if (locale.session.provider !== "stripe" || locale.ordine.paymentProvider !== "stripe") {
    return { ok: false, errore: "Provider non associato all'ordine" };
  }
  if (!["created", "pending", "paid"].includes(locale.session.status)) {
    return { ok: false, errore: "Stato sessione locale incoerente" };
  }
  if (payload.paymentStatus !== "paid") {
    return { ok: false, errore: "Pagamento Stripe non confermato" };
  }

  if (!["pending", "paid"].includes(locale.ordine.paymentStatus ?? "")) {
    return { ok: false, errore: "Stato pagamento locale non coerente" };
  }
  if (locale.ordine.stato === "cancellato") {
    return { ok: false, errore: "Ordine cancellato" };
  }

  const referenceId = stringaNonVuota(payload.clientReferenceId);
  const metadataOrderId = payload.metadata && Object.prototype.hasOwnProperty.call(payload.metadata, "ordine_id")
    ? stringaNonVuota(payload.metadata.ordine_id)
    : null;
  if (payload.clientReferenceId != null && !referenceId) {
    return { ok: false, errore: "client_reference_id non valido" };
  }
  if (payload.metadata && Object.prototype.hasOwnProperty.call(payload.metadata, "ordine_id") && !metadataOrderId) {
    return { ok: false, errore: "metadata.ordine_id non valido" };
  }
  if (referenceId && metadataOrderId && referenceId !== metadataOrderId) {
    return { ok: false, errore: "client_reference_id e metadata.ordine_id divergenti" };
  }
  const correlato = referenceId ?? metadataOrderId;
  if (!correlato || correlato !== locale.ordine.id) {
    return { ok: false, errore: "Ordine non correlato deterministically" };
  }

  const metadataStoreId = payload.metadata && Object.prototype.hasOwnProperty.call(payload.metadata, "negozio_id")
    ? stringaNonVuota(payload.metadata.negozio_id)
    : null;
  if (payload.metadata && Object.prototype.hasOwnProperty.call(payload.metadata, "negozio_id") && metadataStoreId !== negozioId) {
    return { ok: false, errore: "Merchant metadata divergente" };
  }

  const amountTotalCents = stripeMinorUnits(payload.amountTotal);
  const expectedOrderCents = euroInCentesimi(locale.ordine.totale);
  const expectedPaymentCents = euroInCentesimi(locale.ordine.paymentAmount);
  const expectedSessionCents = euroInCentesimi(locale.session.amount);
  if (amountTotalCents === null || expectedOrderCents === null || expectedPaymentCents === null || expectedSessionCents === null) {
    return { ok: false, errore: "Importo checkout mancante o non valido" };
  }
  if (
    amountTotalCents !== expectedOrderCents ||
    amountTotalCents !== expectedPaymentCents ||
    amountTotalCents !== expectedSessionCents
  ) {
    return { ok: false, errore: "Importo checkout diverso dal totale locale" };
  }

  const stripeCurrency = valuta(payload.currency);
  const orderCurrency = valuta(locale.ordine.paymentCurrency);
  const sessionCurrency = valuta(locale.session.currency);
  if (!stripeCurrency || !orderCurrency || !sessionCurrency || stripeCurrency !== "EUR" || orderCurrency !== "EUR" || sessionCurrency !== "EUR") {
    return { ok: false, errore: "Valuta checkout non coerente" };
  }

  const transactionId = stringaNonVuota(
    typeof payload.paymentIntent === "string"
      ? payload.paymentIntent
      : (payload.paymentIntent as { id?: unknown } | null)?.id
  );
  const localTransactionId = stringaNonVuota(locale.ordine.paymentTransactionId);
  if (localTransactionId && transactionId !== localTransactionId) {
    return { ok: false, errore: "PaymentIntent diverso da quello locale" };
  }
  if (localTransactionId && !transactionId) {
    return { ok: false, errore: "PaymentIntent mancante" };
  }

  return { ok: true, importo: amountTotalCents / 100, transactionId };
}

async function caricaBindingCheckout(
  db: ReturnType<typeof createAdminSupabaseClient>,
  ordineId: string,
  negozioId: string,
  paymentId: string
): Promise<CheckoutSessionLocalBinding | null> {
  const { data: ordine, error: ordineError } = await db
    .from("ordini")
    .select(
      "id, negozio_id, stato, totale, payment_status, payment_provider, payment_id, payment_transaction_id, payment_amount, payment_currency"
    )
    .eq("id", ordineId)
    .maybeSingle();
  if (ordineError || !ordine) return null;

  const { data: sessioni, error: sessionError } = await db
    .from("pagamenti_sessioni")
    .select("ordine_id, negozio_id, provider, payment_id, status, amount, currency")
    .eq("ordine_id", ordineId)
    .eq("negozio_id", negozioId)
    .eq("provider", "stripe");
  if (sessionError) return null;

  const compatibili = (sessioni ?? []).filter(
    (sessione) => String(sessione.payment_id ?? "") === paymentId
  );
  if (compatibili.length !== 1) return null;

  const sessione = compatibili[0];
  return {
    session: {
      ordineId: String(sessione.ordine_id),
      negozioId: String(sessione.negozio_id),
      provider: String(sessione.provider),
      paymentId: sessione.payment_id ? String(sessione.payment_id) : null,
      status: String(sessione.status ?? ""),
      amount: sessione.amount,
      currency: sessione.currency,
    },
    ordine: {
      id: String(ordine.id),
      negozioId: String(ordine.negozio_id),
      totale: ordine.totale,
      paymentProvider: (ordine.payment_provider as string | null) ?? null,
      paymentId: ordine.payment_id ? String(ordine.payment_id) : null,
      paymentTransactionId: ordine.payment_transaction_id
        ? String(ordine.payment_transaction_id)
        : null,
      paymentAmount: ordine.payment_amount,
      paymentCurrency: ordine.payment_currency,
      paymentStatus: (ordine.payment_status as string | null) ?? null,
      stato: String(ordine.stato ?? ""),
    },
  };
}

/** Configurazioni Stripe attive da provare per la firma. */
async function configAttive(): Promise<string[]> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("negozio_pagamenti")
    .select("negozio_id")
    .eq("provider", "stripe")
    .eq("attivo", true);
  if (error) return [];
  return (data ?? [])
    .map((r) => String(r.negozio_id))
    .filter((id) => UUID_RE.test(id));
}

/**
 * Verifica la firma del webhook provando le configurazioni attive.
 * Ritorna l'evento decodificato + la config che ha verificato.
 */
async function verificaFirmaMultiNegozio(
  rawBody: string,
  signature: string
): Promise<{ evento: Awaited<ReturnType<typeof verificaEventoStripe>>; negozioId: string } | null> {
  const negozi = await configAttive();
  for (const negozioId of negozi) {
    const config = await getConfigStripeNegozio(negozioId);
    if (!config || !config.webhookSecret) continue;
    const evento = verificaEventoStripe(rawBody, signature, config.webhookSecret);
    if (evento) return { evento, negozioId };
  }
  return null;
}

/**
 * Percorso Stripe CONNECT: verifica con il webhook signing secret DELLA
 * PIATTAFORMA (STRIPE_WEBHOOK_SECRET) e risolve il negozio dall'account
 * collegato (`event.account` → negozio_pagamenti.account_id).
 * null = nessun percorso Connect (secret piattaforma assente, firma invalida
 * o account non riconosciuto) → si ripiega sul percorso legacy multi-negozio.
 */
async function verificaFirmaConnect(
  rawBody: string,
  signature: string
): Promise<{ evento: Awaited<ReturnType<typeof verificaEventoStripe>>; negozioId: string } | null> {
  const platformSecret = getStripePlatformWebhookSecret();
  if (!platformSecret) return null;
  const evento = verificaEventoStripe(rawBody, signature, platformSecret);
  if (!evento) return null;
  const account = (evento as { account?: string | null }).account;
  if (typeof account !== "string" || !account) return null;
  const negozioId = await getNegozioIdByStripeAccount(account);
  if (!negozioId) return null;
  return { evento, negozioId };
}

/** Acquisisce l'evento e distingue nuovo, duplicato terminale, retryable e DB error. */
async function registraEvento(
  e: { eventId: string; eventType: string; ordineId: string | null; negozioId: string; paymentId: string },
  payload: unknown
): Promise<EsitoAcquisizioneEvento> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("pagamenti_evento_acquisisci", {
    p_event_id: e.eventId,
    p_event_type: e.eventType,
    p_ordine_id: e.ordineId,
    p_negozio_id: e.negozioId,
    p_payment_id: e.paymentId || null,
    p_payload: payload,
  });

  if (error) {
    console.error("[pagamenti] acquisizione evento fallita:", error.message);
    return { ok: false, errore: error.message };
  }

  const result = (data ?? null) as {
    ok?: boolean;
    acquired?: boolean;
    terminal?: boolean;
    in_corso?: boolean;
    attempts?: number;
  } | null;
  if (result?.ok !== true) {
    return { ok: false, errore: "acquisizione evento rifiutata" };
  }
  return {
    ok: true,
    acquired: result.acquired === true,
    terminal: result.terminal === true,
    inCorso: result.in_corso === true,
    attempts: Number(result.attempts ?? 0),
  };
}

/** Finalizza l'evento; un errore DB non viene considerato successo. */
async function segnaProcessato(
  eventId: string,
  success: boolean,
  errMessage?: string
): Promise<EsitoFinalizzazioneEvento> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("pagamenti_evento_finalizza", {
    p_event_id: eventId,
    p_success: success,
    p_error: errMessage ?? null,
  });
  if (error) {
    console.error("[pagamenti] finalizzazione evento fallita:", error.message);
    return { ok: false, errore: error.message };
  }
  const result = (data ?? null) as {
    ok?: boolean;
    stato?: "processed" | "error";
    already_processed?: boolean;
  } | null;
  if (result?.ok !== true || (result.stato !== "processed" && result.stato !== "error")) {
    return { ok: false, errore: "finalizzazione evento rifiutata" };
  }
  return {
    ok: true,
    stato: result.stato,
    giaProcessato: result.already_processed === true,
  };
}

/** Porta l'ordine a paid (con inizializzazione legacy fail-safe). */
async function marcaPagato(
  ordineId: string,
  paymentId: string,
  transactionId: string | null,
  importo: number,
  valuta: string
): Promise<{ ok: boolean; errore?: string }> {
  const db = createAdminSupabaseClient();
  const payload = {
    p_ordine_id: ordineId,
    p_nuovo_stato: "paid",
    p_payment_id: paymentId,
    p_transaction_id: transactionId,
    p_importo: importo,
    p_valuta: valuta,
    p_expires_at: null,
  };
  const { data, error } = await db.rpc("aggiorna_payment_status", payload);
  if (error) {
    return { ok: false, errore: error.message };
  }
  const esito = data as { ok?: boolean; codice?: string } | null;
  if (esito?.ok === true) {
    const { error: sessionError } = await db
      .from("pagamenti_sessioni")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("ordine_id", ordineId)
      .eq("provider", "stripe")
      .eq("payment_id", paymentId);
    if (sessionError) {
      return { ok: false, errore: sessionError.message };
    }
    return { ok: true };
  }
  if (esito?.codice === "STATO_LEGACY_DA_INIZIALIZZARE") {
    // Ordine legacy senza payment_status: inizializza a pending e riprova.
    const init = await db.rpc("aggiorna_payment_status", {
      ...payload,
      p_nuovo_stato: "pending",
    });
    if (init.error || (init.data as { ok?: boolean } | null)?.ok !== true) {
      return { ok: false, errore: init.error?.message ?? "inizializzazione stato pagamento fallita" };
    }
    const retry = await db.rpc("aggiorna_payment_status", payload);
    if (retry.error || (retry.data as { ok?: boolean } | null)?.ok !== true) {
      return { ok: false, errore: retry.error?.message ?? "transizione pagamento fallita" };
    }
    const { error: sessionError } = await db
      .from("pagamenti_sessioni")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("ordine_id", ordineId)
      .eq("provider", "stripe")
      .eq("payment_id", paymentId);
    if (sessionError) {
      return { ok: false, errore: sessionError.message };
    }
    return { ok: true };
  }
  // paid→paid = no-op idempotente; altre transizioni → errore.
  return esito?.codice
    ? { ok: false, errore: String(esito.codice) }
    : { ok: false, errore: "transizione non riuscita" };
}

/** Estrae ordineId dall'oggetto sessione (client_reference_id / metadata). */
function ordineIdDaSessione(obj: {
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
}): string | null {
  const ref = obj.client_reference_id ?? obj.metadata?.ordine_id;
  if (typeof ref === "string" && UUID_RE.test(ref)) return ref;
  return null;
}

/**
 * Entry point del webhook. Ritorna sempre lo stato HTTP e il body da
 * restituire a Stripe (200 = processato o duplicato; 400 = firma invalida).
 */
export async function gestisciWebhookStripe(
  rawBody: string,
  headers: Headers
): Promise<EsitoWebhook> {
  const signature = headers.get("stripe-signature");
  if (!signature) {
    return { status: 400, body: "Firma mancante." };
  }

  // 1) Stripe Connect (firma piattaforma + account collegato);
  // 2) fallback legacy direct (firma per-negozio).
  let verificato = await verificaFirmaConnect(rawBody, signature);
  if (!verificato?.evento) {
    verificato = await verificaFirmaMultiNegozio(rawBody, signature);
  }
  if (!verificato?.evento) {
    return { status: 400, body: "Firma non valida." };
  }

  const { evento, negozioId } = verificato;
  const db = createAdminSupabaseClient();

  // ── Identità dell'evento ────────────────────────────────────────────────
  const obj = (evento.data?.object as unknown) as
    | (Record<string, unknown> & {
        client_reference_id?: string | null;
        metadata?: Record<string, string> | null;
      })
    | undefined;

  let ordineId: string | null = null;
  if (evento.type.startsWith("checkout.session.")) {
    ordineId = ordineIdDaSessione(obj ?? {});
  }

  const paymentId =
    typeof obj?.id === "string" ? obj.id : "";
  const confronto: EventoConfronto = {
    eventId: evento.id,
    eventType: evento.type,
    negozioId,
    ordineId,
    paymentId,
  };

  const acquisizione = await registraEvento(confronto, (evento as unknown as { raw?: unknown }).raw ?? evento);
  if (!acquisizione.ok) {
    return { status: 503, body: "Impossibile registrare l'evento; Stripe ritenterà." };
  }
  if (acquisizione.terminal) {
    return { status: 200, body: "Evento già processato." };
  }
  if (!acquisizione.acquired) {
    // Un altro processo possiede ancora il lease: non eseguire il business
    // handler in parallelo e non ACKare definitivamente la consegna.
    return { status: 503, body: "Evento in elaborazione; Stripe ritenterà." };
  }

  try {
    switch (evento.type) {
      case "checkout.session.completed": {
        if (!ordineId) {
          throw new Error("checkout.session.completed senza ordine_id");
        }
        const session = obj as {
          id?: string;
          client_reference_id?: string | null;
          metadata?: Record<string, unknown> | null;
          payment_status?: string;
          amount_total?: number | null;
          currency?: string | null;
          payment_intent?: string | { id?: string } | null;
        };
        const binding = await caricaBindingCheckout(db, ordineId, negozioId, paymentId);
        if (!binding) {
          throw new Error("checkout.session.completed senza binding locale univoco");
        }
        const validazione = validaCheckoutSessionCompletata(
          {
            id: session.id,
            clientReferenceId: session.client_reference_id,
            metadata: session.metadata ?? null,
            paymentStatus: session.payment_status,
            amountTotal: session.amount_total,
            currency: session.currency,
            paymentIntent: session.payment_intent,
          },
          negozioId,
          binding
        );
        if (!validazione.ok) {
          throw new Error(`checkout.session.completed rifiutato: ${validazione.errore}`);
        }
        const esito = await marcaPagato(
          ordineId,
          paymentId,
          validazione.transactionId,
          validazione.importo,
          valuta(session.currency) ?? ""
        );
        if (!esito.ok) {
          throw new Error(`elaborazione completed fallita: ${esito.errore ?? "transizione non riuscita"}`);
        } else {
          // Email di CONFERMA PAGAMENTO al cliente: inviata SOLO qui, dopo che
          // marcaPagato ha registrato payment_status=paid. L'idempotenza è a
          // monte: registraEvento (pagamenti_eventi UNIQUE event_id) fa
          // processare questo evento una sola volta → conferma pagamento
          // inviata una sola volta anche in caso di retry Stripe. Un errore
          // email NON fa fallire il webhook (best-effort + .catch).
          await inviaEmailConfermaPagamento(ordineId).catch(() => {});
          // WhatsApp al negoziante: parte SOLO qui (pagamento CONFERMATO).
          // L'idempotenza è garantita da pagamenti_eventi UNIQUE + dalla
          // transizione paid→paid = no-op di marcaPagato: mai due notifiche
          // per lo stesso ordine. Best-effort: un errore WhatsApp NON tocca
          // lo stato dell'ordine né l'esito del webhook.
          await inviaNotificaNuovoOrdine(ordineId).catch(() => {});
          // Notifica admin — BEST-EFFORT, SOLO a pagamento confermato.
          // Guardie idempotenti a monte (pagamenti_eventi UNIQUE + paid→paid
          // no-op): mai due notifiche per lo stesso ordine.
          await notificaNuovoOrdineAdmin(ordineId).catch(() => {});
        }
        break;
      }

      case "checkout.session.expired": {
        if (!ordineId) {
          throw new Error("checkout.session.expired senza ordine_id");
        }
        // Marca la sessione scaduta e delega alla RPC il ripristino stock
        // (con guardia anti-retry: se esiste una sessione attiva più recente
        // l'ordine NON viene annullato).
        const { error: sessionError } = await db
          .from("pagamenti_sessioni")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("payment_id", paymentId);
        if (sessionError) throw new Error(`aggiornamento sessione scaduta fallito: ${sessionError.message}`);
        const { error: scadErr } = await db.rpc("pagamenti_ordine_scaduto", {
          p_ordine_id: ordineId,
        });
        if (scadErr) {
          throw new Error(`elaborazione scadenza fallita: ${scadErr.message}`);
        }
        break;
      }

      case "charge.refunded": {
        const chargeOriginale = obj as Record<string, unknown>;
        const transactionId =
          typeof chargeOriginale.payment_intent === "string"
            ? chargeOriginale.payment_intent
            : (chargeOriginale.payment_intent as { id?: string } | null)?.id ?? null;
        const chargeId = stringaNonVuota(chargeOriginale.id);
        if (!transactionId || !chargeId) throw new Error("charge.refunded senza PaymentIntent o Charge ID");

        const { data: ordini, error: ordineError } = await db
          .from("ordini")
          .select("id, payment_refunded_amount")
          .eq("negozio_id", negozioId)
          .eq("payment_provider", "stripe")
          .eq("payment_transaction_id", transactionId);
        if (ordineError) throw new Error(`charge.refunded: ricerca ordine fallita: ${ordineError.message}`);
        if (!ordini || ordini.length !== 1) throw new Error("charge.refunded: ordine non associato in modo univoco");

        const orderId = String(ordini[0].id);
        const { data: operations, error: operationsError } = await db
          .from("pagamenti_rimborso_operazioni")
          .select("id, importo, stato, refund_id")
          .eq("ordine_id", orderId)
          .eq("provider", "stripe");
        if (operationsError) throw new Error(`charge.refunded: lookup operation fallito: ${operationsError.message}`);
        const charge = (operations ?? []).length > 0
          ? await arricchisciChargeStripe(negozioId, chargeId, chargeOriginale)
          : chargeOriginale;
        if (!charge) throw new Error("charge.refunded: impossibile recuperare i Refund Stripe");
        const amountRefunded = stripeMinorUnitsToEuro(charge.amount_refunded);
        const amountCaptured = charge.amount_captured == null ? null : stripeMinorUnitsToEuro(charge.amount_captured);
        if (amountRefunded === null || (charge.amount_captured != null && amountCaptured === null)) {
          throw new Error("charge.refunded con importi Stripe non validi");
        }
        const previousAttributes = (evento as unknown as { data?: { previous_attributes?: Record<string, unknown> } }).data?.previous_attributes;
        const previousRefunded = previousAttributes?.amount_refunded == null
          ? null
          : stripeMinorUnitsToEuro(previousAttributes.amount_refunded);
        if (previousAttributes?.amount_refunded != null && previousRefunded === null) {
          throw new Error("charge.refunded con previous amount_refunded non valido");
        }
        // A stale/out-of-order event may carry a lower cumulative amount.
        // 3C compares it with locked local accounting and turns it into a
        // monotonic no-op when the refund was already accounted for.
        const refundDelta = previousRefunded === null || amountRefunded < previousRefunded
          ? null
          : amountRefunded - previousRefunded;

        const match = scegliRefund(
          charge,
          (operations ?? []).map((operation) => ({
            id: String(operation.id),
            importo: operation.importo,
            stato: String(operation.stato),
            refund_id: operation.refund_id ? String(operation.refund_id) : null,
          })),
          amountRefunded,
          transactionId,
          chargeId,
          Number(ordini[0].payment_refunded_amount ?? 0),
          refundDelta,
          valuta(charge.currency) ?? "EUR"
        );

        if (match.kind === "unmatched_external") {
          // No synthetic operation: the current schema has no safe external
          // refund ledger. 3C still validates and applies cumulative
          // accounting for a verified Stripe refund.
          console.warn(`[pagamenti] refund esterno non associato: ${match.reason}`);
          const { data: externalResult, error: externalError } = await db.rpc("pagamenti_webhook_rimborso_finalizza", {
            p_ordine_id: orderId,
            p_negozio_id: negozioId,
            p_payment_intent: transactionId,
            p_charge_id: chargeId,
            p_amount_refunded: amountRefunded,
            p_amount_captured: amountCaptured,
            p_currency: charge.currency,
          });
          if (externalError) throw new Error(`finalizzazione refund esterno fallita: ${externalError.message}`);
          if ((externalResult as { ok?: boolean } | null)?.ok !== true) {
            throw new Error(`refund esterno rifiutato: ${(externalResult as { codice?: string } | null)?.codice ?? "REFUND_INVALIDO"}`);
          }
          break;
        }
        if (match.kind === "ambiguous" || match.kind === "invalid") {
          throw new Error(`refund ${match.kind}: ${match.reason}`);
        }
        if (match.kind === "duplicate_cumulative") break;

        const { data: refundResult, error: refundError } = await db.rpc("pagamenti_webhook_rimborso_operazione_finalizza", {
          p_ordine_id: orderId,
          p_negozio_id: negozioId,
          p_payment_intent: transactionId,
          p_operation_id: match.operationId,
          p_refund_id: match.refundId,
          p_refund_amount: match.amount,
          p_amount_refunded: amountRefunded,
          p_amount_captured: amountCaptured,
          p_currency: charge.currency,
        });
        if (refundError) throw new Error(`finalizzazione refund operation fallita: ${refundError.message}`);
        const result = (refundResult ?? null) as { ok?: boolean; codice?: string } | null;
        if (result?.ok !== true) throw new Error(`finalizzazione refund operation rifiutata: ${result?.codice ?? "REFUND_INVALIDO"}`);
        break;
      }

      // ── Tentativo di pagamento fallito (NON terminale per l'ordine) ────
      // Stripe invia payment_intent.payment_failed quando un tentativo
      // fallisce DENTRO una Checkout Session ancora aperta: il cliente può
      // riprovare, quindi l'ordine resta pending (failed è uno stato
      // terminale nella macchina a stati e bloccherebbe il retry). Si marca
      // solo la sessione come "failed" (stato informativo, testo libero in
      // pagamenti_sessioni); l'esito finale arriva da
      // checkout.session.completed oppure checkout.session.expired. La
      // riconciliazione con l'ordine usa il metadata ordine_id del
      // PaymentIntent (impostato in lib/pagamenti/stripe.ts).
      case "payment_intent.payment_failed": {
        const pi = obj as { metadata?: Record<string, string> | null };
        const ordineId =
          typeof pi.metadata?.ordine_id === "string" &&
          UUID_RE.test(pi.metadata.ordine_id)
            ? pi.metadata.ordine_id
            : null;
        if (!ordineId) {
          throw new Error("payment_intent.payment_failed senza ordine_id (metadata mancante)");
        }
        const { data: sess } = await db
          .from("pagamenti_sessioni")
          .select("id")
          .eq("ordine_id", ordineId)
          .eq("provider", "stripe")
          .in("status", ["created", "pending"])
          .order("created_at", { ascending: false })
          .limit(1);
        if (sess?.[0]) {
          await db
            .from("pagamenti_sessioni")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", String(sess[0].id));
        }
        break;
      }

      // ── Dispute: storno IN SOSPESO, MAI un rimborso automatico ──────────
      // Stripe apre una disputa quando il titolare contesta l'addebito. NON
      // si inventa un rimborso né una transizione di stato (la macchina a
      // stati non ha 'disputed'): l'evento viene registrato (già idempotente
      // in pagamenti_eventi) e l'ordine viene marcato con payment_disputed_at.
      // L'esito economico reale arriva da charge.refunded (disputa persa =
      // Stripe rimborsa) oppure da charge.dispute.closed (marcatore liberato).
      case "charge.dispute.created": {
        const dispute = obj as { payment_intent?: string | { id?: string } | null };
        const transactionId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? null;
        if (!transactionId) {
          throw new Error("charge.dispute.created senza payment_intent");
        }
        const { data: ordini } = await db
          .from("ordini")
          .select("id")
          .or(`payment_transaction_id.eq.${transactionId},payment_id.eq.${transactionId}`)
          .limit(1);
        const ordine = ordini?.[0];
        if (!ordine) {
          throw new Error("charge.dispute.created: ordine non trovato");
        }
        await db
          .from("ordini")
          .update({ payment_disputed_at: new Date().toISOString() })
          .eq("id", String(ordine.id));
        break;
      }

      case "charge.dispute.closed": {
        const dispute = obj as { payment_intent?: string | { id?: string } | null };
        const transactionId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? null;
        if (!transactionId) {
          throw new Error("charge.dispute.closed senza payment_intent");
        }
        const { data: ordini } = await db
          .from("ordini")
          .select("id")
          .or(`payment_transaction_id.eq.${transactionId},payment_id.eq.${transactionId}`)
          .limit(1);
        const ordine = ordini?.[0];
        if (!ordine) {
          throw new Error("charge.dispute.closed: ordine non trovato");
        }
        await db
          .from("ordini")
          .update({ payment_disputed_at: null })
          .eq("id", String(ordine.id));
        break;
      }

      // ── Account Connect aggiornato (Soluzione A): onboarding/abilitazioni ─
      // Stripe notifica ogni modifica a un connected account (KYC, IBAN,
      // restrizioni). Percorso identico agli eventi pagamento Connect: la
      // firma è quella della PIATTAFORMA (STRIPE_WEBHOOK_SECRET, unico) e il
      // negozio è risolto da event.account → negozio_pagamenti.account_id
      // (verificaFirmaConnect). Lo stato viene salvato con la STESSA RPC del
      // webhook Connect (pagamenti_stripe_connect_stato_salva: UPDATE per
      // account_id, idempotente per natura; l'idempotenza evento è garantita
      // da pagamenti_eventi.event_id UNIQUE). Nessun secret nei log.
      case "account.updated": {
        const accountObj = obj as Stripe.Account | undefined;
        if (!accountObj?.id) {
          throw new Error("account.updated senza account id");
        }
        const stato = statoOnboardingDaAccount(accountObj);
        const { error: accErr } = await db.rpc("pagamenti_stripe_connect_stato_salva", {
          p_account_id: accountObj.id,
          p_onboarding_status: stato.status,
          p_payouts_enabled: stato.payoutsEnabled,
          p_charges_enabled: stato.chargesEnabled,
        });
        if (accErr) {
          console.error(
            `[pagamenti] aggiornamento account ${accountObj.id} fallito: ${accErr.message}`
          );
        }
        break;
      }

      // ── Payout (tracking interno V1, SOLO percorsi Connect) ──────────────
      // Gestione READ/TRACKING di payout.paid/failed/updated dei connected
      // account: identifica il payout INTERNO tramite stripe_payout_id (per
      // il negozio risolto da event.account) e aggiorna ESCLUSIVAMENTE
      // tracking/stato/errore via RPC payout_segna_erogato. Non crea
      // denaro, transfer o payout. FAIL-CLOSED: se la firma non è verificata
      // (env Connect assente) o l'account è sconosciuto, l'evento non viene
      // processato. Idempotenza: event_id UNIQUE in pagamenti_eventi.
      case "payout.paid":
      case "payout.failed":
      case "payout.updated": {
        const payoutObj = obj as {
          id?: string;
          status?: string;
          failure_message?: string | null;
        };
        const stripePayoutId = typeof payoutObj.id === "string" ? payoutObj.id : null;
        if (!stripePayoutId) {
          throw new Error(`${evento.type} senza payout id`);
        }
        const { data: payoutInterno } = await db
          .from("payout")
          .select("id, stato, negozio_id")
          .eq("negozio_id", negozioId)
          .eq("stripe_payout_id", stripePayoutId)
          .maybeSingle();
        if (!payoutInterno) {
          // Account/negozio sconosciuto o payout non ancora associato:
          // fail-closed, nessuna scrittura.
          console.warn(
            `[pagamenti] payout ${stripePayoutId} non trovato per negozio ${negozioId} — ignorato.`
          );
          break;
        }
        const statoStripe = String(payoutObj.status ?? "");
        const errore =
          typeof payoutObj.failure_message === "string" && payoutObj.failure_message
            ? payoutObj.failure_message.slice(0, 500)
            : null;
        // Mapping stato Stripe → stato interno (V1).
        let nuovoStato: "in_erogazione" | "pagato" | "fallito";
        if (statoStripe === "paid") nuovoStato = "pagato";
        else if (statoStripe === "failed") nuovoStato = "fallito";
        else nuovoStato = "in_erogazione";

        const { error: payoutErr } = await db.rpc("payout_segna_erogato", {
          p_payout_id: String(payoutInterno.id),
          p_nuovo_stato: nuovoStato,
          p_stripe_payout_id: stripePayoutId,
          p_stripe_payout_status: statoStripe || null,
          p_errore: errore,
        });
        if (payoutErr) {
          console.error(
            `[pagamenti] aggiornamento payout ${stripePayoutId} fallito: ${payoutErr.message}`
          );
        }
        break;
      }

      default:
        // Eventi non gestiti (es. payment_intent.*): registrati ma ignorati.
        break;
    }

    const finalizzazione = await segnaProcessato(evento.id, true);
    if (!finalizzazione.ok || finalizzazione.stato !== "processed") {
      return { status: 503, body: "Impossibile finalizzare l'evento; Stripe ritenterà." };
    }
    return { status: 200, body: "OK" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    const finalizzazione = await segnaProcessato(evento.id, false, msg);
    console.error("[pagamenti] webhook non elaborato:", msg);
    if (!finalizzazione.ok) {
      return { status: 503, body: "Impossibile registrare l'errore dell'evento; Stripe ritenterà." };
    }
    return { status: 503, body: "Elaborazione evento fallita; Stripe ritenterà." };
  }
}
