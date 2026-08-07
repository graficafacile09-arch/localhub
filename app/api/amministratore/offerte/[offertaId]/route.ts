import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaOffertaAdmin, eliminaOffertaAdmin } from "@/lib/offerte";

/** Aggiornamento di un'offerta da parte dell'amministratore (toggle, titolo, ecc.). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ offertaId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { offertaId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const patch: Record<string, unknown> = {};

  if ("attiva" in body) {
    if (typeof body.attiva !== "boolean") {
      return apiError("VALIDATION_ERROR", "attiva deve essere booleano.", 422);
    }
    patch.attiva = body.attiva;
  }

  if ("titolo" in body) {
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) {
      return apiError("VALIDATION_ERROR", "Il titolo dell'offerta è obbligatorio.", 422);
    }
    patch.titolo = titolo;
  }

  if (Object.keys(patch).length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun campo da aggiornare.", 422);
  }

  const risultato = await aggiornaOffertaAdmin(offertaId, patch);
  if (!risultato.ok) {
    return apiError("UPDATE_FAILED", risultato.errore, 500);
  }

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/offerte");

  return apiOk({ offerta: risultato.data });
}

/** Eliminazione definitiva di un'offerta da parte dell'amministratore. */
export async function DELETE(_request: Request, context: { params: Promise<{ offertaId: string }> }) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { offertaId } = await context.params;
  const risultato = await eliminaOffertaAdmin(offertaId);
  if (!risultato.ok) {
    return apiError("DELETE_FAILED", risultato.errore, 500);
  }

  revalidatePath("/");
  revalidatePath("/negozi");
  revalidatePath("/amministratore/offerte");

  return apiOk({ successo: true });
}