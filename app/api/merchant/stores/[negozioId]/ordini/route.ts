import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getOrdiniVenditore } from "@/lib/merchant/ordini";
import { isFiltroOrdini } from "@/lib/merchant/ordini-stati";

/**
 * GET /api/merchant/stores/[negozioId]/ordini?filtro=nuovi
 *
 * Lista ordini del negozio SOLO per il venditore proprietario (ownership
 * verificata server-side via canManageStore + filtro negozio_id).
 * Parametro opzionale `filtro` (tutti|nuovi|lavorazione|pronti|completati|
 * annullati): qualsiasi altro valore viene ignorato (default "tutti").
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
  const filtroRaw = url.searchParams.get("filtro");
  const filtro = isFiltroOrdini(filtroRaw) ? filtroRaw : "tutti";

  try {
    const ordini = await getOrdiniVenditore(user.id, negozioId, filtro);
    return apiOk({ ordini, filtro });
  } catch (err) {
    console.error("[api-merchant-ordini] GET lista:", (err as Error)?.message);
    return apiError("ORDINI_READ_FAILED", "Impossibile caricare gli ordini.", 500);
  }
}
