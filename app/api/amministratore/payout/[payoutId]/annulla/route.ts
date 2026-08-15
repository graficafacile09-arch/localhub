import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { annullaPayoutAdmin } from "@/lib/amministratore/payout";

/**
 * POST /api/amministratore/payout/[payoutId]/annulla
 *
 * Annulla un payout interno V1. Consentito SOLO da stato `calcolato`
 * (la RPC `payout_annulla` è idempotente e rifiuta payout già pagati).
 * Nessun pagamento Stripe reale viene creato o annullato in V1.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ payoutId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { payoutId } = await context.params;

  const esito = await annullaPayoutAdmin(payoutId);
  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }
  return apiOk({ cambiato: esito.cambiato, stato: esito.stato });
}
