import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  getIncassiVenditore,
  type FiltriIncassiVenditore,
} from "@/lib/merchant/incassi";

/**
 * GET /api/merchant/stores/[negozioId]/incassi
 *
 * Rendicontazione degli incassi del negozio, SOLO venditore proprietario
 * (o admin). Riepilogo (totale pagato, commissioni, rimborsi, netto
 * venditore) + elenco ordini con dettaglio economico. Filtri SERVER-SIDE:
 * data_da, data_a, pagamento, provider, stato. L'ownership è verificata
 * server-side (canManageStore) + RLS: il venditore vede esclusivamente i
 * propri ordini. Tutti i calcoli monetari avvengono server-side.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;

  const url = new URL(request.url);
  const filtri: FiltriIncassiVenditore = {
    dataDa: url.searchParams.get("data_da") ?? undefined,
    dataA: url.searchParams.get("data_a") ?? undefined,
    pagamento: url.searchParams.get("pagamento") ?? undefined,
    provider: url.searchParams.get("provider") ?? undefined,
    stato: url.searchParams.get("stato") ?? undefined,
  };

  try {
    const risultato = await getIncassiVenditore(user.id, negozioId, filtri);
    return apiOk(risultato);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
