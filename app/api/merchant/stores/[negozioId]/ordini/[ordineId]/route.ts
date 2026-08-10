import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaStatoOrdineVenditore, getOrdineVenditore } from "@/lib/merchant/ordini";
import { isStatoOrdine } from "@/lib/merchant/ordini-stati";

/**
 * GET /api/merchant/stores/[negozioId]/ordini/[ordineId]
 *
 * Dettaglio ordine SOLO per il venditore proprietario del negozio
 * (ownership server-side: canManageStore + filtro negozio_id + id).
 * Un venditore che modifica l'URL con l'id di un ordine di un altro negozio
 * riceve 404 (mai "non autorizzato" rivelatore).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, ordineId } = await context.params;

  try {
    const ordine = await getOrdineVenditore(user.id, negozioId, ordineId);
    if (!ordine) {
      return apiError("ORDINE_NON_TROVATO", "Ordine non trovato.", 404);
    }
    return apiOk({ ordine });
  } catch (err) {
    console.error("[api-merchant-ordini] GET dettaglio:", (err as Error)?.message);
    return apiError("ORDINE_READ_FAILED", "Impossibile caricare l'ordine.", 500);
  }
}

/**
 * PATCH /api/merchant/stores/[negozioId]/ordini/[ordineId]
 *
 * Body: { "stato": "confermato", "motivo": "prodotto_non_disponibile",
 *         "nota": "..." }
 *
 * Cambio stato dell'ordine. La transizione viene validata DAL DATABASE
 * (RPC aggiorna_stato_ordine, macchina a stati atomica + ownership). Il
 * motivo è OBBLIGATORIO per l'annullamento. L'email al cliente è
 * best-effort e mai duplicata (solo quando cambiato=true).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, ordineId } = await context.params;

  let body: { stato?: unknown; motivo?: unknown; nota?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  if (!isStatoOrdine(body.stato)) {
    return apiError("VALIDATION_ERROR", "Stato non valido.", 422);
  }

  const motivo = typeof body.motivo === "string" && body.motivo.trim() ? body.motivo.trim().slice(0, 120) : null;
  const nota = typeof body.nota === "string" && body.nota.trim() ? body.nota.trim().slice(0, 500) : null;

  const esito = await aggiornaStatoOrdineVenditore(user.id, negozioId, ordineId, body.stato, { motivo, nota });

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  revalidatePath(`/merchant/${negozioId}/ordini`);
  revalidatePath(`/merchant/${negozioId}/ordini/${ordineId}`);
  // Il cliente deve vedere subito il nuovo stato nella propria area.
  revalidatePath("/cliente/ordini");
  revalidatePath(`/ordini/conferma/${ordineId}`);

  return apiOk({ ordine: esito.ordine, cambiato: esito.cambiato });
}
