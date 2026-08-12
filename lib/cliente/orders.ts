import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { inviaNotificaNuovoOrdine } from "@/lib/notifiche/whatsapp";
import { inviaNotificaNuovoOrdineNtfy } from "@/lib/notifiche/ntfy";
import { inviaEmailConfermaOrdine } from "./ordine-email";
import { richiediVariantePerProdotto } from "@/lib/varianti-pubbliche";
import type { PaymentStatus } from "@/lib/pagamenti/types";
import type {
  ClienteOrdine,
  RigaOrdine,
  StatoOrdine,
} from "./types";

/**
 * Servizio Ordini dell'Area Clienti.
 * Fase completa — creazione ordine realmente persistita.
 *
 * - creaOrdine: valida l'input lato server e delega la creazione (ordine +
 *   righe + decremento atomico dello stock) alla funzione PostgreSQL
 *   `public.crea_ordine(p_payload jsonb)` (migrazione 20260813):
 *     - TUTTO in una transazione con lock della riga prodotto
 *       (SELECT ... FOR UPDATE): due richieste simultanee non possono
 *       vendere più pezzi di quelli disponibili;
 *     - quantità richiesta > disponibilità → SCORTE_INSUFFICIENTI (409),
 *       stock invariato;
 *     - quantità_disponibile non può mai diventare negativa (UPDATE
 *       guardato + CHECK constraint);
 *     - errore durante la creazione → rollback totale: nessun decremento
 *       "orfano" senza ordine;
 *     - idempotenza via idempotency_key UNIQUE: un retry con la stessa
 *       chiave NON crea un nuovo ordine né decrementa di nuovo lo stock.
 *   Il prezzo e i totali sono calcolati DAL DATABASE (mai dal client).
 */

/** Dati di un cliente che effettua un ordine (checkout pubblico). */
export type ClienteCheckout = {
  nome: string;
  cognome: string;
  telefono?: string | null;
  email?: string | null;
};

/** Input per la creazione di un ordine. */
export type CreaOrdineInput = {
  /** Chiave di idempotenza generata dal client (anti doppio invio). */
  idempotencyKey: string;
  /** id del prodotto (bigint, come stringa). */
  prodottoId: string;
  /**
   * Variante selezionata (FASE E4): solo TRASPORTATA fino all'ordine.
   * Validazione server-side: deve esistere, appartenere al prodotto ed
   * essere attiva; obbligatoria per i prodotti con varianti. Prezzo/stock
   * della variante NON vengono ancora usati (sarà E5 con la RPC).
   */
  varianteId?: string | null;
  quantita: number;
  /** modalità di consegna */
  modalita: "ritiro" | "spedizione";
  cliente: ClienteCheckout;
  /** Solo modalita='ritiro' */
  ritiro?: { data?: string | null; fascia?: string | null } | null;
  /** Solo modalita='spedizione' */
  spedizione?: {
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    note?: string | null;
    metodoSpedizione: "standard" | "express";
    metodoPagamento: "carta" | "paypal" | "bonifico" | "klarna";
  } | null;
  note?: string | null;
  /** IP del richiedente (rate limiting per IP, salvato su ordini.cliente_ip). */
  clienteIp?: string | null;
  /**
   * UUID del cliente AUTENTICATO, risolto SERVER-SIDE dalla sessione
   * Supabase (lib/auth/session.ts). Mai accettato dal browser: se assente
   * o null l'ordine nasce guest (cliente_user_id = NULL).
   */
  clienteUserId?: string | null;
};

/** Esito della creazione ordine. */
export type EsitoCreaOrdine =
  | { ok: true; ordine: ClienteOrdine; giaEsistente: boolean }
  | { ok: false; errore: string; codice: string; status: number };

export type OrdinePersistito = {
  id: string;
  numero: string;
  stato: StatoOrdine;
  totale: number;
  createdAt: string;
  modalita: "ritiro" | "spedizione";
  negozioId: string;
  negozioNome: string;
  /** Solo modalita='ritiro' */
  ritiroData: string | null;
  ritiroFascia: string | null;
  /** Motivo dell'annullamento (solo se stato = cancellato). */
  annullatoMotivo: string | null;
  /** Nota del negoziante relativa all'annullamento. */
  annullatoNota: string | null;
  /** Data/ora dell'annullamento. */
  annullatoAt: string | null;
  /** Metodo di pagamento selezionato al checkout (solo spedizione). */
  metodoPagamento: "carta" | "paypal" | "bonifico" | "klarna" | null;
  /** Stato del pagamento (FASE F1): null per gli ordini legacy senza pagamento. */
  paymentStatus: PaymentStatus | null;
  paymentProvider: string | null;
  paymentPaidAt: string | null;
  paymentExpiresAt: string | null;
  paymentRefundedAt: string | null;
  paymentRefundedAmount: number | null;
  righe: RigaOrdine[];
};

/** HTTP status associato a ciascun codice d'errore della RPC. */
export const STATUS_DA_CODICE: Record<string, number> = {
  VALIDATION_ERROR: 422,
  PRODOTTO_NON_TROVATO: 404,
  NEGOZIO_NON_TROVATO: 404,
  PRODOTTO_INATTIVO: 409,
  NEGOZIO_INATTIVO: 409,
  SCORTE_INSUFFICIENTI: 409,
  PREZZO_NON_VALIDO: 500,
  // FASE E5 — la RPC crea_ordine è la fonte autorevole della variante:
  // può restituire questi codici in difesa in profondità.
  VARIANTE_NON_VALIDA: 422,
  VARIANTE_OBBLIGATORIA: 422,
  SAVE_FAILED: 500,
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

/**
 * Recupera un ordine per la pagina di conferma (lettura pubblica con dati
 * non sensibili: numero, negozio, righe, totale, modalità, ritiro).
 * Il checkout è pubblico, quindi si usa il client admin (mai esposto al
 * client browser) per leggere l'ordine appena creato.
 */
export async function getOrdineConferma(ordineId: string): Promise<OrdinePersistito | null> {
  const db = getDb();
  if (!db) return null;

  const { data: ordineRow, error } = await db
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .single();
  if (error || !ordineRow) return null;

  // Se la lettura delle righe fallisce, mostriamo comunque l'ordine
  // (con righe vuote) invece di "Ordine non trovato": l'ordine esiste.
  const { data: righeRow } = await db
    .from("ordini_righe")
    .select("*")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: true });

  return assumiOrdine(
    ordineRow as Record<string, unknown>,
    (righeRow ?? []).map((r) => assumiRiga(r as Record<string, unknown>))
  );
}

/** Converte una riga ordini del DB nella forma pubblica. */
function assumiRiga(riga: Record<string, unknown>): RigaOrdine {
  return {
    prodottoId: String(riga.prodotto_id),
    nomeProdotto: String(riga.nome_prodotto),
    prezzoUnitario: Number(riga.prezzo_unitario),
    quantita: Number(riga.quantita),
    immagineUrl: (riga.immagine_url as string | null) ?? null,
    varianteNome: (riga.variante_nome as string | null) ?? null,
  };
}

/** Converte un ordine del DB nella forma pubblica. */
function assumiOrdine(riga: Record<string, unknown>, righe: RigaOrdine[]): OrdinePersistito {
  return {
    id: String(riga.id),
    numero: String(riga.numero),
    stato: (riga.stato as StatoOrdine) ?? "in_preparazione",
    totale: Number(riga.totale),
    createdAt: String(riga.created_at),
    modalita: (riga.modalita as "ritiro" | "spedizione") ?? "ritiro",
    negozioId: String(riga.negozio_id),
    negozioNome: String(riga.negozio_nome),
    ritiroData: (riga.ritiro_data as string | null) ?? null,
    ritiroFascia: (riga.ritiro_fascia as string | null) ?? null,
    annullatoMotivo: (riga.annullato_motivo as string | null) ?? null,
    annullatoNota: (riga.annullato_nota as string | null) ?? null,
    annullatoAt: (riga.annullato_at as string | null) ?? null,
    metodoPagamento:
      (riga.metodo_pagamento as "carta" | "paypal" | "bonifico" | "klarna" | null) ?? null,
    paymentStatus: (riga.payment_status as PaymentStatus | null) ?? null,
    paymentProvider: (riga.payment_provider as string | null) ?? null,
    paymentPaidAt: (riga.payment_paid_at as string | null) ?? null,
    paymentExpiresAt: (riga.payment_expires_at as string | null) ?? null,
    paymentRefundedAt: (riga.payment_refunded_at as string | null) ?? null,
    paymentRefundedAmount:
      riga.payment_refunded_amount == null
        ? null
        : Number(riga.payment_refunded_amount),
    righe,
  };
}

/** Payload della RPC crea_ordine (puro, testabile). */
export type PayloadCreaOrdine = Record<string, unknown>;

/**
 * Costruisce il payload della RPC `crea_ordine` a partire dall'input
 * VALIDATO. Funzione pura: la stessa normalizzazione usata in creaOrdine
 * (niente default silenziosi; i valori mancanti diventano null).
 * `clienteUserId` arriva SOLO dal server (sessione Supabase), mai dal
 * browser: se assente l'ordine nasce guest.
 */
export function costruisciPayloadOrdine(input: CreaOrdineInput): PayloadCreaOrdine {
  const quantita = Number(input.quantita);
  const cliente = input.cliente ?? ({} as ClienteCheckout);
  const nome = String(cliente.nome ?? "").trim();
  const cognome = String(cliente.cognome ?? "").trim();
  const telefono = cliente.telefono ? String(cliente.telefono).trim().slice(0, 30) : null;
  const email = cliente.email ? String(cliente.email).trim().slice(0, 120) : null;
  const note = input.note ? String(input.note).trim().slice(0, 500) : null;
  const userId =
    input.clienteUserId && String(input.clienteUserId).trim()
      ? String(input.clienteUserId).trim()
      : null;

  return {
    idempotencyKey: (input.idempotencyKey ?? "").trim(),
    prodottoId: String(input.prodottoId),
    // Trasporto del varianteId: la RPC crea_ordine non lo usa ancora (E5).
    varianteId: input.varianteId && String(input.varianteId).trim()
      ? String(input.varianteId).trim()
      : null,
    quantita,
    modalita: input.modalita,
    clienteNome: nome,
    clienteCognome: cognome,
    clienteTelefono: telefono,
    clienteEmail: email,
    clienteUserId: userId,
    clienteIp: input.clienteIp ?? null,
    ritiroData: input.modalita === "ritiro" ? (input.ritiro?.data ?? null) : null,
    ritiroFascia: input.modalita === "ritiro" ? (input.ritiro?.fascia ?? null) : null,
    spedizioneIndirizzo: input.modalita === "spedizione" ? String(input.spedizione!.indirizzo).trim() : null,
    spedizioneCap: input.modalita === "spedizione" ? String(input.spedizione!.cap).trim() : null,
    spedizioneCitta: input.modalita === "spedizione" ? String(input.spedizione!.citta).trim() : null,
    spedizioneProvincia: input.modalita === "spedizione" ? String(input.spedizione!.provincia).trim() : null,
    spedizioneNote: input.modalita === "spedizione" ? (input.spedizione!.note ? String(input.spedizione!.note).trim().slice(0, 500) : null) : null,
    metodoSpedizione: input.modalita === "spedizione" ? input.spedizione!.metodoSpedizione : null,
    metodoPagamento: input.modalita === "spedizione" ? input.spedizione!.metodoPagamento : null,
    note,
  };
}

/**
 * Crea un ordine salvandolo realmente su Supabase in modo ATOMICO.
 *
 * Validazioni (tutte lato server, mai fidarsi del client):
 *   1. input ben formato (chiave idempotenza, prodotto, quantità, modalità,
 *      cliente, dati ritiro/spedizione);
 *   2. la creazione effettiva (prodotto attivo, negozio attivo, prezzo,
 *      disponibilità, insert ordine + righe, decremento stock) avviene nella
 *      transazione atomica `public.crea_ordine` — vedi la migrazione
 *      20260813_ordini_stock.sql per i dettagli di locking e rollback.
 */
export async function creaOrdine(
  input: CreaOrdineInput
): Promise<EsitoCreaOrdine> {
  const db = getDb();
  if (!db) return { ok: false, errore: "Database non disponibile.", codice: "DB_UNAVAILABLE", status: 500 };

  // ── 1. Validazione input ───────────────────────────────────────────────
  const key = (input.idempotencyKey ?? "").trim();
  if (!key || key.length > 64) {
    return { ok: false, errore: "Chiave di idempotenza non valida.", codice: "VALIDATION_ERROR", status: 422 };
  }
  if (!input.prodottoId || !/^\d+$/.test(String(input.prodottoId))) {
    return { ok: false, errore: "Prodotto non valido.", codice: "VALIDATION_ERROR", status: 422 };
  }

  // FASE E4 — variante: obbligatoria per i prodotti con varianti, validata
  // (esistenza + appartenenza al prodotto + attiva) SENZA modificare la
  // RPC crea_ordine. Per i prodotti legacy nessun vincolo (comportamento
  // attuale invariato).
  const esitoVariante = await richiediVariantePerProdotto(
    String(input.prodottoId),
    input.varianteId ?? null
  );
  if (esitoVariante.stato === "obbligatoria") {
    return {
      ok: false,
      errore: "Seleziona una variante del prodotto.",
      codice: "VARIANTE_OBBLIGATORIA",
      status: 422,
    };
  }
  if (esitoVariante.stato === "invalida") {
    return {
      ok: false,
      errore: "Variante non valida o non più disponibile.",
      codice: "VARIANTE_NON_VALIDA",
      status: 422,
    };
  }

  const quantita = Number(input.quantita);
  if (!Number.isInteger(quantita) || quantita < 1 || quantita > 99) {
    return { ok: false, errore: "Quantità non valida (1-99).", codice: "VALIDATION_ERROR", status: 422 };
  }
  if (input.modalita !== "ritiro" && input.modalita !== "spedizione") {
    return { ok: false, errore: "Modalità di consegna non valida.", codice: "VALIDATION_ERROR", status: 422 };
  }
  const cliente = input.cliente ?? ({} as ClienteCheckout);
  const nome = String(cliente.nome ?? "").trim();
  const cognome = String(cliente.cognome ?? "").trim();
  if (!nome || !cognome) {
    return { ok: false, errore: "Nome e cognome sono obbligatori.", codice: "VALIDATION_ERROR", status: 422 };
  }
  if (nome.length > 80 || cognome.length > 80) {
    return { ok: false, errore: "Nome/cognome troppo lunghi.", codice: "VALIDATION_ERROR", status: 422 };
  }
  const telefono = cliente.telefono ? String(cliente.telefono).trim().slice(0, 30) : null;
  const email = cliente.email ? String(cliente.email).trim().slice(0, 120) : null;

  // Validazioni specifiche per modalità
  if (input.modalita === "spedizione") {
    const sp = input.spedizione;
    if (!sp || !sp.indirizzo || !sp.cap || !sp.citta || !sp.provincia) {
      return { ok: false, errore: "Dati di spedizione incompleti.", codice: "VALIDATION_ERROR", status: 422 };
    }
    if (!/^\d{5}$/.test(String(sp.cap).trim())) {
      return { ok: false, errore: "Il CAP deve essere composto da 5 cifre.", codice: "VALIDATION_ERROR", status: 422 };
    }
    if (sp.metodoSpedizione !== "standard" && sp.metodoSpedizione !== "express") {
      return { ok: false, errore: "Metodo di spedizione non valido.", codice: "VALIDATION_ERROR", status: 422 };
    }
    if (
      sp.metodoPagamento !== "carta" &&
      sp.metodoPagamento !== "paypal" &&
      sp.metodoPagamento !== "bonifico" &&
      sp.metodoPagamento !== "klarna"
    ) {
      return { ok: false, errore: "Metodo di pagamento non valido.", codice: "VALIDATION_ERROR", status: 422 };
    }
  } else if (input.ritiro) {
    // data/fascia opzionali ma con limiti di lunghezza
    if (input.ritiro.data && String(input.ritiro.data).length > 20) {
      return { ok: false, errore: "Data di ritiro non valida.", codice: "VALIDATION_ERROR", status: 422 };
    }
    if (input.ritiro.fascia && String(input.ritiro.fascia).length > 40) {
      return { ok: false, errore: "Fascia oraria non valida.", codice: "VALIDATION_ERROR", status: 422 };
    }
  }
  const note = input.note ? String(input.note).trim().slice(0, 500) : null;

  // ── 2. Transazione atomica nel database (ordine + righe + stock) ────────
  // La funzione PostgreSQL gestisce: idempotenza, lock del prodotto,
  // validazioni di prodotto/negozio/prezzo/scorte, insert ordine e righe,
  // decremento dello stock e associazione cliente_user_id. Qualunque errore
  // → rollback totale.
  const payload = costruisciPayloadOrdine(input);

  // FASE E5 — il varianteId viaggia verso la RPC SOLO se la variante è stata
  // validata (valida); per i prodotti legacy un varianteId spurio viene
  // eliminato qui così la RPC segue il percorso legacy e non lo rifiuta.
  // La RPC resta comunque la fonte autorevole (validazione difensiva).
  if (esitoVariante.stato !== "valida") {
    payload.varianteId = null;
  }

  const { data, error } = await db.rpc("crea_ordine", { p_payload: payload });

  if (error) {
    // La RPC non lancia per gli errori di business (ritorna ok:false):
    // qui arrivano solo errori infrastrutturali.
    console.error("[ordini] RPC crea_ordine fallita:", error.message);
    return { ok: false, errore: "Impossibile salvare l'ordine.", codice: "SAVE_FAILED", status: 500 };
  }

  const esito = data as unknown as {
    ok: boolean;
    giaEsistente?: boolean;
    ordine?: OrdinePersistito;
    codice?: string;
    messaggio?: string;
  };

  if (!esito || esito.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      errore: String(esito?.messaggio ?? "Impossibile salvare l'ordine."),
      codice,
      status: STATUS_DA_CODICE[codice] ?? 500,
    };
  }

  const giaEsistente = esito.giaEsistente ?? false;

  // ── 3. Notifiche al negoziante (BEST-EFFORT, mai bloccano) ───────────────
  // Solo per un ordine REALMENTE nuovo (mai per i retry idempotenti con la
  // stessa idempotency_key): stessa idempotency_key → un solo ordine, un solo
  // decremento di stock e una SOLA notifica. Le notifiche avvengono DOPO la
  // creazione riuscita: eventuali errori (Meta, ntfy) vengono solo loggati e
  // l'ordine resta salvato (lo stock è già stato decrementato dalla RPC
  // atomica). Il .catch è una rete di sicurezza: i helper non lanciano mai,
  // ma qui non devono MAI interferire con la risposta al cliente.
  if (!giaEsistente && esito.ordine?.id) {
    // FASE F1 — email di conferma: per gli ordini con pagamento online
    // (carta/klarna) la conferma viene inviata SOLO DOPO che il webhook del
    // provider conferma il pagamento (mai dire "pagato" prima del
    // pagamento). Per tutti gli altri metodi (bonifico/ritiro) l'email
    // parte subito.
    const pagamentoOnline =
      input.spedizione?.metodoPagamento === "carta" ||
      input.spedizione?.metodoPagamento === "klarna";
    if (!pagamentoOnline) {
      await inviaEmailConfermaOrdine(esito.ordine.id).catch(() => {});
    }
    // Notifiche al negoziante (BEST-EFFORT, mai bloccano la risposta).
    await inviaNotificaNuovoOrdine(esito.ordine.id).catch(() => {});
    await inviaNotificaNuovoOrdineNtfy(esito.ordine.id).catch(() => {});
  }

  return {
    ok: true,
    giaEsistente,
    ordine: esito.ordine!,
  };
}
