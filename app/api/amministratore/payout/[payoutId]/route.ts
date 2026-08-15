import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getPayoutDettaglioAdmin } from "@/lib/amministratore/payout";

/**
 * GET /api/amministratore/payout/[payoutId]
 *   Dettaglio payout (admin, read-only) con gli ordini inclusi.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ payoutId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { payoutId } = await context.params;

  try {
    const dettaglio = await getPayoutDettaglioAdmin(payoutId);
    if (!dettaglio) {
      return apiError("PAYOUT_NON_TROVATO", "Payout non trovato.", 404);
    }
    return apiOk(dettaglio);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
