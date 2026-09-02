/**
 * Tipi del sistema Ruoli e Permessi del pannello Amministratore.
 * Modulo /amministratore/utenti — dati reali da auth.users + user_roles.
 *
 * Ruoli memorizzati in user_roles (customer · merchant · admin) → ruoli
 * dell'Area Amministratore (utente · commerciante · amministratore).
 * Un utente può possedere PIÙ ruoli, ma la registrazione ne assegna uno solo;
 * il multi-ruolo viene creato ESCLUSIVAMENTE dall'amministratore.
 */

/** Ruoli di piattaforma (vista Area Amministratore). */
export type RuoloUtente = "amministratore" | "commerciante" | "utente";

/**
 * Stato ACCOUNT — distinto dal ruolo.
 * - attivo:   accesso consentito;
 * - sospeso:  blocco temporaneo (Supabase ban_duration con scadenza);
 * - bannato:  blocco permanente (Supabase ban_duration molto lungo).
 * Sia sospensione sia ban usano l'unico meccanismo di blocco di GoTrue
 * (auth.users.banned_until): la distinzione è di SEMANTICA amministrativa
 * e viene registrata nella tabella user_account_stati (motivo/durate).
 */
export type StatoAccount = "attivo" | "sospeso" | "bannato";

/** Filtri disponibili nelle tab del modulo utenti (ruolo PRIMARIO). */
export type FiltroRuoloUtente = "tutti" | RuoloUtente;

/** Filtro per stato account. */
export type FiltroStatoUtente = "tutti" | StatoAccount;

/** Filtro per verifica email. */
export type FiltroEmailVerificata = "tutte" | "verificate" | "non-verificate";

/** Negozio associato a un utente (mostrato all'admin con link al dettaglio). */
export type NegozioUtente = {
  id: string;
  nome: string;
  slug: string | null;
  attivo: boolean;
};

/**
 * Dettaglio del blocco account in corso (sospensione o ban).
 * fonte: tabella user_account_stati + banned_until di auth.users.
 */
export type BloccoUtente = {
  tipo: "sospeso" | "bannato";
  motivo: string | null;
  /** ISO 8601 di inizio blocco. */
  iniziatoIl: string | null;
  /** ISO 8601 di fine blocco; null per ban permanente (≈100 anni). */
  finoAl: string | null;
};

/** Etichette e colori dei ruoli (usati da tab e tabella). */
export const RUOLI_UTENTE: Record<
  RuoloUtente,
  { label: string; chip: string }
> = {
  amministratore: {
    label: "Amministratore",
    chip: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  commerciante: {
    label: "Venditore",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  utente: {
    label: "Cliente",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
  },
};

/** Etichetta leggibile di un ruolo. */
export function etichettaRuolo(ruolo: RuoloUtente): string {
  return RUOLI_UTENTE[ruolo].label;
}

/** Etichette e stili dello stato account. */
export const STATO_ACCOUNT: Record<
  StatoAccount,
  { label: string; chip: string; dot: string }
> = {
  attivo: {
    label: "Attivo",
    chip: "bg-blue-50 text-blue-700 ring-blue-200",
    dot: "bg-blue-500",
  },
  sospeso: {
    label: "Sospeso",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
  bannato: {
    label: "Bannato",
    chip: "bg-red-50 text-red-700 ring-red-200",
    dot: "bg-red-500",
  },
};

/** Record utente mostrato nel modulo di gestione. */
export type Utente = {
  id: string;
  nome: string;
  email: string;
  /** TUTTI i ruoli posseduti (multi-ruolo esplicito). */
  ruoli: RuoloUtente[];
  /** Ruolo primario (priorità massima) per tab e fallback. */
  ruolo: RuoloUtente;
  stato: StatoAccount;
  emailVerificata: boolean;
  /** ISO 8601 dell'ultimo accesso (o null se mai entrato). */
  ultimoAccesso: string | null;
  /** Negozi posseduti (solo non cestinati). */
  negozi: NegozioUtente[];
  numeroNegozi: number;
  /** Data di registrazione (ISO 8601). */
  registratoIl: string;
  /** Dettaglio blocco in corso (sospeso/bannato), se presente. */
  blocco: BloccoUtente | null;
  /**
   * True per l'account amministratore AUTORIZZATO (email autorizzata):
   * il pannello NON può mai sospenderlo/bannarlo/eliminarlo/degradarlo.
   */
  protetto: boolean;
};
