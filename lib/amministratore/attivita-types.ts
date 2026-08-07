/**
 * Tipi del modulo Attività (/amministratore/attivita) — centro di controllo
 * di tutti i negozi della piattaforma (non è il pannello Merchant).
 */

/** Riga della tabella Attività (dati reali dal database). */
export type AttivitaRow = {
  id: string;
  nome: string;
  slug: string | null;
  categoria: string | null;
  logo_url: string | null;
  /** Città/località del negozio, se impostata. */
  citta: string | null;
  /** Flag demo/test (seed o negozi di test). */
  is_demo: boolean;
  /** ID del proprietario (auth.users) o null se non assegnato. */
  proprietarioId: string | null;
  /** Email del proprietario (da auth.users) o null se non assegnato. */
  proprietario: string | null;
  /** Numero di prodotti attivi. */
  prodotti: number;
  attivo: boolean;
  in_evidenza: boolean;
  /** ISO 8601 della data di creazione. */
  created_at: string;
};

/** Filtro stato nella barra superiore. */
export type FiltroStatoAttivita = "tutti" | "attivi" | "disattivati";

/** Filtro in evidenza. */
export type FiltroEvidenzaAttivita = "tutti" | "solo-evidenza";

/** Ordinamenti disponibili. */
export type OrdinaAttivita =
  | "recenti"
  | "nome"
  | "prodotti"
  | "evidenza"
  | "stato";

/** Opzioni per il select di ordinamento. */
export const OPZIONI_ORDINA: Record<OrdinaAttivita, string> = {
  recenti: "Più recenti",
  nome: "Nome (A–Z)",
  prodotti: "Più prodotti",
  evidenza: "In evidenza prima",
  stato: "Attive prima",
};
