import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  annullaPrenotazione,
  esitoRpcHttp,
  spostaPrenotazione,
} from "@/lib/prenotazioni";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const SELECT =
  "id, numero, negozio_id, servizio_id, servizio_nome, durata_min, giorno, ora_inizio, ora_fine, cliente_user_id, cliente_nome, cliente_cognome, cliente_telefono, cliente_email, note, stato, motivo_annullo, created_at, updated_at";

/**
 * GET/PUT/DELETE /api/merchant/stores/[negozioId]/prenotazioni/[prenotazioneId]
 *
 * Singola prenotazione merchant. PUT supporta esclusivamente le modifiche
 * previste dalla Fase 6b: spostamento (sposta_prenotazione) e annullamento
 * (annulla_prenotazione). DELETE = annullamento (annulla_prenotazione), mai
 * hard-delete. Nessuna UPDATE SQL diretta che bypassi le RPC.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string; prenotazioneId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId, prenotazioneId } = await context.params;
  const permesso = await canManageStore(user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("prenotazioni")
    .select(SELECT)
    .eq("id", prenotazioneId)
    .eq("negozio_id", negozioId)
    .single();

  if (error || !data) {
    return apiError("BOOKING_NOT_FOUND", "Prenotazione non trovata.", 404);
  }

  return apiOk({ prenotazione: data });
}

/**
 * PUT — supporta esclusivamente:
 *   { azione: "sposta", nuovoGiorno, nuovaOra }        → sposta_prenotazione
 *   { azione: "annulla", motivo? }                     → annulla_prenotazione
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ negozioId: string; prenotazioneId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId, prenotazioneId } = await context.params;
  const permesso = await canManageStore(user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const azione = body.azione === "sposta" ? "sposta" : body.azione === "annulla" ? "annulla" : null;
  if (!azione) {
    return apiError("VALIDATION_ERROR", "Azione non valida (sposta|annulla).", 422);
  }

  if (azione === "sposta") {
    const nuovoGiorno = typeof body.nuovoGiorno === "string" ? body.nuovoGiorno.trim() : "";
    const nuovaOra = typeof body.nuovaOra === "string" ? body.nuovaOra.trim() : "";
    if (!nuovoGiorno || !DATA_RE.test(nuovoGiorno)) {
      return apiError("INVALID_DATE", "Nuova data non valida.", 422);
    }
    if (!nuovaOra || !ORA_RE.test(nuovaOra)) {
      return apiError("INVALID_TIME", "Nuovo orario non valido.", 422);
    }
    const { error, esito } = await spostaPrenotazione(
      prenotazioneId,
      nuovoGiorno,
      nuovaOra,
      "merchant",
      user.id
    );
    if (error) {
      return apiError("SAVE_FAILED", "Impossibile spostare la prenotazione.", 500);
    }
    if (!esito || esito.ok !== true) {
      const { status, codice, messaggio } = esitoRpcHttp(esito, "SAVE_FAILED", "Impossibile spostare la prenotazione.", 500);
      return apiError(codice, messaggio, status);
    }
    return apiOk({ prenotazione: esito.prenotazione ?? null });
  }

  // azione === "annulla"
  const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : "";
  const { error, esito } = await annullaPrenotazione(
    prenotazioneId,
    motivo || null,
    "merchant",
    user.id
  );
  if (error) {
    return apiError("SAVE_FAILED", "Impossibile annullare la prenotazione.", 500);
  }
  if (!esito || esito.ok !== true) {
    const { status, codice, messaggio } = esitoRpcHttp(esito, "SAVE_FAILED", "Impossibile annullare la prenotazione.", 500);
    return apiError(codice, messaggio, status);
  }
  return apiOk({ prenotazione: esito.prenotazione ?? null });
}

/**
 * DELETE — significa annullamento (stato → cancellata) tramite la RPC
 * `annulla_prenotazione`. Mai hard-delete.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ negozioId: string; prenotazioneId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId, prenotazioneId } = await context.params;
  const permesso = await canManageStore(user.id, negozioId);
  if (!permesso) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  let motivo: string | null = null;
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body.motivo === "string") {
      motivo = body.motivo.trim().slice(0, 500) || null;
    }
  } catch {
    motivo = null;
  }

  const { error, esito } = await annullaPrenotazione(
    prenotazioneId,
    motivo,
    "merchant",
    user.id
  );
  if (error) {
    return apiError("SAVE_FAILED", "Impossibile annullare la prenotazione.", 500);
  }
  if (!esito || esito.ok !== true) {
    const { status, codice, messaggio } = esitoRpcHttp(esito, "SAVE_FAILED", "Impossibile annullare la prenotazione.", 500);
    return apiError(codice, messaggio, status);
  }
  return apiOk({ prenotazione: esito.prenotazione ?? null });
}