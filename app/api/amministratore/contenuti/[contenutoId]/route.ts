import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  aggiornaContenutoAdmin,
  eliminaContenutoAdmin,
  getContenutoAdminById,
  validaCampiContenuto,
} from "@/lib/amministratore/contenuti";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * API CONTENUTO (dettaglio) — /amministratore/contenuti/[contenutoId]
 *
 * PATCH → modifica campi whitelist (+ workflow stato con pubblicato_il
 *         gestito server-side). Nessuna chiave arbitraria dal client.
 * DELETE → eliminazione DEFINITIVA del contenuto (nessun trash: per i
 *         contenuti non esiste un sistema di cestino, non ne viene creato
 *         uno). Registrata in admin_activity_log.
 *
 * Ogni handler inizia con requireApiArea("admin") e logga SOLO dopo il
 * successo dell'operazione.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ contenutoId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { contenutoId } = await context.params;
  if (!UUID_RE.test(contenutoId)) {
    return apiError("VALIDATION_ERROR", "Contenuto non valido.", 422);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const validazione = validaCampiContenuto(body, { parziale: true });
  if (!validazione.ok) {
    return apiError("VALIDATION_ERROR", validazione.errore, 422);
  }

  const risultato = await aggiornaContenutoAdmin(contenutoId, validazione.input);
  if (!risultato.ok) {
    return apiError(risultato.errore === "Contenuto non trovato." ? "NOT_FOUND" : "UPDATE_FAILED", risultato.errore, risultato.errore === "Contenuto non trovato." ? 404 : 500);
  }

  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.CONTENUTO_MODIFICATO,
    targetType: TARGET_TYPES.CONTENUTO,
    targetId: contenutoId,
    targetName: risultato.data.titolo,
    result: "success",
    detail: {
      campi: Object.keys(validazione.input),
      stato: risultato.data.stato,
    },
  });

  revalidatePath("/amministratore/contenuti");
  return apiOk({ contenuto: risultato.data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ contenutoId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { contenutoId } = await context.params;
  if (!UUID_RE.test(contenutoId)) {
    return apiError("VALIDATION_ERROR", "Contenuto non valido.", 422);
  }

  const corrente = await getContenutoAdminById(contenutoId);
  if (!corrente) {
    return apiError("NOT_FOUND", "Contenuto non trovato.", 404);
  }

  const risultato = await eliminaContenutoAdmin(contenutoId);
  if (!risultato.ok) {
    return apiError("DELETE_FAILED", risultato.errore, 500);
  }

  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.CONTENUTO_ELIMINATO,
    targetType: TARGET_TYPES.CONTENUTO,
    targetId: contenutoId,
    targetName: corrente.titolo,
    result: "success",
  });

  revalidatePath("/amministratore/contenuti");
  return apiOk({ deleted: true, contenutoId });
}