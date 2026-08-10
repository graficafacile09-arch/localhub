import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  aggiungiMessaggioCliente,
  getMessaggiReclamoCliente,
  validaCorpoMessaggio,
} from "@/lib/ordine-reclami-messaggi";

/**
 * GET+POST /api/cliente/ordini/[ordineId]/reclami/[reclamoId]/messaggi
 *
 * Dialogo cliente ↔ venditore su un reclamo PROPRIO:
 *   - GET  → storico comunicazioni (ownership: reclamo dell'ordine
 *            dell'utente, verificata server-side);
 *   - POST → il cliente risponde al negozio. Body { "corpo": "..." }.
 *            La RPC `aggiungi_messaggio_reclamo_cliente` verifica che il
 *            reclamo appartenga alla sessione; dopo il salvataggio viene
 *            inviata una notifica ntfy al venditore in BEST-EFFORT.
 * Un cliente non può leggere/scrivere su reclami altrui.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ ordineId: string; reclamoId: string }> }
) {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;

  const { ordineId, reclamoId } = await context.params;
  const messaggi = await getMessaggiReclamoCliente(
    sessione.user.id,
    ordineId,
    reclamoId
  );
  return apiOk({ messaggi });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ordineId: string; reclamoId: string }> }
) {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;

  const { ordineId, reclamoId } = await context.params;

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

  const esito = await aggiungiMessaggioCliente(
    sessione.user.id,
    reclamoId,
    corpo
  );

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  revalidatePath(`/cliente/ordini/${ordineId}`);

  return apiOk({ messaggio: esito.messaggio }, 201);
}
