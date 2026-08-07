import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaEventoAdmin, eliminaEventoAdmin } from "@/lib/eventi";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Aggiornamento di un evento da parte dell'amministratore (toggle, titolo, ecc.). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventoId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { eventoId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const patch: Record<string, unknown> = {};

  if ("attivo" in body) {
    if (typeof body.attivo !== "boolean") {
      return apiError("VALIDATION_ERROR", "attivo deve essere booleano.", 422);
    }
    patch.attivo = body.attivo;
  }

  if ("titolo" in body) {
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) {
      return apiError("VALIDATION_ERROR", "Il titolo dell'evento è obbligatorio.", 422);
    }
    patch.titolo = titolo;
  }

  if (Object.keys(patch).length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun campo da aggiornare.", 422);
  }

  const risultato = await aggiornaEventoAdmin(eventoId, patch);
  if (!risultato.ok) {
    return apiError("UPDATE_FAILED", risultato.errore, 500);
  }

  // Registra attività
  const evento = risultato.data;
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.EVENTO_MODIFICATO,
    targetType: TARGET_TYPES.EVENTO,
    targetId: evento.id,
    targetName: evento.titolo,
    negozioId: evento.negozio_id,
    negozioNome: evento.negozio_nome ?? null,
    result: "success",
    detail: { campi: Object.keys(patch).join(", ") },
  });

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/eventi");

  return apiOk({ evento: risultato.data });
}

/** Eliminazione definitiva di un evento da parte dell'amministratore. */
export async function DELETE(_request: Request, context: { params: Promise<{ eventoId: string }> }) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { eventoId } = await context.params;

  // Recupera info evento prima dell'eliminazione per il log
  const db = createAdminSupabaseClient();
  const { data: evento } = await db
    .from("eventi")
    .select("id, titolo, negozio_id, negozi(nome)")
    .eq("id", eventoId)
    .single();

  const risultato = await eliminaEventoAdmin(eventoId);
  if (!risultato.ok) {
    return apiError("DELETE_FAILED", risultato.errore, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.EVENTO_ELIMINATO,
    targetType: TARGET_TYPES.EVENTO,
    targetId: eventoId,
    targetName: evento?.titolo ?? eventoId,
    negozioId: evento?.negozio_id ?? null,
    negozioNome: ((evento?.negozi as unknown as { nome: string | null } | null) ?? { nome: null }).nome,
    result: "success",
  });

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/eventi");

  return apiOk({ successo: true });
}