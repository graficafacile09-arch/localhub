/**
 * Tipi della conoscenza testuale indicizzata per Pino (Fase A).
 *
 * Una voce è un pezzo di testo informativo con la sua pagina di origine.
 * Non contiene prodotti, negozi, prezzi, offerte o eventi strutturati:
 * quelli restano letti dalle fonti originali.
 */

export type SezioneConoscenza =
  | "territorio"
  | "filiera"
  | "stagionalita"
  | "faq"
  | "attrazione"
  | "pagina"
  | "contenuto";

export type VoceConoscenza = {
  /** Chiave stabile della voce, unica per fonte (es. "territorio:castrovillari"). */
  chiave: string;
  sezione: SezioneConoscenza;
  /** Percorso relativo canonico della pagina (es. "/territorio/castrovillari"). */
  percorso: string;
  titolo: string;
  /** Testo pulito, senza markup, pronto per l'indice FTS. */
  testo: string;
};

export type VoceConoscenzaConHash = VoceConoscenza & { hash: string };

/** Esito di una scansione completa di una sorgente. */
export type EsitoScansione =
  | { ok: true; completa: true; voci: VoceConoscenza[] }
  | { ok: false; errore: string };
