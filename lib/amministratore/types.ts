/**
 * Tipi del sistema Ruoli e Permessi del pannello Amministratore.
 * Modulo /amministratore/utenti — dati reali da auth.users + user_roles.
 */

/** Ruoli di piattaforma LocalHub. */
export type RuoloUtente = "amministratore" | "commerciante" | "utente";

/** Stato dell'account utente. */
export type StatoUtente = "attivo" | "disattivato";

/** Etichette e colori dei ruoli (usati da tab e tabella). */
export const RUOLI_UTENTE: Record<RuoloUtente, { label: string }> = {
  amministratore: { label: "Amministratore" },
  commerciante: { label: "Commerciante" },
  utente: { label: "Utente" },
};

/** Filtri disponibili nelle tab del modulo utenti. */
export type FiltroRuoloUtente = "tutti" | RuoloUtente;

/** Record utente mostrato nella tabella di gestione. */
export type Utente = {
  id: string;
  nome: string;
  email: string;
  ruolo: RuoloUtente;
  stato: StatoUtente;
  /** ISO 8601 dell'ultimo accesso (o null se mai entrato). */
  ultimoAccesso: string | null;
  /** Numero di negozi gestiti (solo commercianti). */
  negozi?: number;
  /** Data di registrazione (ISO 8601). */
  registratoIl: string;
};
