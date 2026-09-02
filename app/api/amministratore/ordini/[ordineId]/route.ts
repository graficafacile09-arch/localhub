import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  aggiornaStatoOrdineAdmin,
  getOrdineAdmin,
} from "@/lib/amministratore/ordini";
import { isStatoOrdine } from "@/lib/merchant/ordini-stati";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * GET /api/amministratore/ordini/[ordineId]
 *
 * Dettaglio ordine READ-ONLY (solo sessione admin). Admin client (service
 * role) dietro il gate admin: id inesistente → 404.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { ordineId } = await context.params;

  try {
    const ordine = await getOrdineAdmin(ordineId);
    if (!ordine) {
      return apiError("ORDINE_NON_TROVATO", "Ordine non trovato.", 404);
    }
    return apiOk({ ordine });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("ORDINE_READ_FAILED", message, 500);
  }
}

/**
 * PATCH /api/amministratore/ordini/[ordineId]
 *
 * Body: { "stato": "confermato", "motivo": "...", "nota": "..." }
 *
 * Cambio stato ordine lato admin. Riusa la RPC `aggiorna_stato_ordine`
 * (macchina a stati + ownership owner/admin + ripristino stock). Nessuna
 * nuova RPC, nessun UPDATE diretto.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { ordineId } = await context.params;

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

  const esito = await aggiornaStatoOrdineAdmin(sessione.user.id, ordineId, body.stato, { motivo, nota });

  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }

  // Registra l'operazione amministrativa SOLO dopo il successo (stesso
  // pattern degli altri moduli: nessun log senza mutazione riuscita).
  const ordine = esito.ordine;
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.ORDINE_STATO_MODIFICATO,
    targetType: TARGET_TYPES.ORDINE,
    targetId: ordineId,
    targetName: ordine?.numero ?? ordineId,
    negozioId: ordine?.negozioId ?? null,
    negozioNome: ordine?.negozioNome ?? null,
    result: "success",
    detail: {
      stato_nuovo: body.stato,
      motivo,
      nota,
    },
  });

  revalidatePath("/amministratore/ordini");
  revalidatePath(`/amministratore/ordini/${ordineId}`);

  return apiOk({ ordine: esito.ordine, cambiato: esito.cambiato });
}
