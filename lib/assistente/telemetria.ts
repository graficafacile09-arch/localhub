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
};

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
