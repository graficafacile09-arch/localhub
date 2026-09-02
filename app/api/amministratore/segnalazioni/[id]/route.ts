import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaSegnalazioneAdmin, type SegnalazioneStato, type SegnalazionePriorita } from "@/lib/segnalazioni";
import { registraAttivitaAdmin, OPERATION_TYPES } from "@/lib/amministratore/activity-log";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const patch: Partial<Record<string, unknown>> = {};

  if ("stato" in body) {
    const statiValidi: SegnalazioneStato[] = ["nuova", "presa_in_carico", "risolta", "archiviata"];
    if (!statiValidi.includes(body.stato as SegnalazioneStato)) {
      return apiError("VALIDATION_ERROR", "Stato non valido.", 422);
    }
    patch.stato = body.stato;
  }

  if ("priorita" in body) {
    const prioritaValide: SegnalazionePriorita[] = ["bassa", "normale", "alta", "urgente"];
    if (!prioritaValide.includes(body.priorita as SegnalazionePriorita)) {
      return apiError("VALIDATION_ERROR", "Priorità non valida.", 422);
    }
    patch.priorita = body.priorita;
  }

  if ("note_admin" in body) {
    if (body.note_admin !== null && typeof body.note_admin !== "string") {
      return apiError("VALIDATION_ERROR", "note_admin deve essere testo.", 422);
    }
    patch.note_admin = body.note_admin as string | null;
  }

  if ("resolved_at" in body) {
    if (body.resolved_at !== null && typeof body.resolved_at !== "string") {
      return apiError("VALIDATION_ERROR", "resolved_at deve essere data ISO.", 422);
    }
    patch.resolved_at = body.resolved_at as string | null;
  }

  if ("resolved_by" in body) {
    if (body.resolved_by !== null && typeof body.resolved_by !== "string") {
      return apiError("VALIDATION_ERROR", "resolved_by deve essere UUID.", 422);
    }
    patch.resolved_by = body.resolved_by as string | null;
  }

  // Coerenza del workflow lato SERVER (mai fidarsi del client): quando lo stato
  // diventa "risolta" la risoluzione viene registrata con l'admin che opera;
  // quando la segnalazione viene riaperta (nuova/presa_in_carico) i dati di
  // risoluzione vengono azzerati.
  if ("stato" in patch) {
    if (patch.stato === "risolta") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = sessione.user.id;
    } else if (patch.stato === "nuova" || patch.stato === "presa_in_carico") {
      patch.resolved_at = null;
      patch.resolved_by = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun campo da aggiornare.", 422);
  }

  const risultato = await aggiornaSegnalazioneAdmin(id, patch);
  if (!risultato.ok) {
    return apiError("UPDATE_FAILED", risultato.errore, 500);
  }

  const segnalazione = risultato.data;
  const precedenti = risultato.precedenti;

  // Determina il tipo di operazione per il log
  let operationType: string = OPERATION_TYPES.UTENTE_MODIFICATO; // fallback
  const detail: Record<string, unknown> = {};

  if ("stato" in patch) {
    operationType = "segnalazione_stato_modificato";
    detail.stato_precedente = precedenti.stato;
    detail.stato_nuovo = patch.stato;
  }
  if ("priorita" in patch) {
    operationType = "segnalazione_priorita_modificata";
    detail.priorita_precedente = precedenti.priorita;
    detail.priorita_nuova = patch.priorita;
  }
  if ("note_admin" in patch) {
    operationType = "segnalazione_nota_modificata";
    detail.nota_precedente = precedenti.note_admin;
    detail.nota_nuova = patch.note_admin;
  }
  if ("resolved_at" in patch && patch.resolved_at) {
    operationType = "segnalazione_risolta";
    detail.risoluta_il = patch.resolved_at;
    detail.risoluta_da = sessione.user.id;
  }
  if ("stato" in patch && patch.stato === "archiviata") {
    operationType = "segnalazione_archiviata";
  }
  if ("stato" in patch && (precedenti.stato === "risolta" || precedenti.stato === "archiviata") && (patch.stato === "nuova" || patch.stato === "presa_in_carico")) {
    operationType = "segnalazione_riaperta";
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType,
    targetType: "segnalazione",
    targetId: id,
    targetName: segnalazione.titolo,
    negozioId: segnalazione.negozio_id,
    negozioNome: segnalazione.negozio_nome,
    result: "success",
    detail,
  });

  revalidatePath("/amministratore/segnalazioni");

  return apiOk({ segnalazione: risultato.data });
}