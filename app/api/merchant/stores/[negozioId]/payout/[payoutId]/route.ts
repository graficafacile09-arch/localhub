import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getPayoutDettaglioVenditore } from "@/lib/merchant/payout";

/**
 * GET /api/merchant/stores/[negozioId]/payout/[payoutId]
 *   Dettaglio payout del negozio (con ordini inclusi), ownership verificata.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string; payoutId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, payoutId } = await context.params;

  try {
    const dettaglio = await getPayoutDettaglioVenditore(user.id, negozioId, payoutId);
    if (!dettaglio) {
      return apiError("PAYOUT_NON_TROVATO", "Payout non trovato.", 404);
    }
    return apiOk(dettaglio);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
