/**
 * Pino — Telemetria dei turni.
 *
 * Oggi l'unica traccia delle decisioni è `console.info("[pino-decisione]")`:
 * i log della piattaforma sono effimeri, quindi non esiste un dataset dei
 * fallimenti reali. Senza dati, ogni miglioramento è alla cieca.
 *
 * `pino_turni` registra una riga per risposta: domanda, intento, esito,
 * quantità restituite, latenza e percorso. Nessun dato personale oltre al
 * testo della richiesta (già troncato a 500 caratteri dal chiamante).
 *
 * La scrittura è affidata a `after()` della route: non ritarda la risposta e
 * non fa fallire il turno se la tabella non esiste ancora.
 *
 * @module lib/assistente/telemetria
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type EsitoTurnoPino = "ok" | "vuoto" | "degradato";

export type TurnoPinoTelemetria = {
  domanda: string;
  intent?: string | null;
  esito: EsitoTurnoPino;
  negozi: number;
  prodotti: number;
  ms: number;
  percorso: string;
  lingua?: string | null;
  motivo?: string | null;
  /** Canale che ha prodotto il turno: ui, api o test. */
  origine?: string | null;
  /** true se la risposta è arrivata in streaming NDJSON. */
  streaming?: boolean;
  /** Commit/deploy che ha servito la risposta. */
  release?: string | null;
  /** Tempo speso nel contesto dinamico prima dell'orchestratore. */
  msContesto?: number | null;
};

/**
 * Motivi che chiudono un turno senza una ricerca di catalogo: un turno così è
 * una risposta riuscita, non un vuoto. Prima `esito` confondeva «non ci sono
 * offerte» con «non ho capito la richiesta».
 */
const MOTIVI_SENZA_RICERCA: ReadonlySet<string> = new Set([
  "conversazione",
  "sicurezza_alimentare",
  "istruzioni_interne",
  "azione_non_disponibile",
  "servizio_non_coperto",
  "faq",
  "preferenza_lingua",
  "capacita_lingua",
  "saluto",
  "cinema",
  "attrazioni",
  "attrazioni_assenti",
  "prezzo_senza_soggetto",
  "info_attivita",
  "conteggio_attivita",
  "meteo",
  "farmacie",
  "aggregata",
  "offerte_assenti",
  "eventi_assenti",
  "servizio_assente",
  "orari",
  "ora_data",
  "follow_up",
]);

export function calcolaEsitoTurnoPino(input: {
  motivo?: string | null;
  negozi: number;
  prodotti: number;
}): EsitoTurnoPino {
  if (input.motivo && MOTIVI_SENZA_RICERCA.has(input.motivo)) return "ok";
  return input.negozi + input.prodotti === 0 ? "vuoto" : "ok";
}

/** Evita un tentativo (e un warning) per ogni turno se la tabella manca. */
let tabellaDisponibile = true;

export async function registraTurnoPino(
  turno: TurnoPinoTelemetria
): Promise<void> {
  if (!tabellaDisponibile) return;
  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.from("pino_turni").insert({
      domanda: String(turno.domanda ?? "").slice(0, 500),
      intent: turno.intent ?? null,
      esito: turno.esito,
      negozi: turno.negozi,
      prodotti: turno.prodotti,
      ms: turno.ms,
      percorso: turno.percorso,
      lingua: turno.lingua ?? null,
      motivo: turno.motivo ?? null,
      origine: turno.origine ?? null,
      streaming: turno.streaming === true,
      release: turno.release ?? null,
      ms_contesto: turno.msContesto ?? null,
    });
    if (error) {
      // Migrazione non applicata: la telemetria è un di più, non un requisito
      // del turno. Si smette di tentare finché il processo resta vivo.
      tabellaDisponibile = false;
      console.warn(
        "[pino-telemetria] tabella pino_turni non disponibile:",
        error.message
      );
    }
  } catch (errore) {
    // Telemetria mai bloccante: un errore qui non deve emergere dalla route.
    console.warn("[pino-telemetria] non disponibile:", errore);
  }
}
