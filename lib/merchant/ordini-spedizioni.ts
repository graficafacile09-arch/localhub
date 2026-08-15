/**
 * Macchina a stati della SPEDIZIONE (V1 tracking) — PURA e testabile.
 *
 * Specchia ESATTAMENTE la macchina a stati implementata nella RPC
 * `aggiorna_stato_spedizione` (migration 20260903): nessuna logica duplicata
 * di fatto, ma una proiezione TS usata da UI (azioni, etichette) e dai test.
 * Le transizioni vengono SEMPRE validate di nuovo lato DB.
 *
 * La macchina è INDIPENDENTE da quella dell'ordine (ordini-stati.ts):
 *   - STATO ORDINE:   in_preparazione → confermato → in_lavorazione → pronto
 *                     → consegnato / cancellato;
 *   - STATO SPEDIZIONE: NULL/non_affidata → affidata → in_transito →
 *                     consegnata; affidata/in_transito → problema →
 *                     rientro in affidata/in_transito.
 *
 * Transizioni consentite:
 *   NULL          → non_affidata | affidata
 *   non_affidata  → affidata
 *   affidata      → in_transito | problema
 *   in_transito   → consegnata | problema
 *   problema      → affidata | in_transito
 *   consegnata    → terminale
 */

import type { StatoOrdine, StatoSpedizione } from "@/lib/cliente/types";

/** Etichetta leggibile di ogni stato spedizione. */
export const ETICHETTE_STATO_SPEDIZIONE: Record<StatoSpedizione, string> = {
  non_affidata: "Non affidata",
  affidata: "Affidata al corriere",
  in_transito: "In transito",
  consegnata: "Consegnata",
  problema: "Problema",
};

/** Etichetta di uno stato spedizione; null per gli ordini senza stato. */
export function etichettaStatoSpedizione(
  stato: StatoSpedizione | null | undefined
): string | null {
  if (!stato) return null;
  return ETICHETTE_STATO_SPEDIZIONE[stato];
}

/** True se il valore è uno stato spedizione valido. */
export function isStatoSpedizione(value: unknown): value is StatoSpedizione {
  return (
    typeof value === "string" &&
    (["non_affidata", "affidata", "in_transito", "consegnata", "problema"] as const).includes(
      value as StatoSpedizione
    )
  );
}

/**
 * Transizione consentita tra due stati spedizione (`da` può essere null =
 * ordine storico o spedizione non ancora gestita). Nessuna transizione
 * all'indietro: `consegnata` è terminale.
 */
export function transizioneSpedizioneConsentita(
  da: StatoSpedizione | null,
  a: StatoSpedizione
): boolean {
  switch (a) {
    case "non_affidata":
      return da === null;
    case "affidata":
      // NULL (base), non_affidata oppure rientro da problema.
      return da === null || da === "non_affidata" || da === "problema";
    case "in_transito":
      return da === "affidata" || da === "problema";
    case "consegnata":
      return da === "in_transito";
    case "problema":
      return da === "affidata" || da === "in_transito";
    default:
      return false;
  }
}

/** Codici azione accettati dall'API (mappati in stato destinazione). */
export type AzioneSpedizioneCodice =
  | "affida"
  | "transito"
  | "consegnata"
  | "problema"
  | "riassegna";

export function isAzioneSpedizione(value: unknown): value is AzioneSpedizioneCodice {
  return (
    typeof value === "string" &&
    (["affida", "transito", "consegnata", "problema", "riassegna"] as const).includes(
      value as AzioneSpedizioneCodice
    )
  );
}

/** Converte un codice azione nello stato spedizione di destinazione. */
export function azioneVersoStato(azione: AzioneSpedizioneCodice): StatoSpedizione {
  switch (azione) {
    case "affida":
    case "riassegna":
      return "affidata";
    case "transito":
      return "in_transito";
    case "consegnata":
      return "consegnata";
    case "problema":
      return "problema";
  }
}

/** Azione spedizione mostrata al venditore. */
export type AzioneSpedizione = {
  azione: AzioneSpedizioneCodice;
  stato: StatoSpedizione;
  etichetta: string;
  /** true → richiede il dialog di tracking (codice obbligatorio). */
  richiedeTracking: boolean;
};

/**
 * Azioni spedizione disponibili per il venditore, in base allo stato
 * spedizione e allo stato ordine:
 * - "Affida al corriere" è disponibile SOLO quando l'ordine è PRONTO e la
 *   spedizione non è ancora stata affidata (NULL o non_affidata);
 * - le altre azioni dipendono solo dallo stato spedizione.
 */
export function azioniSpedizioneDisponibili(
  statoSpedizione: StatoSpedizione | null,
  statoOrdine: StatoOrdine
): AzioneSpedizione[] {
  if (
    statoOrdine === "pronto" &&
    (statoSpedizione === null || statoSpedizione === "non_affidata")
  ) {
    return [
      { azione: "affida", stato: "affidata", etichetta: "Affida al corriere", richiedeTracking: true },
    ];
  }
  switch (statoSpedizione) {
    case "affidata":
      return [
        { azione: "transito", stato: "in_transito", etichetta: "Segna in transito", richiedeTracking: false },
        { azione: "problema", stato: "problema", etichetta: "Segnala problema", richiedeTracking: false },
      ];
    case "in_transito":
      return [
        { azione: "consegnata", stato: "consegnata", etichetta: "Segna consegnata", richiedeTracking: false },
        { azione: "problema", stato: "problema", etichetta: "Segnala problema", richiedeTracking: false },
      ];
    case "problema":
      return [
        { azione: "riassegna", stato: "affidata", etichetta: "Riaffida spedizione", richiedeTracking: true },
        { azione: "transito", stato: "in_transito", etichetta: "Segna in transito", richiedeTracking: false },
      ];
    case "consegnata":
    case "non_affidata":
    case null:
    default:
      return [];
  }
}
