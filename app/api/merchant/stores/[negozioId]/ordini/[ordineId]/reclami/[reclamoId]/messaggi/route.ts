import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  aggiungiMessaggioVenditore,
  getMessaggiReclamoVenditore,
  validaCorpoMessaggio,
} from "@/lib/ordine-reclami-messaggi";

/**
 * GET+POST /api/merchant/stores/[negozioId]/ordini/[ordineId]/reclami/[reclamoId]/messaggi
 *
 * Dialogo venditore ↔ cliente su un reclamo:
 *   - GET  → storico comunicazioni del reclamo (ownership: negozio del
 *            venditore, verificata server-side);
 *   - POST → il venditore scrive un messaggio al cliente. Body
 *            { "corpo": "..." }. La RPC `aggiungi_messaggio_reclamo_venditore`
 *            ri-verifica l'ownership ATOMICAMENTE; dopo il salvataggio
 *            l'email al cliente è BEST-EFFORT (mai un errore per l'email).
 * Un venditore non può leggere/scrivere su reclami di altri negozi.
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{ negozioId: string; ordineId: string; reclamoId: string }>;
  }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, reclamoId } = await context.params;
  const messaggi = await getMessaggiReclamoVenditore(
    sessione.user.id,
    negozioId,
    reclamoId
  );
  return apiOk({ messaggi });
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ negozioId: string; ordineId: string; reclamoId: string }>;
  }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  const { negozioId, ordineId, reclamoId } = await context.params;

  let body: { corpo?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  const corpo = validaCorpoMessaggio(body.corpo);
  if (!corpo) {
    return apiError("VALIDATION_ERROR", "Messaggio non valido (max 2000 caratteri).", 422);
  }

  const esito = await aggiungiMessaggioVenditore(
    sessione.user.id,
    negozioId,
    reclamoId,
    corpo
  );

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  revalidatePath(`/merchant/${negozioId}/ordini`);
  revalidatePath(`/merchant/${negozioId}/ordini/${ordineId}`);
  revalidatePath(`/cliente/ordini/${ordineId}`);

  return apiOk({ messaggio: esito.messaggio }, 201);
}
