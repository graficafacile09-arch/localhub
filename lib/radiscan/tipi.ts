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
  /**
   * Campi facoltativi letti in etichetta. Sono ipotesi del modello: l'OCR
   * li conferma o li smentisce e la discrepanza resta visibile all'utente.
   */
  produttore?: string | null;
  stabilimento?: string | null;
  indirizzo?: string | null;
  lotto?: string | null;
  codiceBarre?: string | null;
  ingredienti?: string[];
  certificazioni?: string[];
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

/** Allegato documentale pubblicato nella scheda eAmbrosia. */
export interface AllegatoEAmbrosia {
  /** Identificativo usato dall'endpoint `/api/v1/attachments/{id}`. */
  id: string;
  /** Nome del file dichiarato dal registro (es. `IT_0117_0003_SUM_IT_O.pdf`). */
  titolo: string;
  url: string;
  /** `disciplinare` = singleDocument, `riepilogo` = summarySheets. */
  tipo: "disciplinare" | "riepilogo";
}

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
  /** Allegati PDF realmente indicati dalla scheda, con URL ufficiale. */
  allegati: AllegatoEAmbrosia[];
  /** Gruppo di produttori riconosciuto trascritto dalla scheda, se presente. */
  gruppoProduttori: string | null;
  /** Sede dichiarata dal gruppo riconosciuto, se presente. */
  sedeGruppo: string | null;
}

// ─── Lettura documentale ───────────────────────────────────────────────────

/**
 * Stato di un singolo allegato. `parziale` significa che il PDF è leggibile
 * ma non è stato letto per intero (limite di pagine o tempo).
 */
export type StatoDocumento =
  | "letto"
  | "parziale"
  | "non_estraibile"
  | "non_disponibile";

export interface SezioneDocumento {
  pagina: number;
  testo: string;
}

export interface DocumentoLetto {
  id: string;
  titolo: string;
  url: string;
  tipo: AllegatoEAmbrosia["tipo"];
  stato: StatoDocumento;
  /**
   * `pagine`: testi associati agli oggetti pagina del PDF.
   * `ordine_flussi`: associazione non disponibile, i testi sono sezioni.
   */
  associazionePagine: "pagine" | "ordine_flussi";
  /** Pagine dichiarate dal PDF, se riconoscibili. */
  pagineTotali: number | null;
  pagineLette: number;
  pagineNonLette: number;
  motivo: string | null;
  sezioni: SezioneDocumento[];
  troncato: boolean;
}

/**
 * Completezza complessiva della lettura. Nessun valore implica che il singolo
 * prodotto fotografato sia certificato: la lettura riguarda la denominazione.
 */
export type StatoLetturaDocumentale =
  | "completa"
  | "parziale"
  | "non_disponibile"
  | "non_tentata";

export interface LetturaDocumentale {
  stato: StatoLetturaDocumentale;
  documenti: DocumentoLetto[];
  pagineLette: number;
  pagineTotali: number | null;
  consultataIl: string;
  messaggio: string;
  /**
   * Le pagine sono associate agli oggetti pagina quando il PDF lo consente;
   * in caso contrario i testi sono sezioni e non vengono chiamati pagine.
   */
  notaPagine: string | null;
}

// ─── Provenienza, territorio e filiera ─────────────────────────────────────

/**
 * `documentato`: esiste un documento ufficiale letto che lo afferma.
 * `non_documentato`: i documenti consultati non lo affermano.
 * `non_verificabile`: manca la prova documentale di base.
 */
export type StatoProvenienza =
  | "documentato"
  | "non_documentato"
  | "non_verificabile";

export interface EvidenzaProvenienza {
  fonte: string;
  url: string | null;
  pagina: number | null;
  estratto: string;
}

/**
 * Valutazione separata di ciò che la fotografia può e non può dimostrare.
 *
 * Le tre voci non sono intercambiabili: un prodotto fabbricato in Calabria non
 * è un prodotto DOP, e l'iscrizione di un consorzio non certifica la singola
 * confezione.
 */
export interface ValutazioneProvenienza {
  confezione: {
    stato: "non_verificabile";
    messaggio: string;
  };
  territorio: {
    stato: StatoProvenienza;
    evidenze: EvidenzaProvenienza[];
    motivo: string;
  };
  filiera: {
    stato: StatoProvenienza;
    ente: string | null;
    evidenze: EvidenzaProvenienza[];
    motivo: string;
  };
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
  /** Lettura degli allegati della prova principale, con completezza dichiarata. */
  lettura: LetturaDocumentale | null;
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
  /** Territorio, filiera e confezione, tenuti separati dalla denominazione. */
  provenienza: ValutazioneProvenienza;
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
  /** Lettura OCR, separata dalle ipotesi del modello visivo. */
  ocr?: OcrRisultato | null;
  /** Campi strutturati con provenienza esplicita. */
  etichetta?: EtichettaEstratta | null;
  /** Divergenze OCR/modello, mai risolte d'ufficio. */
  discrepanze?: Discrepanza[];
  /** Ricerca web multifonte, distinta dal registro ufficiale. */
  web?: RicercaWeb | null;
  /** Scheda di banca dati prodotti, se è stato letto un codice a barre. */
  barcode?: SchedaProdottoBarcode | null;
  /** Controlli separati su produttore, stabilimento e filiera. */
  produttore?: VerificaProduttore | null;
  /** Tempi misurati per fase. */
  tempi?: TempiAnalisi | null;
}

// ─── OCR, etichetta e controllo incrociato ────────────────────────────────

/**
 * Esito OCR separato dalle ipotesi del modello visivo.
 *
 * `stato: non_disponibile` significa che il motore OCR non ha potuto
 * leggere: non equivale a "etichetta illeggibile" né a "nessun dato".
 */
export interface OcrRisultato {
  stato: "ok" | "non_disponibile" | "non_eseguito";
  testo: string;
  /** Confidenza media dichiarata dal motore, 0-100. */
  confidenza: number;
  paroleLette: number;
  caratteri: number;
  lingue: string[];
  durataMs: number;
  motivo: string | null;
  avvisi: string[];
}

/** Valore di un campo con la sua provenienza esplicita. */
export interface CampoEtichetta {
  valore: string | null;
  fonte: "ocr" | "ai" | "ocr_e_ai" | null;
}

/** Estrazione strutturata: nessun campo viene inventato se non è leggibile. */
export interface EtichettaEstratta {
  nomeCommerciale: CampoEtichetta;
  denominazioneLegale: CampoEtichetta;
  produttore: CampoEtichetta;
  stabilimento: CampoEtichetta;
  indirizzo: CampoEtichetta;
  lotto: CampoEtichetta;
  codiceBarre: CampoEtichetta;
  ingredienti: string[];
  certificazioni: string[];
  territorioDichiarato: string[];
  /** Livello di leggibilità dichiarato dal motore OCR. */
  leggibilita: "buona" | "parziale" | "scarsa" | "sconosciuta";
}

/**
 * Divergenza fra OCR e modello visivo. Non viene risolta scegliendo un
 * vincitore: entrambi i valori sono conservati e la discrepanza è mostrata.
 */
export interface Discrepanza {
  campo: string;
  ocr: string | null;
  ai: string | null;
  gravita: "bassa" | "media";
  messaggio: string;
}

// ─── Ricerca web e banche dati prodotto ───────────────────────────────────

export type NaturaFonteWeb =
  | "ufficiale_eu"
  | "ufficiale_it"
  | "regionale"
  | "consorzio"
  | "certificazione"
  | "produttore"
  | "database_prodotti"
  | "informativo"
  | "commerciale";

export type AttendibilitaFonte = "alta" | "media" | "bassa";

/**
 * Chi parla nella pagina: il produttore stesso, un ente indipendente o una
 * fonte informativa/commerciale. Serve a non trattare una dichiarazione
 * aziendale come una verifica indipendente.
 */
export type DichiarazioneFonte =
  | "aziendale"
  | "indipendente"
  | "informativa"
  | "non_determinata";

/** Fonte web con metadati minimi verificabili. Nessun URL è costruito a mano. */
export interface FonteWeb {
  id: string;
  titolo: string;
  ente: string;
  url: string;
  dominio: string;
  natura: NaturaFonteWeb;
  attendibilita: AttendibilitaFonte;
  consultataIl: string;
  dataDocumento: string | null;
  estratto: string | null;
  riferimentoNormativo: string | null;
  pagineLette: number | null;
  lettoIntegralmente: boolean;
  /** Come è stato recuperato il contenuto: HTTP diretto o Tavily Extract. */
  metodoLettura?: "http" | "tavily_extract";
  relazione: string;
  /** Dichiarazione aziendale ≠ verifica indipendente. */
  dichiarazione?: DichiarazioneFonte;
  /** Pertinenza rispetto a denominazione, prodotto e produttore letti. */
  rilevanza?: "alta" | "media" | "bassa";
}

/** Esito separato per ciascuna delle cinque verifiche richieste. */
export interface SintesiVerificaWeb {
  stato:
    | "registrata"
    | "menzionata"
    | "dichiarata"
    | "supportata"
    | "non_confermata"
    | "non_verificabile";
  testo: string;
  fonti: string[];
}

export interface SintesiFontiWeb {
  /** A. Denominazione DOP/IGP registrata. */
  denominazione: SintesiVerificaWeb;
  /** B. Produttore collegato alla denominazione. */
  produttore: SintesiVerificaWeb;
  /** C. Marchio commerciale. */
  marchio: SintesiVerificaWeb;
  /** D. Prodotto specifico. */
  prodotto: SintesiVerificaWeb;
  /** E. Legame del prodotto con produzione e filiera calabrese, anche non DOP/IGP. */
  filieraCalabrese: SintesiVerificaWeb;
  /** F. Autenticità della singola confezione e del lotto. */
  confezione: { stato: "non_verificabile"; testo: string };
}

export interface ConsumoTavily {
  provider: "tavily";
  query: number;
  cache: number;
  creditiRicerca: number;
  creditiEstrazione: number;
  creditiTotali: number;
  pagineEstratte: number;
}

export interface RicercaWeb {
  stato: "ok" | "non_disponibile" | "non_eseguita";
  consultataIl: string | null;
  query: string[];
  fonti: FonteWeb[];
  messaggio: string | null;
  durataMs: number;
  /** Motore effettivamente usato: Tavily, Google grounding o fallback keyless. */
  motore?: string;
  /** Consumo dichiarato dal provider, quando disponibile. */
  consumi?: ConsumoTavily | null;
  /** Sintesi A-E calcolata sulle fonti realmente lette. */
  sintesi?: SintesiFontiWeb | null;
}

/** Scheda di una banca dati prodotti, distinta da una certificazione. */
export interface SchedaProdottoBarcode {
  codice: string;
  trovato: boolean;
  nome: string | null;
  marchio: string | null;
  etichette: string[];
  luoghiProduzione: string[];
  categorie: string[];
  url: string;
  fonte: "OpenFoodFacts";
  attendibilita: "media";
  consultataIl: string;
  messaggio: string;
}

// ─── Verifica del produttore e tempi ──────────────────────────────────────

export type StatoControllo =
  | "documentato"
  | "non_documentato"
  | "non_verificabile"
  | "incoerente";

export interface ControlloProduttore {
  id: string;
  etichetta: string;
  stato: StatoControllo;
  dettaglio: string;
  evidenze: EvidenzaProvenienza[];
}

export interface VerificaProduttore {
  controlli: ControlloProduttore[];
  sintesi: string;
}

/** Tempi reali misurati, non stime. */
export interface TempiAnalisi {
  /** Ridimensionamento/ricodifica prima della chiamata visiva. */
  preprocessamentoMs?: number;
  /** Solo la chiamata al modello visivo, senza preprocessing. */
  identificazioneMs: number;
  ocrMs: number;
  documentiMs: number;
  webMs: number;
  totaleMs: number;
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
  /** Codice a barre letto dal client o dall'OCR, se disponibile. */
  codiceBarre?: string | null;
}

/** Contratto del provider: implementabile da un finto nei test. */
export interface ProviderRadiciScan {
  nome: string;
  modello: string;
  genera(input: {
    prompt: string;
    immagineBase64: string;
    mimeType: MimeAmmesso;
    /** Ritaglio ingrandito dell'etichetta, quando generabile. */
    immagineDettaglioBase64?: string;
    signal?: AbortSignal;
  }): Promise<{ testo: string; modello?: string }>;
}

export interface MetaAnalisi {
  provider: string;
  modello: string;
  durataMs: number;
  versionePrompt: string;
  fasi?: TempiAnalisi;
}
