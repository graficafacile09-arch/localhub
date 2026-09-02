// Ruoli merchant — attualmente tutti i negozi hanno ruolo "owner".
// In futuro, se serviranno collaboratori/manager, si reintrodurrà
// una tabella dedicata e questi ruoli verranno utilizzati.
export type MerchantRole = "owner" | "manager";

export type MerchantStoreSummary = {
  id: string;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  attivo: boolean;
  // Per ora sempre "owner". In futuro verrà dalla membership.
  role: MerchantRole;
};

/**
 * Configurazione del PACCO di spedizione del negozio (V1: un pacco per
 * ordine/negozio). Peso in grammi, dimensioni in centimetri. Tutti i campi
 * possono essere null = "pacco non configurato".
 */
export type ConfigPaccoSpedizione = {
  paccoPesoGrammi: number | null;
  paccoLunghezzaCm: number | null;
  paccoLarghezzaCm: number | null;
  paccoAltezzaCm: number | null;
  paccoPesoMaxGrammi: number | null;
};

/**
 * Servizio di spedizione (carrier+servizio) attivabile dal negozio per il
 * proprio checkout (tabella negozio_metodi_spedizione, fail-closed).
 */
export type MetodoSpedizioneNegozioInput = {
  carrier: string;
  servizio: string;
  attivo: boolean;
  /** True se il metodo è offerto a costo zero al cliente. */
  spedizione_gratuita: boolean;
  ordine_mostra: number;
};

export type MerchantProduct = {
  id: string;
  negozio_id: string;
  nome: string;
  descrizione: string | null;
  descrizione_completa: string | null;
  categoria: string | null;
  sottocategoria: string | null;
  marca: string | null;
  colore: string | null;
  materiale: string | null;
  caratteristiche: string[] | null;
  peso_volume: string | null;
  /** Peso reale del prodotto in GRAMMI (motore tariffario spedizioni). */
  peso_grammi: number | null;
  /** Tariffa CORRIERE LOCALE per questo prodotto (unica tariffa del venditore). */
  costo_spedizione_locale: number | null;
  parole_chiave: string[] | null;
  filtri_catalogo: Record<string, string> | null;
  prezzo: number | null;
  prezzo_suggerito: number | null;
  immagine_principale: string | null;
  quantita_disponibile: number | null;
  quantita_riservata: number | null;
  /** True se il prodotto usa varianti (Fase E1/E2). */
  ha_varianti: boolean;
  stato_condizione: "nuovo" | "usato" | "ricondizionato" | null;
  seo_title: string | null;
  seo_description: string | null;
  alt_text_immagine: string | null;
  attivo: boolean;
  origine_pubblicazione: string | null;
  /** True se il prodotto appare anche nella vetrina "Prodotti tipici" (homepage). */
  prodotto_tipico: boolean;
  /** True se il prodotto è in offerta (vetrina "Offerte", badge rosso). */
  prodotto_offerta: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type MerchantProductInput = {
  nome: string;
  descrizione: string;
  descrizioneCompleta?: string;
  categoria: string;
  sottocategoria?: string | null;
  marca?: string;
  colore?: string;
  materiale?: string;
  caratteristiche?: string[];
  pesoVolume?: string;
  /** Peso reale in GRAMMI (null = non configurato → Poste/BRT non disponibili). */
  pesoGrammi?: number | null;
  /** Tariffa corriere locale per prodotto (null = corriere locale non disponibile). */
  costoSpedizioneLocale?: number | null;
  paroleChiave?: string[] | null;
  filtriCatalogo?: Record<string, string>;
  prezzo: number;
  prezzoSuggerito?: number | null;
  quantitaDisponibile: number | null;
  statoCondizione?: "nuovo" | "usato" | "ricondizionato" | null;
  immaginePrincipale: string;
  seoTitle?: string;
  seoDescription?: string;
  altTextImmagine?: string;
  attivo: boolean;
  originePubblicazione?: string;
  /** True se il prodotto appare anche nella vetrina "Prodotti tipici" (homepage). */
  prodottoTipico?: boolean;
  /** True se il prodotto è in offerta (vetrina "Offerte", badge rosso). */
  prodottoOfferta?: boolean;
};

export type MerchantQueryResult<T> = {
  data: T;
  setupRequired: boolean;
  errorMessage: string | null;
  /** Numero totale di righe (senza paginazione), quando la query lo richiede. */
  total?: number;
  /** Codice di errore applicativo (es. UNIQUE_CONFLICT, PRODUCT_NOT_FOUND). */
  code?: string;
};

// ─── Varianti prodotto (Fase E2) ───────────────────────────────────────────

/** Attributi della combinazione (es. { taglia: "M", colore: "Blu" }). */
export type AttributiVariante = Record<string, string>;

export type VarianteProdotto = {
  id: string;
  prodotto_id: string;
  nome: string | null;
  attributi: AttributiVariante;
  /** NULL → eredita il prezzo del prodotto padre. */
  prezzo: number | null;
  quantita_disponibile: number;
  /** Riserva gestita dal sistema (flusso pagamenti): NON modificabile dal merchant. */
  quantita_riservata: number;
  immagine_principale: string | null;
  attivo: boolean;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Input di una variante (lato merchant).
 * NOTA: quantita_riservata NON è accettato: la riserva è gestita dal
 * sistema e non è modificabile dal venditore.
 */
export type VarianteProdottoInput = {
  nome?: string | null;
  attributi?: AttributiVariante;
  prezzo?: number | null;
  quantitaDisponibile?: number;
  immaginePrincipale?: string | null;
  attivo?: boolean;
};

// ─── Ricerca/filtri/ordinamento/paginazione catalogo prodotti ───────────────

export type OrdinamentoProdotti =
  | "recenti"
  | "vecchi"
  | "prezzo_asc"
  | "prezzo_desc"
  | "nome_asc"
  | "nome_desc";

export interface ProductQueryOptions {
  /** Ricerca testuale (nome, descrizione, categoria, sottocategoria, marca). */
  q?: string;
  /** Filtro stato pubblicazione: "attivo" (pubblicato) o "bozza" (non attivo). */
  stato?: "attivo" | "bozza";
  /** Filtro prodotti arricchiti dall'AI (origine_pubblicazione = "ai"). */
  ai?: boolean;
  /** Filtro prodotti per appartenenza alla vetrina "Prodotti tipici". */
  tipico?: boolean;
  /** Filtro prodotti per appartenenza alla vetrina "Offerte". */
  offerta?: boolean;
  /** Filtro prodotti ESCLUSIVAMENTE esauriti (disponibilità reale <= 0). */
  esaurito?: boolean;
  /** Ordinamento. Default: "recenti" (created_at desc). */
  ordina?: OrdinamentoProdotti;
  /** Pagina (1-based). Richiede perPagina per attivare la paginazione. */
  pagina?: number;
  /** Elementi per pagina. */
  perPagina?: number;
}
