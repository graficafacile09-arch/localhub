/**
 * PRENOTAZIONI — helper condivisi per le API (Fase 6d).
 *
 * Riutilizza i tipi della Fase 6a, l'algoritmo puro della Fase 6c e le RPC
 * atomiche della Fase 6b. Include:
 *   - default e lettura di `ConfigPrenotazioni` (negozi.data.prenotazioni_config);
 *   - risoluzione del `DaySchedule` del giorno (negozi.orari jsonb);
 *   - mapping codice RPC → HTTP (mai esporre SQL grezzo);
 *   - wrapper per la chiamata service-role alle RPC.
 *
 * SOLO server-side: questo modulo importa il client admin (service role).
 */

import {
  type ConfigPrenotazioni,
} from "@/types/negozio";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
// Risoluzione del giorno (settimana + eccezioni Agenda annuale): l'unico punto
// è `risolviGiorno`/`getDaySchedule` in lib/agenda.ts (funzioni pure, riusate
// da route e client). Qui vengono solo ri-esportate per compatibilità.
export { getDaySchedule, risolviGiorno } from "@/lib/agenda";

/** Default di configurazione prenotazioni (coerente con Fase 6a/6c). */
export const PRENOTAZIONI_CONFIG_DEFAULT: ConfigPrenotazioni = {
  attiva: false,
  anticipo_min_ore: 0,
  anticipo_max_giorni: 30,
  buffer_min: 0,
  limite_giornaliero: null,
  passo_slot_min: 15,
};

/** Legge la configurazione prenotazioni da `negozi.data.prenotazioni_config`. */
export function getConfigPrenotazioni(
  data: Record<string, unknown> | null | undefined
): ConfigPrenotazioni {
  const raw = data?.prenotazioni_config as Partial<ConfigPrenotazioni> | null | undefined;
  if (!raw || typeof raw !== "object") return { ...PRENOTAZIONI_CONFIG_DEFAULT };

  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  return {
    attiva: raw.attiva === true,
    anticipo_min_ore: num(raw.anticipo_min_ore, 0),
    anticipo_max_giorni: num(raw.anticipo_max_giorni, 30),
    buffer_min: num(raw.buffer_min, 0),
    limite_giornaliero:
      typeof raw.limite_giornaliero === "number" && Number.isFinite(raw.limite_giornaliero)
        ? raw.limite_giornaliero
        : null,
    passo_slot_min: num(raw.passo_slot_min, 15),
  };
}



/** Esito RPC restituito dalle funzioni SQL (jsonb). */
export type EsitoRpc =
  | {
      ok: boolean;
      codice?: string;
      messaggio?: string;
      giaEsistente?: boolean;
      prenotazione?: Record<string, unknown> | null;
    }
  | null;

/**
 * Traduce il codice RPC in stato HTTP + messaggio comprensibile.
 * MAI esporre dettagli PostgreSQL al client.
 */
export function esitoRpcHttp(
  esito: EsitoRpc,
  fallbackCodice = "SAVE_FAILED",
  fallbackMessaggio = "Impossibile completare l'operazione.",
  fallbackStatus = 500
): { status: number; codice: string; messaggio: string } {
  const codice = esito?.codice ?? fallbackCodice;
  const messaggio = esito?.messaggio ?? fallbackMessaggio;

  switch (codice) {
    case "STORE_NOT_FOUND":
    case "BOOKING_NOT_FOUND":
    case "SERVICE_NOT_FOUND":
      return { status: 404, codice, messaggio };
    case "STORE_INACTIVE":
    case "SERVICE_INACTIVE":
    case "BOOKING_NOT_ACTIVE":
    case "FORBIDDEN":
      return { status: 403, codice, messaggio };
    case "SLOT_OCCUPATO":
      return { status: 409, codice, messaggio };
    case "INVALID_PAYLOAD":
    case "INVALID_IDEMPOTENCY_KEY":
    case "INVALID_DATE":
    case "INVALID_TIME":
    case "PAST_DATE":
    case "STORE_CLOSED":
    case "SLOT_OUTSIDE_HOURS":
    case "SCHEDULE_MISSING":
      return { status: 422, codice, messaggio };
    default:
      return { status: fallbackStatus, codice, messaggio };
  }
}

export interface DatiPrenotazione {
  idempotencyKey: string;
  negozioId: string;
  servizioId: string;
  giorno: string;
  oraInizio: string;
  nome: string;
  cognome: string;
  telefono?: string | null;
  email?: string | null;
  note?: string | null;
  clienteUserId?: string | null;
}

/** Crea una prenotazione tramite la RPC atomica `crea_prenotazione`. */
export async function creaPrenotazione(
  dati: DatiPrenotazione
): Promise<{ error: string | null; esito: EsitoRpc }> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("crea_prenotazione", {
    p_payload: {
      idempotencyKey: dati.idempotencyKey,
      negozioId: dati.negozioId,
      servizioId: dati.servizioId,
      giorno: dati.giorno,
      oraInizio: dati.oraInizio,
      nome: dati.nome,
      cognome: dati.cognome,
      telefono: dati.telefono ?? null,
      email: dati.email ?? null,
      note: dati.note ?? null,
      clienteUserId: dati.clienteUserId ?? null,
    },
  });
  if (error) {
    return { error: error.message ?? "Impossibile creare la prenotazione.", esito: null };
  }
  return { error: null, esito: (data ?? null) as EsitoRpc };
}

/** Annulla una prenotazione tramite la RPC `annulla_prenotazione`. */
export async function annullaPrenotazione(
  prenotazioneId: string,
  motivo: string | null,
  actor: "cliente" | "merchant" | "admin",
  actorId: string
): Promise<{ error: string | null; esito: EsitoRpc }> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("annulla_prenotazione", {
    p_prenotazione_id: prenotazioneId,
    p_motivo: motivo,
    p_actor: actor,
    p_actor_id: actorId,
  });
  if (error) {
    return { error: error.message ?? "Impossibile annullare la prenotazione.", esito: null };
  }
  return { error: null, esito: (data ?? null) as EsitoRpc };
}

/** Sposta una prenotazione tramite la RPC `sposta_prenotazione`. */
export async function spostaPrenotazione(
  prenotazioneId: string,
  nuovoGiorno: string,
  nuovaOra: string,
  actor: "cliente" | "merchant" | "admin",
  actorId: string
): Promise<{ error: string | null; esito: EsitoRpc }> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("sposta_prenotazione", {
    p_prenotazione_id: prenotazioneId,
    p_nuova_giorno: nuovoGiorno,
    p_nuova_ora: nuovaOra,
    p_actor: actor,
    p_actor_id: actorId,
  });
  if (error) {
    return { error: error.message ?? "Impossibile spostare la prenotazione.", esito: null };
  }
  return { error: null, esito: (data ?? null) as EsitoRpc };
}