/**
 * AGGREGATORE NOTIZIE — tipi condivisi.
 *
 * Tipi interni del modulo notizie: rappresentano una notizia NORMALIZZATA
 * (formato unico indipendente dalla fonte) e la configurazione delle fonti.
 *
 * Linea editoriale: agricoltura e agroalimentare calabrese. Le categorie qui
 * sotto sono usate sia per classificare i contenuti all'import sia per
 * filtrare la pagina /notizie; il tipo di contenuto distingue notizie,
 * eventi, fiere, bollettini tecnici e opportunità (bandi, contributi).
 */

/** Categorie editoriali della sezione Notizie (agricoltura calabrese). */
export type CategoriaNotizia =
  | "Agricoltura"
  | "Filiere e produzioni"
  | "Vino e viticoltura"
  | "Olio e olivicoltura"
  | "Prodotti tipici e qualità"
  | "Eventi e fiere"
  | "Politiche agricole e finanziamenti"
  | "Innovazione e ricerca"
  | "Mercati ed esportazioni"
  | "Territori e biodiversità";

export const CATEGORIE_NOTIZIE: CategoriaNotizia[] = [
  "Eventi e fiere",
  "Olio e olivicoltura",
  "Vino e viticoltura",
  "Prodotti tipici e qualità",
  "Filiere e produzioni",
  "Politiche agricole e finanziamenti",
  "Mercati ed esportazioni",
  "Innovazione e ricerca",
  "Territori e biodiversità",
  "Agricoltura",
];

/**
 * Tipologia editoriale del contenuto. Non è una copia dell'articolo: è una
 * classificazione deterministica calcolata da titolo ed estratto, usata per
 * l'etichetta discreta sulla scheda e per distinguere gli eventi futuri.
 */
export type TipoContenuto =
  | "notizia"
  | "evento"
  | "fiera"
  | "bollettino"
  | "opportunita";

/** Tipo di acquisizione: feed RSS/XML oppure parsing HTML. */
export type TipoFonte = "rss" | "html";

/**
 * Configurazione di una fonte (specchio della tabella notizie_fonti).
 * `url_feed` è la sorgente RSS/XML; `url_lista` la pagina HTML di fallback
 * (per le fonti html è la pagina da parsare).
 *
 * `scoperta` = fonte di DISCOVERY (es. Google News RSS): i risultati non
 * sono emessi dalla fonte stessa ma trovati tramite ricerca. Per queste fonti
 * valgono regole dedicate: finestra temporale, dedup intra-run e
 * attribuzione per-testata. Le fonti istituzionali hanno `scoperta=false`.
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
  /** Fonte di discovery (Google News): true solo per le fonti di ricerca. */
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
