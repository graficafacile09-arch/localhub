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
