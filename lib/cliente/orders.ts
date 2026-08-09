import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  ClienteOrdine,
  RigaOrdine,
  StatoOrdine,
} from "./types";

/**
 * Servizio Ordini dell'Area Clienti.
 * Fase completa — creazione ordine realmente persistita.
 *
 * - creaOrdine: valida prodotto/negozio, calcola i totali dal DATABASE
 *   (mai fidarsi dei prezzi inviati dal client), salva ordine + righe con
 *   idempotenza (idempotency_key): un doppio click NON crea due ordini.
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
    metodoPagamento: "carta" | "paypal" | "bonifico";
  } | null;
  note?: string | null;
  /** userId dell'utente autenticato, se presente (nullable: checkout pubblico). */
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
  righe: RigaOrdine[];
};

/** Costi di spedizione (specchio dei valori mostrati in SpedizioneForm). */
const COSTI_SPEDIZIONE: Record<"standard" | "express", number> = {
  standard: 5.9,
  express: 12.9,
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
    righe,
  };
}

/**
 * Crea un ordine realmente salvato su Supabase.
 *
 * Validazioni (tutte lato server, mai fidarsi del client):
 *   1. input ben formato;
 *   2. negozio esiste ed è attivo;
 *   3. prodotto esiste, è attivo e appartiene al negozio;
 *   4. prezzo e disponibilità (quantita_disponibile se valorizzata);
 *   5. quantità positiva e limite anti-abuso (max 99).
 * Il prezzo è letto DAL DATABASE; il totale è calcolato dal server.
 * Idempotenza: se esiste già un ordine con la stessa idempotency_key,
 * viene restituito l'ordine esistente (nessun doppio ordine).
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
  if (!input.prodottoId || !/^\d+$/.test(input.prodottoId)) {
    return { ok: false, errore: "Prodotto non valido.", codice: "VALIDATION_ERROR", status: 422 };
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
    if (sp.metodoPagamento !== "carta" && sp.metodoPagamento !== "paypal" && sp.metodoPagamento !== "bonifico") {
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

  // ── 2. Idempotenza: se esiste già un ordine con questa chiave, lo restituisce ──
  const { data: esistente } = await db
    .from("ordini")
    .select("id")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (esistente) {
    const { data: ordineRow } = await db
      .from("ordini")
      .select("*")
      .eq("id", esistente.id)
      .single();
    const { data: righeRow } = await db
      .from("ordini_righe")
      .select("*")
      .eq("ordine_id", esistente.id)
      .order("created_at", { ascending: true });
    if (ordineRow) {
      return {
        ok: true,
        giaEsistente: true,
        ordine: assumiOrdine(ordineRow as Record<string, unknown>, (righeRow ?? []).map((r) => assumiRiga(r as Record<string, unknown>))),
      };
    }
  }

  // ── 3. Verifica prodotto (attivo + negozio_id) ───────────────────────────
  const { data: prodotto, error: errProdotto } = await db
    .from("prodotti")
    .select("id, negozio_id, nome, prezzo, quantita_disponibile, attivo, immagine_principale")
    .eq("id", Number(input.prodottoId))
    .single();

  if (errProdotto || !prodotto) {
    return { ok: false, errore: "Prodotto non trovato.", codice: "PRODOTTO_NON_TROVATO", status: 404 };
  }
  if (!prodotto.attivo) {
    return { ok: false, errore: "Questo prodotto non è più disponibile.", codice: "PRODOTTO_INATTIVO", status: 409 };
  }

  // ── 4. Verifica negozio (esiste, attivo, non cestinato) ─────────────────
  const { data: negozioRow, error: errNegozioRow } = await db
    .from("negozi")
    .select("id, nome, attivo, deleted_at")
    .eq("id", String(prodotto.negozio_id))
    .single();

  if (errNegozioRow || !negozioRow) {
    return { ok: false, errore: "Negozio non trovato.", codice: "NEGOZIO_NON_TROVATO", status: 404 };
  }
  if (!negozioRow.attivo || negozioRow.deleted_at) {
    return { ok: false, errore: "Il negozio non è più attivo.", codice: "NEGOZIO_INATTIVO", status: 409 };
  }

  // ── 5. Prezzo e disponibilità (dal DATABASE) ─────────────────────────────
  const prezzoUnitario = Number(prodotto.prezzo);
  if (!Number.isFinite(prezzoUnitario) || prezzoUnitario < 0) {
    return { ok: false, errore: "Prezzo del prodotto non valido.", codice: "PREZZO_NON_VALIDO", status: 500 };
  }
  const disponibile = prodotto.quantita_disponibile;
  if (disponibile != null && Number(disponibile) < quantita) {
    return {
      ok: false,
      errore: `Disponibilità insufficiente (restano ${Number(disponibile)} pezzi).`,
      codice: "SCORTE_INSUFFICIENTI",
      status: 409,
    };
  }

  const costoSpedizione =
    input.modalita === "spedizione"
      ? COSTI_SPEDIZIONE[input.spedizione!.metodoSpedizione]
      : 0;
  const totale = Number((prezzoUnitario * quantita + costoSpedizione).toFixed(2));

  // ── 6. Salvataggio ordine + righe (idempotente) ─────────────────────────
  const { data: ordineRow, error: errOrdine } = await db
    .from("ordini")
    .insert({
      idempotency_key: key,
      modalita: input.modalita,
      totale,
      negozio_id: negozioRow.id,
      negozio_nome: String(negozioRow.nome),
      cliente_user_id: input.clienteUserId ?? null,
      cliente_nome: nome,
      cliente_cognome: cognome,
      cliente_telefono: telefono,
      cliente_email: email,
      ritiro_data: input.modalita === "ritiro" ? (input.ritiro?.data ?? null) : null,
      ritiro_fascia: input.modalita === "ritiro" ? (input.ritiro?.fascia ?? null) : null,
      spedizione_indirizzo: input.modalita === "spedizione" ? String(input.spedizione!.indirizzo).trim() : null,
      spedizione_cap: input.modalita === "spedizione" ? String(input.spedizione!.cap).trim() : null,
      spedizione_citta: input.modalita === "spedizione" ? String(input.spedizione!.citta).trim() : null,
      spedizione_provincia: input.modalita === "spedizione" ? String(input.spedizione!.provincia).trim() : null,
      spedizione_note: input.modalita === "spedizione" ? (input.spedizione!.note ? String(input.spedizione!.note).trim().slice(0, 500) : null) : null,
      metodo_spedizione: input.modalita === "spedizione" ? input.spedizione!.metodoSpedizione : null,
      costo_spedizione: costoSpedizione,
      metodo_pagamento: input.modalita === "spedizione" ? input.spedizione!.metodoPagamento : null,
      note,
    })
    .select("id, numero, stato, totale, created_at, modalita, negozio_id, negozio_nome, ritiro_data, ritiro_fascia")
    .single();

  if (errOrdine || !ordineRow) {
    // Errore di unique su idempotency_key (race condition del doppio click):
    // recuperiamo l'ordine già creato e lo restituiamo senza errore.
    if (String(errOrdine?.code ?? "") === "23505") {
      const { data: giaCreato } = await db
        .from("ordini")
        .select("*")
        .eq("idempotency_key", key)
        .single();
      if (giaCreato) {
        const { data: righeGia } = await db
          .from("ordini_righe")
          .select("*")
          .eq("ordine_id", giaCreato.id)
          .order("created_at", { ascending: true });
        return {
          ok: true,
          giaEsistente: true,
          ordine: assumiOrdine(giaCreato as Record<string, unknown>, (righeGia ?? []).map((r) => assumiRiga(r as Record<string, unknown>))),
        };
      }
    }
    return { ok: false, errore: "Impossibile salvare l'ordine.", codice: "SAVE_FAILED", status: 500 };
  }

  // ── 7. Righe ordine ──────────────────────────────────────────────────────
  const { data: righeRow, error: errRighe } = await db
    .from("ordini_righe")
    .insert({
      ordine_id: ordineRow.id,
      prodotto_id: Number(prodotto.id),
      nome_prodotto: String(prodotto.nome),
      prezzo_unitario: prezzoUnitario,
      quantita,
      immagine_url: (prodotto.immagine_principale as string | null) ?? null,
    })
    .select("*")
    .single();

  if (errRighe || !righeRow) {
    // L'ordine è già salvato (mai perso): ritorniamo comunque l'esito,
    // segnalando l'ordine con righe vuote solo in casi estremi.
    console.error("[ordini] Errore salvataggio righe:", errRighe?.message);
    return {
      ok: true,
      giaEsistente: false,
      ordine: assumiOrdine(ordineRow as Record<string, unknown>, []),
    };
  }

  const ordine: OrdinePersistito = assumiOrdine(
    ordineRow as Record<string, unknown>,
    [assumiRiga(righeRow as Record<string, unknown>)]
  );
  return { ok: true, giaEsistente: false, ordine };
}
