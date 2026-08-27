import { apiOk } from "@/lib/api/response";
import {
  getFarmacieTurnoCastrovillari,
  type FarmaciaTurno,
} from "@/lib/farmacie-turno";

/**
 * GET /api/farmacie-turno
 *
 * Farmacie di turno a Castrovillari (pubbliche, nessuna autenticazione).
 * Alimenta il widget nell'header. I dati arrivano da farmaciediturno.org
 * (pagina "Orari di oggi" del comune 78033) e vengono memorizzati in cache
 * in memoria per non martellare il sito esterno a ogni richiesta.
 *
 * - Cache con dati validi: 30 minuti.
 * - Risultato vuoto (sito esterno giù/formato cambiato): cache breve di
 *   2 minuti, così il widget sparisce ma si ritenta presto.
 *
 * La risposta segue la convenzione apiOk: { success, data }.
 */
const TTL_VALIDO_MS = 30 * 60 * 1000;
const TTL_VUOTO_MS = 2 * 60 * 1000;

let cache: { data: FarmaciaTurno[]; creataIl: number; scadeIl: number } | null =
  null;

export async function GET() {
  const ora = Date.now();
  if (!cache || ora >= cache.scadeIl) {
    const dati = await getFarmacieTurnoCastrovillari();
    const ttl = dati.length > 0 ? TTL_VALIDO_MS : TTL_VUOTO_MS;
    cache = { data: dati, creataIl: ora, scadeIl: ora + ttl };
  }

  return apiOk({
    farmacie: cache.data,
    aggiornato: new Date(cache.creataIl).toISOString(),
  });
}
