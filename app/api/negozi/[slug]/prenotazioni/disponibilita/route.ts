import { apiError, apiOk } from "@/lib/api/response";
import { risolviNegozioPubblico } from "@/lib/negozi";
import { generaSlotDisponibili, TIMEZONE } from "@/lib/prenotazioni-slot";
import {
  getConfigPrenotazioni,
  getDaySchedule,
} from "@/lib/prenotazioni";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Prenotazione } from "@/types/negozio";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/negozi/[slug]/prenotazioni/disponibilita?servizioId=<id>&giorno=YYYY-MM-DD
 *
 * Anteprima di disponibilità PRELIMINARE. La generazione usa la funzione
 * pura `generaSlotDisponibili` (Fase 6c) con i dati reali del DB (orari,
 * durata servizio, prenotazioni confermate del giorno). Gli slot NON
 * garantiscono la prenotazione: il POST/RPC ricontrolla tutto atomicamente.
 * Solo le prenotazioni `confermata` occupano (cancellata/effettuata/no_show
 * mai bloccanti). Nessuna tabella slot.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const servizioId = url.searchParams.get("servizioId") ?? "";
  const giorno = url.searchParams.get("giorno") ?? "";

  const { negozio } = await risolviNegozioPubblico(slug);
  if (!negozio || negozio.attivo !== true) {
    return apiError("STORE_NOT_FOUND", "Negozio non trovato.", 404);
  }

  const moduliAttivi: string[] = Array.isArray(negozio.moduli_attivi)
    ? (negozio.moduli_attivi as string[])
    : [];
  if (!moduliAttivi.includes("prenotazioni")) {
    return apiError("BOOKING_MODULE_DISABLED", "Questo negozio non accetta prenotazioni.", 403);
  }

  const config = getConfigPrenotazioni((negozio.data ?? {}) as Record<string, unknown>);
  if (!config.attiva) {
    return apiError("BOOKING_MODULE_DISABLED", "Le prenotazioni non sono attive per questo negozio.", 403);
  }

  if (!servizioId || servizioId.length > 64) {
    return apiError("VALIDATION_ERROR", "Servizio non valido.", 422);
  }
  if (!giorno || !DATA_RE.test(giorno)) {
    return apiError("INVALID_DATE", "Data non valida.", 422);
  }
  if (Number.isNaN(new Date(`${giorno}T00:00:00Z`).getTime())) {
    return apiError("INVALID_DATE", "Data non valida.", 422);
  }

  const dataRaw = (negozio.data ?? {}) as Record<string, unknown>;
  const servizi = Array.isArray(dataRaw.servizi_strutturati)
    ? (dataRaw.servizi_strutturati as Array<{
        id?: string;
        nome?: string;
        durata_min?: number | null;
        attivo?: boolean;
      }>)
    : [];
  const servizio = servizi.find((s) => s?.id === servizioId);
  if (!servizio) {
    return apiError("SERVICE_NOT_FOUND", "Servizio non trovato.", 404);
  }
  if (servizio.attivo === false) {
    return apiError("SERVICE_INACTIVE", "Il servizio non è più attivo.", 403);
  }

  const durataMin =
    typeof servizio.durata_min === "number" && Number.isFinite(servizio.durata_min)
      ? Math.round(servizio.durata_min)
      : 30;
  if (durataMin < 5 || durataMin > 480) {
    return apiError("VALIDATION_ERROR", "Durata del servizio non valida.", 422);
  }

  const daySchedule = getDaySchedule(
    (negozio.orari ?? null) as Record<string, import("@/types/negozio").DaySchedule> | null,
    giorno
  );

  // Solo prenotazioni confermate dell'INTERO negozio (la funzione pura filtra
  // per giorno e stato). Una sola query, nessuna tabella slot.
  const supabase = createAdminSupabaseClient();
  const { data: prenotazioni, error } = await supabase
    .from("prenotazioni")
    .select("id, giorno, ora_inizio, ora_fine, stato, negozio_id")
    .eq("negozio_id", String(negozio.id));

  if (error) {
    return apiError("SAVE_FAILED", "Impossibile leggere le prenotazioni.", 500);
  }

  const prenotazioniNormalizzate: Prenotazione[] = (prenotazioni ?? []).map((p) => ({
    id: String(p.id),
    numero: "",
    idempotency_key: "",
    negozio_id: String(p.negozio_id),
    servizio_id: "",
    servizio_nome: "",
    durata_min: 0,
    giorno: String(p.giorno).slice(0, 10),
    ora_inizio: String(p.ora_inizio).slice(0, 5),
    ora_fine: String(p.ora_fine).slice(0, 5),
    cliente_user_id: null,
    cliente_nome: "",
    cliente_cognome: "",
    cliente_telefono: null,
    cliente_email: null,
    note: null,
    stato: p.stato as Prenotazione["stato"],
    motivo_annullo: null,
    created_at: "",
    updated_at: "",
  }));

  const slot = generaSlotDisponibili({
    giorno,
    daySchedule,
    durataMin,
    prenotazioni: prenotazioniNormalizzate,
    config,
    now: new Date(),
  });

  return apiOk({
    giorno,
    servizioId,
    durataMin,
    timezone: TIMEZONE,
    slot: slot.map((s) => ({ oraInizio: s.oraInizio, oraFine: s.oraFine })),
  });
}