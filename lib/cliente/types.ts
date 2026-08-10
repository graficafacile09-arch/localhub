/**
 * Tipi dell'Area Clienti.
 * Fase 1 — architettura: i tipi definiscono i contratti dati che i servizi
 * di lib/cliente restituiranno nelle fasi successive.
 */

/** Profilo personale dell'utente cliente. */
export type ClienteProfilo = {
  id: string;
  nome: string;
  cognome: string;
  /** Email dell'account (sola lettura, proviene da auth.users). */
  email: string;
  avatarUrl: string | null;
  telefono: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Dati modificabili del profilo inviati dal form. */
export type ClienteProfiloInput = {
  nome: string;
  cognome: string;
  telefono: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
};

/** Stato di avanzamento di un ordine. */
export type StatoOrdine =
  | "in_preparazione"
  | "in_consegna"
  | "consegnato"
  | "cancellato";

/** Riga di un ordine (singolo prodotto). */
export type RigaOrdine = {
  prodottoId: string;
  nomeProdotto: string;
  prezzoUnitario: number;
  quantita: number;
  immagineUrl: string | null;
};

/** Ordine effettuato dal cliente. */
export type ClienteOrdine = {
  id: string;
  numero: string;
  stato: StatoOrdine;
  totale: number;
  createdAt: string;
  righe: RigaOrdine[];
};

/**
 * Riga dell'elenco "I miei ordini" (Area Clienti): dati snapshot del DB,
 * nessuna join. Tutti i campi provengono dalla tabella ordini.
 */
export type OrdineClienteLista = {
  id: string;
  numero: string;
  stato: StatoOrdine;
  totale: number;
  costoSpedizione: number;
  createdAt: string;
  modalita: "ritiro" | "spedizione";
  negozioNome: string;
  ritiroData: string | null;
  ritiroFascia: string | null;
};

/**
 * Dettaglio completo di un ordine del cliente (Area Clienti).
 * Contiene i dati snapshot di spedizione/ritiro e le righe prodotto.
 */
export type OrdineClienteDettaglio = OrdineClienteLista & {
  email: string | null;
  telefono: string | null;
  metodoSpedizione: "standard" | "express" | null;
  metodoPagamento: "carta" | "paypal" | "bonifico" | null;
  spedizioneIndirizzo: string | null;
  spedizioneCap: string | null;
  spedizioneCitta: string | null;
  spedizioneProvincia: string | null;
  spedizioneNote: string | null;
  note: string | null;
  righe: RigaOrdine[];
};

/** Tipologia di un elemento salvato tra i preferiti. */
export type TipoPreferito = "negozio" | "prodotto";

/** Preferito: negozio o prodotto salvato dal cliente. */
export type ClientePreferito = {
  id: string;
  tipo: TipoPreferito;
  /** id reale della fonte (negozi.id uuid oppure prodotti.id bigint, come testo). */
  riferimentoId: string;
  /** slug pubblico del negozio/prodotto (URL /negozio/<slug> o /prodotto/<slug>). */
  slug: string;
  nome: string;
  immagineUrl: string | null;
  /** categoria della fonte: utile per filtri, notifiche e offerte personalizzate. */
  categoria: string | null;
  createdAt: string;
};

/** Input per aggiungere un preferito (riferimento alla fonte reale). */
export type ClientePreferitoInput = {
  tipo: TipoPreferito;
  riferimentoId: string;
};

/**
 * Filtri della lista preferiti: tipologia, ricerca, ordinamento e
 * paginazione. Predisposti per le evoluzioni future (offerte personalizzate,
 * notifiche e raccomandazioni AI).
 */
export type PreferitiFiltri = {
  /** "tutti" oppure una tipologia specifica. */
  tipo?: TipoPreferito | "tutti";
  /** Ricerca testuale sul nome del preferito. */
  q?: string;
  /** Ordinamento: più recenti (default) oppure nome A-Z. */
  ordine?: "recenti" | "nome";
  limite?: number;
  offset?: number;
};

/** Preferenze e impostazioni dell'account cliente. */
export type ClienteImpostazioni = {
  email: string;
  notificheEmail: boolean;
  lingua: string;
  zonaOraria: string;
};
