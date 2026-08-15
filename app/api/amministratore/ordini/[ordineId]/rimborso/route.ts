import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { rimborsaOrdine, MAX_MOTIVO_RIMBORSO } from "@/lib/pagamenti/rimborsi";

/**
 * POST /api/amministratore/ordini/[ordineId]/rimborso
 *
 * Rimborso totale/parziale di un ordine (solo admin). L'importo è VALIDATO
 * server-side (numerico, > 0, ≤ residuo, max 2 decimali): NON si accetta
 * payment_status/provider/commissione/transaction_id dal client — ogni
 * dato contabile viene letto dal DB e dal provider. La RPC
 * pagamenti_prepara_rimborso ri-verifica ownership admin e protegge da
 * over-refund/double-refund (FOR UPDATE). Il provider resta la fonte del
 * rimborso; il webhook la fonte definitiva dello stato.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("admin");
  if (errArea) return errArea;

  const { ordineId } = await context.params;
  if (!ordineId) {
    return apiError("VALIDATION_ERROR", "Ordine non valido.", 422);
  }

  let body: { amount?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as { amount?: unknown; reason?: unknown };
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return apiError("VALIDATION_ERROR", "Importo del rimborso non valido.", 422);
  }
  if (Math.abs(Math.round(amount * 100) / 100 - amount) > 1e-9) {
    return apiError("VALIDATION_ERROR", "L'importo deve avere al massimo 2 decimali.", 422);
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, MAX_MOTIVO_RIMBORSO)
      : null;

  const esito = await rimborsaOrdine({
    ordineId,
    importo: amount,
    motivo: reason,
    userId: sessione.user.id,
  });

  if (!esito.ok) {
    return apiError(esito.codice, esito.errore, esito.status);
  }

  return apiOk({
    success: true,
    ordineId: esito.ordineId,
    importoRichiesto: esito.importoRichiesto,
    importoRimborsato: esito.importoRimborsato,
    paymentStatus: esito.paymentStatus,
    residuo: esito.residuo,
    refundId: esito.refundId,
    pending: false,
  });
}
