/**
 * Macchina a stati degli ordini (AREA VENDITORE) — PURA e testabile.
 *
 * Specchia ESATTAMENTE la macchina a stati implementata nella RPC
 * `aggiorna_stato_ordine` (migrazione 20260815): nessuna logica duplicata
 * di fatto, ma una proiezione TS usata da UI (filtri, azioni, etichette) e
 * dai test. Le transizioni vengono SEMPRE validate di nuovo lato DB.
 *
 * Workflow:
 *   NUOVO (in_preparazione) → CONFERMATO → IN_LAVORAZIONE → PRONTO →
 *   COMPLETATO (consegnato); ANNULLATO (cancellato) da ogni fase compatibile.
 *   COMPLETATO e ANNULLATO sono terminali.
 */

import type { StatoOrdine } from "@/lib/cliente/types";

/** Etichetta leggibile di ogni stato (stessa dell'area clienti). */
export const ETICHETTE_STATO: Record<StatoOrdine, string> = {
  in_preparazione: "Nuovo",
  confermato: "Confermato",
  in_lavorazione: "In lavorazione",
  pronto: "Pronto",
  in_consegna: "In consegna",
  consegnato: "Completato",
  cancellato: "Annullato",
};

/** Filtri della lista ordini venditore. */
export type FiltroOrdini =
  | "tutti"
  | "nuovi"
  | "lavorazione"
  | "pronti"
  | "completati"
  | "annullati";

export const FILTRI_ORDINI: ReadonlyArray<{
  key: FiltroOrdini;
  etichetta: string;
  stati: StatoOrdine[];
}> = [
  { key: "tutti", etichetta: "Tutti", stati: [] },
  { key: "nuovi", etichetta: "Nuovi", stati: ["in_preparazione"] },
  {
    key: "lavorazione",
    etichetta: "In lavorazione",
    stati: ["confermato", "in_lavorazione", "in_consegna"],
  },
  { key: "pronti", etichetta: "Pronti", stati: ["pronto"] },
  { key: "completati", etichetta: "Completati", stati: ["consegnato"] },
  { key: "annullati", etichetta: "Annullati", stati: ["cancellato"] },
];

export function isFiltroOrdini(value: string | null | undefined): value is FiltroOrdini {
  return FILTRI_ORDINI.some((f) => f.key === value);
}

/** True se il valore è uno stato ordine valido. */
export function isStatoOrdine(value: unknown): value is StatoOrdine {
  return (
    typeof value === "string" &&
    ([
      "in_preparazione",
      "confermato",
      "in_lavorazione",
      "pronto",
      "in_consegna",
      "consegnato",
      "cancellato",
    ] as const).includes(value as StatoOrdine)
  );
}

/** Stati inclusi da un filtro (tutti = nessun filtro). */
export function statiPerFiltro(filtro: FiltroOrdini): StatoOrdine[] {
  const entry = FILTRI_ORDINI.find((f) => f.key === filtro);
  return entry?.stati ?? [];
}

/**
 * Transizione consentita tra due stati.
 * Lo stato identico è SEMPRE consentito (no-op idempotente, come la RPC).
 * COMPLETATO e ANNULLATO sono terminali: non escono mai.
 */
export function transizioneConsentita(da: StatoOrdine, a: StatoOrdine): boolean {
  if (da === a) return true;
  switch (da) {
    case "in_preparazione":
      return a === "confermato" || a === "cancellato";
    case "confermato":
      return a === "in_lavorazione" || a === "cancellato";
    case "in_lavorazione":
      return a === "pronto" || a === "cancellato";
    case "pronto":
      return a === "consegnato" || a === "cancellato";
    case "in_consegna":
      return a === "consegnato" || a === "cancellato";
    case "consegnato":
    case "cancellato":
      return false;
    default:
      return false;
  }
}

/** Azione del venditore su un ordine. */
export type AzioneOrdine = {
  /** Stato di destinazione. */
  stato: StatoOrdine;
  etichetta: string;
  /** true → azione distruttiva (annullamento, richiede conferma + motivo). */
  distruttiva?: boolean;
};

/**
 * Azioni disponibili per uno stato (pulsanti del dettaglio ordine).
 * - NUOVO:         [Conferma ordine] [Annulla ordine]
 * - CONFERMATO:    [Inizia lavorazione] [Annulla ordine]
 * - IN_LAVORAZIONE:[Segna come pronto] [Annulla ordine]
 * - PRONTO:        [Segna come completato]
 * - COMPLETATO:    nessuna azione distruttiva
 * - ANNULLATO:     sola consultazione
 */
export function azioniDisponibili(stato: StatoOrdine): AzioneOrdine[] {
  switch (stato) {
    case "in_preparazione":
      return [
        { stato: "confermato", etichetta: "Conferma ordine" },
        { stato: "cancellato", etichetta: "Annulla ordine", distruttiva: true },
      ];
    case "confermato":
      return [
        { stato: "in_lavorazione", etichetta: "Inizia lavorazione" },
        { stato: "cancellato", etichetta: "Annulla ordine", distruttiva: true },
      ];
    case "in_lavorazione":
      return [
        { stato: "pronto", etichetta: "Segna come pronto" },
        { stato: "cancellato", etichetta: "Annulla ordine", distruttiva: true },
      ];
    case "pronto":
      return [{ stato: "consegnato", etichetta: "Segna come completato" }];
    case "in_consegna":
      return [{ stato: "consegnato", etichetta: "Segna come completato" }];
    case "consegnato":
    case "cancellato":
      return [];
    default:
      return [];
  }
}

/**
 * Priorità di ordinamento della lista (prima i nuovi, poi in lavorazione,
 * poi conclusi; a parità di priorità il più recente vince).
 */
export function prioritaStato(stato: StatoOrdine): number {
  switch (stato) {
    case "in_preparazione":
      return 0;
    case "confermato":
      return 1;
    case "in_lavorazione":
      return 2;
    case "pronto":
      return 3;
    case "in_consegna":
      return 4;
    case "consegnato":
      return 5;
    case "cancellato":
      return 6;
    default:
      return 7;
  }
}

/** Motivazioni rapide di annullamento (obbligatorie; nota solo se "Altro"). */
export const MOTIVI_ANNULLAMENTO: ReadonlyArray<{
  valore: string;
  etichetta: string;
  richiedeNota: boolean;
}> = [
  { valore: "prodotto_non_disponibile", etichetta: "Prodotto non disponibile", richiedeNota: false },
  { valore: "quantita_insufficiente", etichetta: "Quantità insufficiente", richiedeNota: false },
  { valore: "impossibilita_preparazione", etichetta: "Impossibilità di preparazione", richiedeNota: false },
  { valore: "problema_ritiro", etichetta: "Problema con il ritiro", richiedeNota: false },
  { valore: "problema_spedizione", etichetta: "Problema con la spedizione", richiedeNota: false },
  { valore: "altro", etichetta: "Altro", richiedeNota: true },
];

/** Etichetta di un motivo di annullamento (per lo storico e la UI). */
export function etichettaMotivoAnnullamento(motivo: string | null | undefined): string {
  if (!motivo) return "";
  const found = MOTIVI_ANNULLAMENTO.find((m) => m.valore === motivo);
  if (found) return found.etichetta;
  return motivo;
}
