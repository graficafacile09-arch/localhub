/**
 * Formattatori PURi per gli ordini (senza alcun import server).
 *
 * Separati dal servizio (lib/cliente/ordini.ts) perché possono essere
 * importati anche dai COMPONENT CLIENT (es. la pagina di recupero ordini
 * guest), che non possono includere codice server-only (next/headers,
 * cookie di sessione) nel bundle browser.
 */

import type { RigaOrdine, StatoOrdine } from "./types";

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

/** Formatta una data/ora ISO in formato italiano breve (es. "16/08 10:30"). */
export function formattaDataOraEvento(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Etichetta leggibile della modalità di consegna. */
export function etichettaModalita(modalita: "ritiro" | "spedizione"): string {
  return modalita === "ritiro" ? "Ritiro" : "Spedizione";
}

/**
 * Sintesi leggibile dei prodotti dell'ordine da mostrare accanto al numero:
 * - un solo prodotto → il suo nome ("#LH-000058 · Integratore Vitamina D");
 * - più prodotti → "N prodotti" ("#LH-000058 · 3 prodotti");
 * - nessuna riga → stringa vuota (il chiamante decide il fallback).
 * MAI l'UUID dell'ordine come identificativo.
 */
export function sintesiProdotti(righe: Pick<RigaOrdine, "nomeProdotto">[]): string {
  const n = Array.isArray(righe) ? righe.length : 0;
  if (n === 0) return "";
  if (n === 1) return (righe[0]?.nomeProdotto ?? "").trim();
  return `${n} prodotti`;
}

/** Etichetta leggibile dello stato dell'ordine. */
export function etichettaStato(stato: StatoOrdine): string {
  switch (stato) {
    case "in_preparazione":
      return "Nuovo";
    case "confermato":
      return "Confermato";
    case "in_lavorazione":
      return "In lavorazione";
    case "pronto":
      return "Pronto";
    case "in_consegna":
      return "In consegna";
    case "consegnato":
      return "Completato";
    case "cancellato":
      return "Annullato";
    default:
      return "In preparazione";
  }
}

/**
 * Configurazione VISIVA dello stato ordine — UNICA fonte per banner e badge.
 *
 * LO STATO DEL DB COMANDA LA GRAFICA: questa funzione centralizza la mappa
 * stato → (emoji, etichetta banner, classi banner, classi badge, colore
 * puntino timeline) così che cliente e venditore usino lo STESSO linguaggio
 * visivo e che un ordine ANNULLATO non possa MAI ricevere la grafica di un
 * ordine confermato. Testabile in modo puro (scripts/test-ordini-vista.ts).
 */
export type ConfigStatoOrdine = {
  emoji: string;
  /** Etichetta maiuscola per il banner (es. "ORDINE ANNULLATO"). */
  etichettaBanner: string;
  /** Classi del banner grande (sfondo, bordo). */
  banner: string;
  /** Classe del colore testo del banner. */
  testo: string;
  /** Classi del badge compatto (liste e header). */
  badge: string;
  /** Colore del puntino nella timeline. */
  dot: string;
  /** true solo per stati terminali (annullato/completato). */
  terminale: boolean;
};

export function configStatoOrdine(stato: StatoOrdine): ConfigStatoOrdine {
  switch (stato) {
    case "in_preparazione":
      return {
        emoji: "🆕",
        etichettaBanner: "ORDINE NUOVO",
        banner: "border-slate-200 bg-slate-50",
        testo: "text-slate-800",
        badge: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
        dot: "bg-slate-400",
        terminale: false,
      };
    case "confermato":
      return {
        emoji: "🟢",
        etichettaBanner: "ORDINE CONFERMATO",
        banner: "border-emerald-200 bg-emerald-50",
        testo: "text-emerald-900",
        badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        dot: "bg-emerald-500",
        terminale: false,
      };
    case "in_lavorazione":
      return {
        emoji: "🔵",
        etichettaBanner: "IN LAVORAZIONE",
        banner: "border-blue-200 bg-blue-50",
        testo: "text-blue-900",
        badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
        dot: "bg-blue-500",
        terminale: false,
      };
    case "pronto":
      return {
        emoji: "🟡",
        etichettaBanner: "ORDINE PRONTO",
        banner: "border-amber-200 bg-amber-50",
        testo: "text-amber-900",
        badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
        dot: "bg-amber-500",
        terminale: false,
      };
    case "in_consegna":
      return {
        emoji: "🚚",
        etichettaBanner: "IN CONSEGNA",
        banner: "border-sky-200 bg-sky-50",
        testo: "text-sky-900",
        badge: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
        dot: "bg-sky-500",
        terminale: false,
      };
    case "consegnato":
      return {
        emoji: "✅",
        etichettaBanner: "ORDINE COMPLETATO",
        banner: "border-teal-200 bg-teal-50",
        testo: "text-teal-900",
        badge: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
        dot: "bg-teal-500",
        terminale: true,
      };
    case "cancellato":
      return {
        emoji: "🔴",
        etichettaBanner: "ORDINE ANNULLATO",
        banner: "border-red-200 bg-red-50",
        testo: "text-red-900",
        badge: "bg-red-50 text-red-700 ring-1 ring-red-200",
        dot: "bg-red-500",
        terminale: true,
      };
    default:
      return configStatoOrdine("in_preparazione");
  }
}
