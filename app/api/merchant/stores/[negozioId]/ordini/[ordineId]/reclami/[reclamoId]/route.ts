import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaStatoReclamoVenditore, isStatoReclamo } from "@/lib/ordine-reclami";

/**
 * PATCH /api/merchant/stores/[negozioId]/ordini/[ordineId]/reclami/[reclamoId]
 *
 * Body: { "stato": "in_gestione" | "risolto" | "chiuso", "nota": "..." (opz.) }
 *
 * Cambio stato del reclamo: la transizione e l'OWNERSHIP vengono validate
 * ATOMICAMENTE dalla RPC `aggiorna_stato_reclamo` (macchina a stati +
 * gestito_at/da). Un venditore non può modificare reclami di altri negozi.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string; reclamoId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, ordineId, reclamoId } = await context.params;

  let body: { stato?: unknown; nota?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  if (!isStatoReclamo(body.stato)) {
    return apiError("VALIDATION_ERROR", "Stato del reclamo non valido.", 422);
  }
  const nota =
    typeof body.nota === "string" && body.nota.trim() ? body.nota.trim().slice(0, 500) : null;

  const esito = await aggiornaStatoReclamoVenditore(
    user.id,
    negozioId,
    reclamoId,
    body.stato,
    nota
  );

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  revalidatePath(`/merchant/${negozioId}/ordini`);
  revalidatePath(`/merchant/${negozioId}/ordini/${ordineId}`);
  revalidatePath(`/cliente/ordini/${ordineId}`);

  return apiOk({ reclamo: esito.reclamo, cambiato: esito.cambiato });
}
