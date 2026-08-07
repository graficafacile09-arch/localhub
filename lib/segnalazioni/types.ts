export type SegnalazioneTipo =
  | "negozio"
  | "prodotto"
  | "offerta"
  | "evento"
  | "contenuto"
  | "comportamento"
  | "tecnico"
  | "altro";

export type SegnalazioneStato =
  | "nuova"
  | "presa_in_carico"
  | "risolta"
  | "archiviata";

export type SegnalazionePriorita = "bassa" | "normale" | "alta" | "urgente";

export type SegnalazioneTargetType =
  | "negozio"
  | "prodotto"
  | "offerta"
  | "evento"
  | "utente"
  | "altro";

export type Segnalazione = {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  user_email: string | null;
  tipo: SegnalazioneTipo;
  titolo: string;
  descrizione: string;
  target_type: SegnalazioneTargetType | null;
  target_id: string | null;
  target_name: string | null;
  negozio_id: string | null;
  stato: SegnalazioneStato;
  priorita: SegnalazionePriorita;
  note_admin: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type SegnalazioneAdmin = Segnalazione & {
  negozio_nome: string | null;
};

export type SegnalazioneFiltri = {
  ricerca?: string;
  stato?: SegnalazioneStato;
  priorita?: SegnalazionePriorita;
  tipo?: SegnalazioneTipo;
  targetType?: SegnalazioneTargetType;
  negozioId?: string;
  userId?: string;
  dataDa?: string;
  dataA?: string;
  limit?: number;
  offset?: number;
  orderBy?: "created_at" | "priorita";
  orderDirection?: "asc" | "desc";
};

export type SegnalazioneStats = {
  totale: number;
  perStato: { stato: string; count: number }[];
  perPriorita: { priorita: string; count: number }[];
  perTipo: { tipo: string; count: number }[];
};

export type CreaSegnalazioneInput = {
  tipo: SegnalazioneTipo;
  titolo: string;
  descrizione: string;
  target_type?: SegnalazioneTargetType | null;
  target_id?: string | null;
  target_name?: string | null;
  negozio_id?: string | null;
};

export const TIPO_LABELS: Record<SegnalazioneTipo, string> = {
  negozio: "Negozio",
  prodotto: "Prodotto",
  offerta: "Offerta",
  evento: "Evento",
  contenuto: "Contenuto",
  comportamento: "Comportamento",
  tecnico: "Tecnico",
  altro: "Altro",
};

export const STATO_LABELS: Record<SegnalazioneStato, string> = {
  nuova: "Nuova",
  presa_in_carico: "In carico",
  risolta: "Risolta",
  archiviata: "Archiviata",
};

export const PRIORITA_LABELS: Record<SegnalazionePriorita, string> = {
  bassa: "Bassa",
  normale: "Normale",
  alta: "Alta",
  urgente: "Urgente",
};

export const TARGET_TYPE_LABELS: Record<SegnalazioneTargetType, string> = {
  negozio: "Negozio",
  prodotto: "Prodotto",
  offerta: "Offerta",
  evento: "Evento",
  utente: "Utente",
  altro: "Altro",
};

export const PRIORITA_ORDINE: Record<SegnalazionePriorita, number> = {
  urgente: 4,
  alta: 3,
  normale: 2,
  bassa: 1,
};
