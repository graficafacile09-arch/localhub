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
  parole_chiave: string[] | null;
  filtri_catalogo: Record<string, string> | null;
  prezzo: number | null;
  prezzo_suggerito: number | null;
  immagine_principale: string | null;
  quantita_disponibile: number | null;
  stato_condizione: "nuovo" | "usato" | "ricondizionato" | null;
  seo_title: string | null;
  seo_description: string | null;
  alt_text_immagine: string | null;
  attivo: boolean;
  origine_pubblicazione: string | null;
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
};

export type MerchantQueryResult<T> = {
  data: T;
  setupRequired: boolean;
  errorMessage: string | null;
  /** Numero totale di righe (senza paginazione), quando la query lo richiede. */
  total?: number;
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
  /** Ordinamento. Default: "recenti" (created_at desc). */
  ordina?: OrdinamentoProdotti;
  /** Pagina (1-based). Richiede perPagina per attivare la paginazione. */
  pagina?: number;
  /** Elementi per pagina. */
  perPagina?: number;
}
