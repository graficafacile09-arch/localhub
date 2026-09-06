/**
 * AGGREGATORE NOTIZIE CV — tipi condivisi.
 *
 * Tipi interni del modulo notizie: rappresentano una notizia NORMALIZZATA
 * (formato unico indipendente dalla fonte) e la configurazione delle fonti.
 */

/** Categorie V1 — semplici, coerenti ed estendibili. */
export type CategoriaNotizia =
  | "Comune"
  | "Territorio"
  | "Cultura"
  | "Ambiente"
  | "Protezione civile"
  | "Istituzioni";

export const CATEGORIE_NOTIZIE: CategoriaNotizia[] = [
  "Comune",
  "Territorio",
  "Cultura",
  "Ambiente",
  "Protezione civile",
  "Istituzioni",
];

/** Tipo di acquisizione: feed RSS/XML oppure parsing HTML. */
export type TipoFonte = "rss" | "html";

/**
 * Configurazione di una fonte (specchio della tabella notizie_fonti).
 * `url_feed` è la sorgente RSS/XML; `url_lista` la pagina HTML di fallback
 * (per le fonti html è la pagina da parsare).
 *
 * `scoperta` = fonte di DISCOVERY (V2, es. Google News RSS): i risultati non
 * sono emessi dalla fonte stessa ma trovati tramite ricerca. Per queste fonti
 * valgono regole dedicate: finestra temporale, dedup intra-run e
 * attribuzione per-testata. Le fonti istituzionali V1 hanno `scoperta=false`.
 */
export interface FonteNotizie {
  id: string;
  nome: string;
  tipo: TipoFonte;
  urlFeed: string | null;
  urlLista: string | null;
  urlBase: string;
  categoriaDefault: CategoriaNotizia;
  attiva: boolean;
  frequenzaMinuti: number;
  /** Fonte di discovery (Google News): true solo per le nuove fonti V2. */
  scoperta: boolean;
  /** Ultima esecuzione del job (da notizie_fonti.ultima_esecuzione). */
  ultimaEsecuzione?: string | null;
}

/**
 * Notizia normalizzata — formato unico interno (prima dell'inserimento).
 * Contiene SOLO metadati/titolo + excerpt breve: mai il corpo integrale.
 *
 * Chiavi di dedup (P1): oltre al `dedupHash` storico (titolo), ogni notizia
 * porta `urlHash`, `extHash` e `titoloFonteHash` (vedi lib/notizie/dedup.ts),
 * ciascuna protetta da un vincolo UNIQUE nel database.
 */
export interface NotiziaNormalizzata {
  fonteId: string;
  sourceName: string;
  title: string;
  excerpt: string | null;
  originalUrl: string;
  externalId: string | null;
  publishedAt: string | null;
  category: CategoriaNotizia;
  imageUrl: string | null;
  dedupHash: string;
  /** SHA-256 della URL canonica normalizzata (dedup per URL). */
  urlHash: string;
  /** SHA-256 di "source_name | external_id"; null se l'external_id manca. */
  extHash: string | null;
  /** SHA-256 di "source_name | titolo normalizzato" (fallback deterministico). */
  titoloFonteHash: string;
}

/** Riga di notizie_fonti come letta dal DB dal job. */
export interface FonteDb {
  id: string;
  nome: string;
  tipo: TipoFonte;
  url_feed: string | null;
  url_lista: string | null;
  url_base: string;
  categoria_default: CategoriaNotizia;
  attiva: boolean;
  frequenza_minuti: number;
  /** Specchia la colonna notizie_fonti.scoperta (V2, discovery). */
  scoperta: boolean;
  ultima_esecuzione: string | null;
}

/** Riepilogo di un'esecuzione del job di import. */
export interface RiepilogoImport {
  imported: number;
  skipped: number;
  /** Notizie riconosciute come già presenti (dedup): NON inserite. */
  duplicati: number;
  errors: number;
  /** Dettaglio per fonte (nome → conteggi). */
  perFonte: Record<
    string,
    {
      imported: number;
      skipped: number;
      duplicati?: number;
      errors?: number;
      error?: string;
    }
  >;
  /** Elenco dei titoli importati (utile per debug/dry-run). */
  dettagli?: string[];
}