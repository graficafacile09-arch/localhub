import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  aggiornaOffertaAdmin,
  eliminaOffertaAdmin,
  validaCampiOfferta,
} from "@/lib/offerte";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Aggiornamento di un'offerta da parte dell'amministratore.
 * I campi ammessi (stessi del flusso venditore) sono: titolo, descrizione,
 * prezzo_originale, prezzo_offerta, immagine_url, data_inizio, data_fine,
 * attiva. Il negozio dell'offerta NON è spostabile da qui (la creazione con
 * scelta del negozio passa dalla route POST /amministratore/offerte).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ offertaId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { offertaId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  // Ogni altra chiave (es. negozio_id) viene ignorata: mai scritture arbitrarie.
  const esito = validaCampiOfferta(body, { parziale: true });
  if (esito.errore) {
    return apiError("VALIDATION_ERROR", esito.errore, 422);
  }

  const patch = esito.valore!;
  const risultato = await aggiornaOffertaAdmin(offertaId, patch);
  if (!risultato.ok) {
    return apiError("UPDATE_FAILED", risultato.errore, 500);
  }

  // Registra attività
  const offerta = risultato.data;
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.OFFERTA_MODIFICATA,
    targetType: TARGET_TYPES.OFFERTA,
    targetId: offerta.id,
    targetName: offerta.titolo,
    negozioId: offerta.negozio_id,
    negozioNome: offerta.negozio_nome ?? null,
    result: "success",
    detail: { campi: Object.keys(patch).join(", ") },
  });

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/offerte");
  if (offerta.negozio_slug) revalidatePath(`/negozio/${offerta.negozio_slug}`);

  return apiOk({ offerta: risultato.data });
}

/** Eliminazione definitiva di un'offerta da parte dell'amministratore. */
export async function DELETE(_request: Request, context: { params: Promise<{ offertaId: string }> }) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { offertaId } = await context.params;

  // Recupera info offerta prima dell'eliminazione per il log
  const db = createAdminSupabaseClient();
  const { data: offerta } = await db
    .from("offerte")
    .select("id, titolo, negozio_id, negozi(nome)")
    .eq("id", offertaId)
    .single();

  const risultato = await eliminaOffertaAdmin(offertaId);
  if (!risultato.ok) {
    return apiError("DELETE_FAILED", risultato.errore, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.OFFERTA_ELIMINATA,
    targetType: TARGET_TYPES.OFFERTA,
    targetId: offertaId,
    targetName: offerta?.titolo ?? offertaId,
    negozioId: offerta?.negozio_id ?? null,
    negozioNome: ((offerta?.negozi as unknown as { nome: string | null } | null) ?? { nome: null }).nome,
    result: "success",
  });

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/offerte");

  return apiOk({ successo: true });
}
