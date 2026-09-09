import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { risolviCredenzialiGateway } from "./config";
import { getGatewayProvider } from "./registry";
import type { ProviderPagamento } from "./types";

export type LatePaymentInput = {
  ordineId: string;
  negozioId: string;
  provider: ProviderPagamento;
  paymentId: string;
  importo: number;
  eventId: string;
  payload: unknown;
};

export type LatePaymentResult =
  | { ok: true; action: "refunded" }
  | { ok: false; errore: string };

function rpcOk(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { ok?: boolean }).ok === true;
}

/**
 * A provider-confirmed capture arriving after the local deadline is never
 * accepted as an order payment. The order is closed atomically first, then the
 * existing gateway refund primitive is called with a stable idempotency key.
 */
export async function gestisciPagamentoTardivo(
  input: LatePaymentInput
): Promise<LatePaymentResult> {
  const db = createAdminSupabaseClient();
  const close = await db.rpc("pagamenti_ordine_chiuso", {
    p_ordine_id: input.ordineId,
    p_payment_status: "expired",
  });
  if (close.error || !rpcOk(close.data)) {
    return { ok: false, errore: close.error?.message ?? "chiusura ordine scaduto fallita" };
  }

  const resolved = await risolviCredenzialiGateway(input.negozioId, input.provider);
  if (!resolved.pronto || !resolved.cred) {
    return { ok: false, errore: "credenziali provider non disponibili per il late payment" };
  }

  const gateway = getGatewayProvider(input.provider);
  if (!gateway) return { ok: false, errore: "gateway provider non disponibile" };

  try {
    await gateway.rimborsa(input.paymentId, input.importo, resolved.cred, {
      idempotencyKey: `late-payment:${input.provider}:${input.paymentId}`.slice(0, 128),
      operationId: input.eventId,
    });
  } catch (error) {
    return {
      ok: false,
      errore: error instanceof Error ? error.message : "rimborso late payment fallito",
    };
  }

  const latePayload = {
    ...(input.payload && typeof input.payload === "object" ? input.payload : {}),
    _incitta: {
      late_payment: true,
      late_payment_action: "refunded",
      late_payment_event_id: input.eventId,
    },
  };
  const { error: eventError } = await db
    .from("pagamenti_eventi")
    .update({ payload: latePayload, error: null })
    .eq("event_id", input.eventId);
  if (eventError) return { ok: false, errore: eventError.message };

  const { error: sessionError } = await db
    .from("pagamenti_sessioni")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("ordine_id", input.ordineId)
    .eq("provider", input.provider)
    .eq("payment_id", input.paymentId);
  if (sessionError) return { ok: false, errore: sessionError.message };

  return { ok: true, action: "refunded" };
}

/**
 * P3 PAYMENT-FIRST — LATE PAYMENT su INTENTO (sessione senza ordine).
 *
 * Un pagamento confermato dal provider che arriva su una sessione GIÀ
 * chiusa/scaduta NON genera MAI un ordine: viene rimborsato e l'intento
 * resta senza ordine (sessione → 'refunded'). Idempotente e serializzato:
 *
 *   1. la sessione viene prima CHIUSA con checkout_intento_scaduto (lock
 *      FOR UPDATE + rilascio riserve, idempotente): punto di serializzazione
 *      con lo sweep — se una conferma concorrente ha creato l'ordine nel
 *      frattempo, checkout_intento_scaduto risponde 'ordine_collegato' e qui
 *      NON si rimborsa (mai ordine + refund);
 *   2. refund del provider con chiave idempotente STABILE derivata dal
 *      pagamento (`late-payment:<provider>:<paymentId>`, la stessa del
 *      flusso ordini: un payment_id identifica un solo pagamento, quindi
 *      anche un doppio evento → un solo refund);
 *   3. sessione → 'refunded', nessuna notifica di nuovo ordine.
 */
export type LatePaymentIntentoInput = {
  /** ID sessione/intento (pagamenti_sessioni.id). */
  checkoutId: string;
  negozioId: string;
  provider: ProviderPagamento;
  paymentId: string;
  importo: number;
  eventId: string;
  payload: unknown;
};

export type LatePaymentIntentoResult =
  | { ok: true; action: "refunded" | "gia_gestito" }
  | { ok: false; errore: string };

function rpcIntentoOk(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { ok?: boolean }).ok === true;
}

/**
 * Rimborso idempotente di un pagamento arrivato DOPO la scadenza
 * dell'intento. MAI un ordine. Best-effort sul marking, ma il refund è
 * l'operazione forte: un errore di persistenza del marcatore NON viene
 * considerato successo (il webhook ritenta e la chiave idempotente del
 * provider impedisce un secondo refund).
 */
export async function gestisciPagamentoTardivoIntento(
  input: LatePaymentIntentoInput
): Promise<LatePaymentIntentoResult> {
  if (!input.checkoutId) {
    return { ok: false, errore: "checkout non valido" };
  }
  const db = createAdminSupabaseClient();

  // ── Carica l'intento (sessione senza ordine) ───────────────────────────
  const { data: sessione } = await db
    .from("pagamenti_sessioni")
    .select("id, negozio_id, provider, status, ordine_id, payment_id")
    .eq("id", input.checkoutId)
    .maybeSingle();
  if (!sessione) {
    return { ok: false, errore: "checkout non trovato" };
  }

  // La sessione è collegata a un ordine (conferma concorrente ha vinto):
  // MAI rimborsare. L'ordine esiste e va gestito dal flusso ordini.
  if (sessione.ordine_id) {
    return { ok: false, errore: "checkout collegato a un ordine (conferma concorrente)" };
  }

  // Già rimborsato da un evento precedente → idempotente, nessun doppio refund.
  if (String(sessione.status ?? "") === "refunded") {
    return { ok: true, action: "gia_gestito" };
  }

  // ── Chiudi la sessione (lock + rilascio riserve, idempotente) ──────────
  // Serializza con lo sweep e con la conferma: se l'intento NON è ancora
  // scaduto (CHECKOUT_NON_SCADUTO) il pagamento NON è tardivo → errore
  // (nessun refund prematuro). Se nel frattempo l'ordine è stato creato,
  // la RPC risponde 'ordine_collegato' e qui NON si rimborsa.
  const chiusura = await db.rpc("checkout_intento_scaduto", {
    p_sessione_id: input.checkoutId,
  });
  if (chiusura.error || !rpcIntentoOk(chiusura.data)) {
    const codice = (chiusura.data as { codice?: string } | null)?.codice;
    if (codice === "CHECKOUT_NON_SCADUTO") {
      return { ok: false, errore: "checkout non ancora scaduto: nessun refund" };
    }
    return {
      ok: false,
      errore: chiusura.error?.message ?? "chiusura checkout scaduto fallita",
    };
  }
  const esitoChiusura = chiusura.data as { stato?: string } | null;
  if (esitoChiusura?.stato === "ordine_collegato") {
    return { ok: false, errore: "checkout collegato a un ordine: nessun refund" };
  }

  // ── Refund provider con chiave idempotente STABILE ─────────────────────
  const resolved = await risolviCredenzialiGateway(input.negozioId, input.provider);
  if (!resolved.pronto || !resolved.cred) {
    return { ok: false, errore: "credenziali provider non disponibili per il late payment" };
  }
  const gateway = getGatewayProvider(input.provider);
  if (!gateway) return { ok: false, errore: "gateway provider non disponibile" };

  try {
    await gateway.rimborsa(input.paymentId, input.importo, resolved.cred, {
      // Stessa chiave del flusso ordini: un payment_id identifica un solo
      // pagamento → un solo refund anche su retry/doppi eventi.
      idempotencyKey: `late-payment:${input.provider}:${input.paymentId}`.slice(0, 128),
      operationId: input.eventId,
    });
  } catch (error) {
    return {
      ok: false,
      errore: error instanceof Error ? error.message : "rimborso late payment fallito",
    };
  }

  // ── Marcatura (idempotente): evento late-payment + sessione refunded ───
  const latePayload = {
    ...(input.payload && typeof input.payload === "object" ? input.payload : {}),
    _incitta: {
      late_payment: true,
      late_payment_action: "refunded",
      late_payment_event_id: input.eventId,
    },
  };
  const { error: eventError } = await db
    .from("pagamenti_eventi")
    .update({ payload: latePayload, error: null })
    .eq("event_id", input.eventId);
  if (eventError) return { ok: false, errore: eventError.message };

  const { error: sessionError } = await db
    .from("pagamenti_sessioni")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", input.checkoutId)
    .is("ordine_id", null);
  if (sessionError) return { ok: false, errore: sessionError.message };

  return { ok: true, action: "refunded" };
}
