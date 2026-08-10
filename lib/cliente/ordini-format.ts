/**
 * Formattatori PURi per gli ordini (senza alcun import server).
 *
 * Separati dal servizio (lib/cliente/ordini.ts) perché possono essere
 * importati anche dai COMPONENT CLIENT (es. la pagina di recupero ordini
 * guest), che non possono includere codice server-only (next/headers,
 * cookie di sessione) nel bundle browser.
 */

import type { StatoOrdine } from "./types";

/** Formatta una data ISO in formato italiano (es. "16 agosto 2026"). */
export function formattaDataOrdine(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Etichetta leggibile della modalità di consegna. */
export function etichettaModalita(modalita: "ritiro" | "spedizione"): string {
  return modalita === "ritiro" ? "Ritiro" : "Spedizione";
}

/** Etichetta leggibile dello stato dell'ordine. */
export function etichettaStato(stato: StatoOrdine): string {
  switch (stato) {
    case "in_preparazione":
      return "In preparazione";
    case "in_consegna":
      return "In consegna";
    case "consegnato":
      return "Consegnato";
    case "cancellato":
      return "Annullato";
    default:
      return "In preparazione";
  }
}
