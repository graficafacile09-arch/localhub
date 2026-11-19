import type { SchemaQualita } from "./fonti";

/**
 * RadiciScan — tipi condivisi dal nucleo applicativo.
 *
 * Principio: il riconoscimento AI è un'ipotesi; la verifica è documentale.
 * Il livello `verificato` esiste solo se `verifica.esito` è `confermata` su
 * una fonte ufficiale attiva e completa.
 */

export const LIVELLI = [
  "verificato",
  "coerente_non_verificato",
  "non_verificato",
  "incongruenza_possibile",
] as const;

export type Livello = (typeof LIVELLI)[number];

/** Etichette per l'interfaccia: mai sinonimi di "autentico". */
export const ETICHETTE_LIVELLO: Record<Livello, string> = {
  verificato: "Denominazione confermata da una fonte ufficiale registrata",
  coerente_non_verificato: "Riscontro parziale: documenti pertinenti, prodotto non confermato",
  non_verificato: "Riconoscimento non confermato",
  incongruenza_possibile: "Possibile incongruenza da controllare",
};

/**
 * Avvertenza fissa: accompagna ogni esito, anche quello verificato.
 * Una fotografia non è una certificazione.
 */
export const AVVERTENZA_BASE =
  "RadiciScan non certifica l'autenticità di un prodotto. Il riconoscimento " +
  "dall'immagine è un'indicazione probabile: solo la corrispondenza " +
  "documentale con una fonte ufficiale registrata produce il livello " +
  "verificato, che riguarda la denominazione e non il singolo esemplare.";

/** MIME accettati: nessuna immagine viene conservata. */
export const MIME_AMMESSI = ["image/jpeg", "image/png", "image/webp"] as const;

export type MimeAmmesso = (typeof MIME_AMMESSI)[number];

/** Riconoscimento prodotto dal modello, già validato dallo schema. */
export interface RiconoscimentoAi {
  prodotto: string;
  categoria: string | null;
  denominazioneProposta: string | null;
  territorioProposto: string | null;
  schemaProposto: SchemaQualita | null;
  indicatoriEtichetta: string[];
  /** 0-100, onestà dichiarata dal modello. */
  confidenza: number;
  note: string | null;
  /** Sempre formulate come possibilità, mai come accuse. */
  incongruenzeRilevate: string[];
}

/**
 * Prove documentali recuperate da una fonte ufficiale esterna.
 *
 * La distinzione è strutturale: un risultato di ricerca non può essere
 * presentato come fonte ufficiale, e una fonte informativa non può sostenere
 * il livello `verificato`.
 */
export type TipoProva = "ufficiale" | "informativa" | "risultato_ricerca";

export type StatoProva =
  | "registrata"
  | "pubblicata"
  | "in_domanda"
  | "rimossa"
  | "sconosciuto";

export interface ProvaDocumentale {
  /** Identificativo stabile della prova (es. `eambrosia:EUGI...`). */
  id: string;
  tipo: TipoProva;
  denominazione: string;
  schemaQualita: SchemaQualita | null;
  ente: string;
  titolo: string;
  url: string;
  riferimentoNormativo: string | null;
  riferimentoUrl: string | null;
  documentoUrl: string | null;
  estratto: string | null;
  consultataIl: string;
  relazione: string;
  stato: StatoProva;
}

export type StatoRicercaDocumentale =
  | "ok"
  | "non_disponibile"
  | "non_eseguita";

export interface EsitoRicercaDocumentale {
  stato: StatoRicercaDocumentale;
  fonte: "eAmbrosia" | null;
  consultataIl: string | null;
  query: string[];
  prove: ProvaDocumentale[];
  messaggio: string | null;
}

export interface RichiestaRicercaDocumentale {
  riconoscimento: RiconoscimentoAi;
  signal?: AbortSignal;
}

export interface ProviderRicercaDocumentale {
  nome: string;
  cerca(input: RichiestaRicercaDocumentale): Promise<EsitoRicercaDocumentale>;
}

/** Proiezione pubblica della fonte: solo campi del registro. */
export interface FontePubblica {
  /** UUID della riga `radiscan_fonti`: è il valore di `fonte_id`. */
  id: string;
  slug: string;
  denominazione: string;
  ente: string;
  urlUfficiale: string;
  riferimentoNormativo: string;
  consultataIl: string;
  schemaQualita: SchemaQualita | null;
  territorio: string | null;
}

export type EsitoVerifica =
  | "confermata"
  | "non_confermata"
  | "coerente_senza_denominazione"
  | "nessuna_denominazione"
  | "fonte_non_verificabile"
  | "territorio_incoerente"
  | "schema_incoerente"
  | "riscontro_parziale"
  | "ricerca_non_disponibile";

export interface VerificaDocumentale {
  esito: EsitoVerifica;
  livello: Livello;
  fonte: FontePubblica | null;
  denominazioneVerificata: string | null;
  motivazione: string;
  /** Prove recuperate, anche quando non bastano per il livello verificato. */
  prove: ProvaDocumentale[];
  /** Esito tecnico della ricerca: assenza di prove ed errore sono distinti. */
  ricerca: EsitoRicercaDocumentale;
}

/**
 * Esito pronto per la persistenza.
 *
 * `fonteId` e `denominazioneVerificata` sono campi di primo livello perché
 * la migration 20261118 li mappa 1:1 su `radiscan_analisi.fonte_id` e
 * `radiscan_analisi.denominazione_verificata`, e il vincolo
 * `radiscan_analisi_esito_fonte_coerente` confronta la colonna con
 * `esito->>'fonteId'`.
 */
export interface EsitoAnalisi {
  livello: Livello;
  riconoscimento: RiconoscimentoAi;
  fonteId: string | null;
  denominazioneVerificata: string | null;
  verifica: VerificaDocumentale;
  avvertenza: string;
  versionePrompt: string;
}

export interface IngressoAnalisi {
  /** Immagine già codificata: RadiciScan non la conserva né la rielabora. */
  immagineBase64: string;
  mimeType: string;
  /**
   * Impronta HMAC-SHA256 del contenuto binario, troncata a 16 esadecimali.
   * Non è un average hash né un hash percettivo: due immagini ricompresse
   * o ritagliate hanno impronte diverse.
   */
  improntaImmagine?: string;
}

/** Contratto del provider: implementabile da un finto nei test. */
export interface ProviderRadiciScan {
  nome: string;
  modello: string;
  genera(input: {
    prompt: string;
    immagineBase64: string;
    mimeType: MimeAmmesso;
    signal?: AbortSignal;
  }): Promise<{ testo: string }>;
}

export interface MetaAnalisi {
  provider: string;
  modello: string;
  durataMs: number;
  versionePrompt: string;
}
