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

/**
 * Stato di avanzamento di un ordine.
 * Workflow venditore (migrazione 20260815): NUOVO (in_preparazione) →
 * confermato → in_lavorazione → pronto → consegnato; cancellato da ogni
 * fase compatibile. I valori legacy (in_consegna) restano supportati.
 */
export type StatoOrdine =
  | "in_preparazione"
  | "confermato"
  | "in_lavorazione"
  | "pronto"
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
  /** Snapshot storico della variante acquistata (Fase E5); null per i prodotti legacy. */
  varianteNome: string | null;
};

/**
 * Evento dello storico ordine (tabella ordini_eventi, popolata dal trigger
 * di ordini su insert/cambio stato). Usato dalla cronologia sia nell'area
 * cliente sia nell'area venditore.
 */
export type EventoOrdine = {
  id: string;
  /** Valore di stato associato (es. "confermato", "cancellato"). */
  evento: string;
  /** Etichetta leggibile (es. "Ordine confermato"). */
  dettaglio: string | null;
  /** Motivo di annullamento (solo per l'evento di annullamento). */
  motivo: string | null;
  /** Nota del venditore (annullamento). */
  nota: string | null;
  createdAt: string;
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
 * Riga dell'elenco "I miei ordini" (Area Clienti): dati snapshot del DB.
 * Le righe prodotto vengono caricate in un'unica query batch dal servizio,
 * così la card può mostrare nome, foto, quantità e prezzo dei prodotti.
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
  /** Righe prodotto (per la sintesi in lista e il dettaglio). */
  righe: RigaOrdine[];
};

/**
 * Dettaglio completo di un ordine del cliente (Area Clienti).
 * Contiene i dati snapshot di spedizione/ritiro, le righe prodotto,
 * l'annullamento (se presente) e lo storico eventi.
 */
export type OrdineClienteDettaglio = OrdineClienteLista & {
  email: string | null;
  telefono: string | null;
  metodoSpedizione: "standard" | "express" | null;
  /** Corriere scelto al checkout (motore tariffario 20260831); null per gli
   *  ordini storici, che usano il fallback legacy `metodoSpedizione`. */
  spedizioneCarrier: string | null;
  /** Servizio del corriere (es. "standard", "express", "online", "locale"). */
  spedizioneServizio: string | null;
  metodoPagamento: "carta" | "paypal" | "bonifico" | null;
  /** Marcatore autoritativo del provider (es. 'klarna' per gli ordini
   *  pagati via gateway Klarna: metodo_pagamento resta 'carta', come nel
   *  flusso carrello F2.2). */
  paymentProvider: string | null;
  spedizioneIndirizzo: string | null;
  spedizioneCap: string | null;
  spedizioneCitta: string | null;
  spedizioneProvincia: string | null;
  spedizioneNote: string | null;
  note: string | null;
  /** Motivo dell'annullamento (solo se stato = cancellato). */
  annullatoMotivo: string | null;
  /** Nota del negoziante relativa all'annullamento. */
  annullatoNota: string | null;
  /** Data/ora dell'annullamento. */
  annullatoAt: string | null;
  righe: RigaOrdine[];
  /** Storico eventi dell'ordine (dal più vecchio al più recente). */
  eventi: EventoOrdine[];
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
