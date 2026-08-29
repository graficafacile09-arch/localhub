export type DaySchedule = {
  chiuso: boolean;
  apertura1: string;
  chiusura1: string;
  apertura2: string;
  chiusura2: string;
};

export type Orari = Record<string, DaySchedule>;

export type ColoriBrand = {
  primary: string;
  secondary: string;
  accent: string;
};

export type Negozio = {
  id: string;
  slug: string | null;
  owner_user_id: string | null;

  nome: string;
  categoria: string | null;
  sottocategoria: string | null;
  descrizione: string | null;
  descrizione_completa: string | null;

  logo_url: string | null;
  copertina_url: string | null;
  galleria: string[];

  telefono: string | null;
  email_negozio: string | null;
  whatsapp: string | null;
  sito_web: string | null;

  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  coordinate: string | null;

  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;

  orari: Orari | null;

  servizi: string[];
  colori: ColoriBrand;
  parole_chiave: string[];

  attivo: boolean;
  mostra_telefono: boolean;
  mostra_indirizzo: boolean;
  mostra_orari: boolean;
  accetta_whatsapp: boolean;
  in_evidenza: boolean;

  /** Commissione piattaforma specifica del negozio (0–10, %); NULL = globale. */
  commissione_percentuale: number | null;

  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];

  is_template: boolean;
  template_name: string | null;
  moduli_attivi: string[];
  data: Record<string, unknown>;
  version: number;

  deleted_at: string | null;
  deleted_by: string | null;

  created_at: string;
  updated_at: string;
};

export type Categoria = {
  id: string;
  nome: string;
  slug: string;
  descrizione: string | null;
  icona: string | null;
  immagine: string | null;
  sinonimi: string[];
  ordine: number;
  attivo: boolean;
};

export type ModuloRegistro = {
  id: string;
  slug: string;
  nome: string;
  descrizione: string | null;
  icona: string;
  ordinamento: number;
  attivo: boolean;
  default_in_template: boolean;
};

export type ModuloProps = {
  storeId: string;
  data: Record<string, unknown>;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  saving: boolean;
};

export const DAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"] as const;
export const ITALIAN_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

export const EMPTY_DAY: DaySchedule = {
  chiuso: false,
  apertura1: "",
  chiusura1: "",
  apertura2: "",
  chiusura2: "",
};

export const CLOSED_DAY: DaySchedule = {
  chiuso: true,
  apertura1: "",
  chiusura1: "",
  apertura2: "",
  chiusura2: "",
};

export const DEFAULT_HOURS: Orari = {
  lunedì: { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" },
  martedì: { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" },
  mercoledì: { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" },
  giovedì: { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" },
  venerdì: { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" },
  sabato: { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "15:00", chiusura2: "19:00" },
  domenica: { chiuso: true, apertura1: "", chiusura1: "", apertura2: "", chiusura2: "" },
};

export function parseTime(t: string): number {
  const parts = t.split(":").map(Number);
  return parts[0] * 60 + (parts[1] ?? 0);
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Stato di una prenotazione (Fase 6a, fondamenti). Coerente con lo schema
 * DB progettato: `confermata` è lo default; `cancellata`/`effettuata`/`no_show`
 * sono terminali. Nessuna logica di transizione in questa fase.
 */
export type PrenotazioneStato =
  | "confermata"
  | "cancellata"
  | "effettuata"
  | "no_show";

/**
 * Prenotazione di un servizio (Fase 6a, fondamenti). Specchia la tabella
 * `prenotazioni` progettata: una riga = un appuntamento confermato su un
 * giorno/ora (inizio) di un servizio del negozio. `idempotency_key` previene
 * il doppio invio; giorno/ora sono in timezone civile (Europe/Rome) la cui
 * logica verrà implementata in fasi successive.
 */
export type Prenotazione = {
  id: string;
  numero: string;
  idempotency_key: string;
  negozio_id: string;
  servizio_id: string;
  servizio_nome: string;
  durata_min: number;
  giorno: string;
  ora_inizio: string;
  ora_fine: string;
  cliente_user_id: string | null;
  cliente_nome: string;
  cliente_cognome: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  note: string | null;
  stato: PrenotazioneStato;
  motivo_annullo: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Configurazione prenotazioni del negozio (Fase 6a, fondamenti). Persistita in
 * `negozi.data.prenotazioni_config` (jsonb). SOLO le opzioni necessarie alla
 * v1 progettata; la logica di applicazione arriverà nelle fasi successive.
 * Tutto nullabile dove il modello lo richiede (es. `limite_giornaliero`):
 * `null` = nessun limite. Grandezze temporali: `anticipo_min_ore`/
 * `anticipo_max_giorni` definiscono la finestra di prenotazione in
 * timezone operativa (Europe/Rome, logica futura).
 */
export type ConfigPrenotazioni = {
  attiva: boolean;
  anticipo_min_ore: number;
  anticipo_max_giorni: number;
  buffer_min: number;
  limite_giornaliero: number | null;
  passo_slot_min: number;
};
