import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getNotificheAdmin,
  contaNotificheAdminNonLette,
  isGravitaNotificaAdmin,
  isTipoNotificaAdmin,
  type GravitaNotificaAdmin,
  type TipoNotificaAdmin,
} from "@/lib/amministratore/notifiche";

/**
 * API NOTIFICHE AMMINISTRATORE (/amministratore/notifiche).
 *
 * GET  → elenco paginato, più recenti prima, ARCHIVIATE ESCLUSE dalla vista
 *        predefinita, con unreadCount per il badge. Filtri opzionali
 *        (nonLette / gravita / tipo).
 * PATCH → SOLO gestione dello stato dell'inbox (nessuna creazione da
 *        client e nessuna modifica di contenuto):
 *          { azione: "segna_letta",        id }   → segna una come letta
 *          { azione: "archivia",           id }   → archivia (soft delete)
 *          { azione: "segna_tutte_lette" }        → marca lette tutte
 *        L'ID usato è SEMPRE l'ID della notifica da modificare (mai un
 *        target arbitrario). titolo/corpo/tipo/href/user_id NON sono
 *        modificabili dal client.
 *
 * Ogni handler inizia con requireApiArea("admin"). La semplice
 * lettura/archiviazione NON viene registrata in admin_activity_log (resta
 * esclusivamente gestione dello stato dell'inbox, non un'operazione di
 * moderazione/contenuto).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AzioneStato =
  | { azione: "segna_letta"; id: string }
  | { azione: "archivia"; id: string }
  | { azione: "segna_tutte_lette" };

function parsaAzione(body: Record<string, unknown> | null): AzioneStato | null {
  if (!body || typeof body !== "object") return null;
  const azione = body.azione;

  if (azione === "segna_tutte_lette") {
    return { azione: "segna_tutte_lette" };
  }

  if (azione === "segna_letta" || azione === "archivia") {
    const id = body.id;
    if (typeof id !== "string" || !UUID_RE.test(id)) return null;
    return { azione, id };
  }

  return null;
}

export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);

  const filtri: {
    nonLette?: boolean;
    gravita?: GravitaNotificaAdmin;
    tipo?: TipoNotificaAdmin;
    page?: number;
    pageSize?: number;
  } = {};

  if (url.searchParams.get("nonLette") === "1") filtri.nonLette = true;

  const gravita = url.searchParams.get("gravita");
  if (gravita && isGravitaNotificaAdmin(gravita)) filtri.gravita = gravita;

  const tipo = url.searchParams.get("tipo");
  if (tipo && isTipoNotificaAdmin(tipo)) filtri.tipo = tipo;

  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  if (Number.isFinite(page) && page > 0) filtri.page = page;

  const pageSize = parseInt(url.searchParams.get("pageSize") ?? "20", 10);
  if (Number.isFinite(pageSize) && pageSize > 0) filtri.pageSize = pageSize;

  const risultato = await getNotificheAdmin(filtri);

  return apiOk(risultato);
}

export async function PATCH(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const stato = parsaAzione(body);
  if (!stato) {
    return apiError(
      "VALIDATION_ERROR",
      "Azione non valida. Sono ammesse: segna_letta, archivia, segna_tutte_lette.",
      422
    );
  }

  const db = createAdminSupabaseClient();
  const adesso = new Date().toISOString();

  // ── Segna una singola notifica come letta ────────────────────────────────
  if (stato.azione === "segna_letta") {
    const { data: notifica } = await db
      .from("admin_notifiche")
      .select("id, user_id, letta_at, archiviata_at")
      .eq("id", stato.id)
      .single();

    if (!notifica) {
      return apiError("NOT_FOUND", "Notifica non trovata.", 404);
    }
    // Nessun bypass tramite user_id: se la notifica è assegnata a un admin
    // specifico, solo quell'admin può modificarne lo stato.
    if (notifica.user_id !== null && notifica.user_id !== sessione.user.id) {
      return apiError("FORBIDDEN", "Non puoi gestire questa notifica.", 403);
    }
    if (notifica.archiviata_at !== null) {
      return apiError("NOT_FOUND", "Notifica non trovata.", 404);
    }

    // Idempotente: una notifica già letta resta letta (no-op, successo).
    if (notifica.letta_at === null) {
      const { error: updateError } = await db
        .from("admin_notifiche")
        .update({ letta_at: adesso })
        .eq("id", stato.id);
      if (updateError) {
        return apiError("UPDATE_FAILED", updateError.message ?? "Impossibile aggiornare la notifica.", 500);
      }
    }

    const unreadCount = await contaNotificheAdminNonLette();
    return apiOk({ notifiche: [{ id: stato.id, letta_at: adesso }], unreadCount });
  }

  // ── Archivia una singola notifica (cancellazione LOGICA) ────────────────
  if (stato.azione === "archivia") {
    const { data: notifica } = await db
      .from("admin_notifiche")
      .select("id, user_id, archiviata_at")
      .eq("id", stato.id)
      .single();

    if (!notifica) {
      return apiError("NOT_FOUND", "Notifica non trovata.", 404);
    }
    if (notifica.user_id !== null && notifica.user_id !== sessione.user.id) {
      return apiError("FORBIDDEN", "Non puoi gestire questa notifica.", 403);
    }
    if (notifica.archiviata_at !== null) {
      return apiError("NOT_FOUND", "Notifica non trovata.", 404);
    }

    const { error: updateError } = await db
      .from("admin_notifiche")
      .update({ archiviata_at: adesso, letta_at: adesso })
      .eq("id", stato.id);
    if (updateError) {
      return apiError("UPDATE_FAILED", updateError.message ?? "Impossibile archiviare la notifica.", 500);
    }

    const unreadCount = await contaNotificheAdminNonLette();
    return apiOk({ notifiche: [{ id: stato.id, archiviata_at: adesso }], unreadCount });
  }

  // ── Segna TUTTE le notifiche (non archiviate) come lette ─────────────────
  const { data: aggiornate, error: updateError } = await db
    .from("admin_notifiche")
    .update({ letta_at: adesso })
    .is("letta_at", null)
    .is("archiviata_at", null)
    .select("id");

  if (updateError) {
    return apiError("UPDATE_FAILED", updateError.message ?? "Impossibile aggiornare le notifiche.", 500);
  }

  const unreadCount = await contaNotificheAdminNonLette();
  return apiOk({
    notifiche: (aggiornate ?? []).map((r) => ({
      id: String((r as Record<string, unknown>).id),
      letta_at: adesso,
    })),
    unreadCount,
  });
}