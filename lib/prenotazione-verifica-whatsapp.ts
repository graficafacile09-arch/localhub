/**
 * VERIFICA SU WHATSAPP — link precompilato per la prenotazione del cliente.
 *
 * Funzione pura (client-safe, nessun import server-side) che riutilizza
 * `normalizzaNumeroWhatsApp` (lib/telefono.ts) e il pattern wa.me già usato
 * nel progetto (app/negozio, app/prodotto). Nessun numero fisso globale:
 * il numero arriva dal negozio corrente (`negozi.whatsapp`, fallback
 * `negozi.telefono`, come le buildWhatsAppUrl esistenti).
 */
import { normalizzaNumeroWhatsApp } from "./telefono";

export type DatiVerificaWhatsAppPrenotazione = {
  /** Numero della prenotazione (es. "PR-123"). */
  numero: string;
  /** Nome del servizio prenotato. */
  servizio: string;
  /** Data civile del giorno prenotato, YYYY-MM-DD (Europe/Rome). */
  giorno: string;
  /** Ora di inizio, HH:MM. */
  ora: string;
};

/** "2026-09-15" → "15/09/2026" (per il testo del messaggio). */
export function formattaDataItaliana(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso || "";
  const [, anno, mese, giorno] = m;
  return `${giorno}/${mese}/${anno}`;
}

/** Messaggio precompilato per la verifica dell'appuntamento. */
export function messaggioVerificaPrenotazione(
  d: DatiVerificaWhatsAppPrenotazione
): string {
  return [
    "Buongiorno, vorrei verificare il mio appuntamento.",
    d.numero ? `Prenotazione: ${d.numero}` : "",
    d.servizio ? `Servizio: ${d.servizio}` : "",
    `Data: ${formattaDataItaliana(d.giorno)}`,
    `Ora: ${(d.ora ?? "").slice(0, 5)}`,
  ]
    .filter((riga) => riga.trim() !== "")
    .join("\n");
}

/**
 * Costruisce il link wa.me per la verifica della prenotazione.
 * Ritorna "" se il numero WhatsApp del negozio non è configurato (in tal caso
 * il pulsante NON deve comparire).
 */
export function linkWhatsAppVerificaPrenotazione(
  whatsappRaw: string | null | undefined,
  d: DatiVerificaWhatsAppPrenotazione
): string {
  const numero = normalizzaNumeroWhatsApp(whatsappRaw ?? "");
  if (!numero) return "";
  const testo = encodeURIComponent(messaggioVerificaPrenotazione(d));
  return `https://wa.me/${numero}?text=${testo}`;
}