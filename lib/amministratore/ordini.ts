/**
 * SERVIZIO ORDINI AREA AMMINISTRATORE — LETTURA GLOBALE + AZIONI.
 *
 * Fonte definitiva: Supabase (ordini + ordini_righe + ordini_eventi).
 * La LETTURA usa createServerSupabaseClient() (RLS): l'admin vede TUTTI gli
 * ordini grazie alla policy "ordini admin select all" (migration 20260812),
 * MAI un bypass service-role. Nessun filtro negozio imposto oltre ai filtri
 * richiesti: è la RLS a delimitare l'accesso, non il codice.
 *
 * Le AZIONI (cambio stato ordine / stato spedizione) riusano le RPC esistenti
 * `aggiorna_stato_ordine` e `aggiorna_stato_spedizione` (SECURITY DEFINER,
 * service_role), che ri-verificano l'ownership (owner O admin). L'autorizzazione
 * "admin" è doppiamente garantita: requireApiArea("admin") nella route + la
 * verifica `user_roles.role='admin'` dentro la RPC.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  EventoOrdine,
  RigaOrdine,
  StatoOrdine,
  StatoSpedizione,
} from "@/lib/cliente/types";
import { isStatoOrdine } from "@/lib/merchant/ordini-stati";
import { isStatoSpedizione } from "@/lib/merchant/ordini-spedizioni";

// ── Tipi ────────────────────────────────────────────────────────────────────

/** Filtri dell'elenco ordini admin (tutti facoltativi, server-side). */
export type FiltriOrdiniAdmin = {
  /** Ricerca libera su numero, cliente (nome/cognome) e negozio. */
  q?: string;
  stato?: string;
  /** Stato del pagamento (payment_status). */
  pagamento?: string;
  statoSpedizione?: string;
  negozioId?: string;
  modalita?: string;
  /** Data minima (ISO) su created_at. */
  dataDa?: string;
  /** Data massima (ISO) su created_at. */
  dataA?: string;
  pagina?: number;
  perPagina?: number;
};

/** Riga della lista ordini admin. */
export type OrdineAdminLista = {
  id: string;
  numero: string;
  stato: StatoOrdine;
  statoSpedizione: StatoSpedizione | null;
  paymentStatus: string | null;
  modalita: "ritiro" | "spedizione";
  totale: number;
  negozioId: string;
  negozioNome: string;
  clienteNome: string;
  clienteCognome: string;
  createdAt: string;
  numeroRighe: number;
};

/** Dettaglio completo ordine (area amministratore, read-only). */
export type OrdineAdminDettaglio = {
  id: string;
  numero: string;
  stato: StatoOrdine;
  statoSpedizione: StatoSpedizione | null;
  modalita: "ritiro" | "spedizione";
  totale: number;
  costoSpedizione: number;
  createdAt: string;
  negozioId: string;
  negozioNome: string;
  // Cliente
  clienteNome: string;
  clienteCognome: string;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  note: string | null;
  // Ritiro / spedizione
  ritiroData: string | null;
  ritiroFascia: string | null;
  spedizioneIndirizzo: string | null;
  spedizioneCap: string | null;
  spedizioneCitta: string | null;
  spedizioneProvincia: string | null;
  spedizioneNote: string | null;
  metodoSpedizione: "standard" | "express" | null;
  spedizioneCarrier: string | null;
  spedizioneServizio: string | null;
  spedizionePesoGrammi: number | null;
  spedizioneTariffaVersione: string | null;
  // Tracking
  trackingCode: string | null;
  trackingUrl: string | null;
  affidataAt: string | null;
  consegnataAt: string | null;
  consegnaStimata: string | null;
  // Pagamento
  metodoPagamento: string | null;
  paymentProvider: string | null;
  paymentStatus: string | null;
  paymentAmount: number | null;
  paymentPaidAt: string | null;
  paymentRefundedAt: string | null;
  paymentRefundedAmount: number | null;
  // Annullamento
  annullatoMotivo: string | null;
  annullatoNota: string | null;
  annullatoAt: string | null;
  // Correlati
  righe: RigaOrdine[];
  eventi: EventoOrdine[];
};

/** Risultato dell'elenco (con metadati di paginazione). */
export type RisultatoOrdiniAdmin = {
  ordini: OrdineAdminLista[];
  totale: number;
  pagina: number;
  perPagina: number;
  pagineTotali: number;
};

/** Esito di un'azione (stato ordine / spedizione). */
export type EsitoAzioneAdmin =
  | { ok: true; cambiato: boolean; ordine: OrdineAdminDettaglio | null }
  | { ok: false; codice: string; messaggio: string; status: number };

// ── Costanti ────────────────────────────────────────────────────────────────

const DEFAULT_PER_PAGINA = 20;
const MAX_PER_PAGINA = 100;

/** HTTP status associato ai codici d'errore delle RPC. */
const STATUS_DA_CODICE: Record<string, number> = {
  VALIDATION_ERROR: 422,
  ORDINE_NON_TROVATO: 404,
  FORBIDDEN: 403,
  MODALITA_NON_SPEDIZIONE: 409,
  ORDINE_CANCELLATO: 409,
  TRANSIZIONE_NON_CONSENTITA: 409,
  MOTIVO_OBBLIGATORIO: 422,
  TRACKING_OBBLIGATORIO: 422,
  TRACKING_URL_NON_VALIDA: 422,
  SAVE_FAILED: 500,
};

// ── Helper ──────────────────────────────────────────────────────────────────

type OrdineRow = Record<string, unknown>;

/** Escapa i caratteri wildcard di ILIKE (mai wildcard dall'utente). */
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, "\\$&");
}

/** Query builder con i filtri applicati (condivisa tra lista e conteggio). */
function applicaFiltri(query: any, filtri: FiltriOrdiniAdmin) {
  let q = query;
  if (filtri.q) {
    const pattern = `%${escapeLike(filtri.q.trim())}%`;
    q = q.or(
      `numero.ilike.${pattern},cliente_nome.ilike.${pattern},cliente_cognome.ilike.${pattern},negozio_nome.ilike.${pattern}`
    );
  }
  if (filtri.stato) q = q.eq("stato", filtri.stato);
  if (filtri.pagamento) q = q.eq("payment_status", filtri.pagamento);
  if (filtri.statoSpedizione) q = q.eq("stato_spedizione", filtri.statoSpedizione);
  if (filtri.negozioId) q = q.eq("negozio_id", filtri.negozioId);
  if (filtri.modalita) q = q.eq("modalita", filtri.modalita);
  if (filtri.dataDa) q = q.gte("created_at", filtri.dataDa);
  if (filtri.dataA) q = q.lte("created_at", filtri.dataA);
  return q;
}

/** Converte una riga ordini_righe nella forma tipizzata condivisa. */
function mappaRiga(row: Record<string, unknown>): RigaOrdine {
  return {
    prodottoId: String(row.prodotto_id),
    nomeProdotto: String(row.nome_prodotto ?? ""),
    prezzoUnitario: Number(row.prezzo_unitario ?? 0),
    quantita: Number(row.quantita ?? 1),
    immagineUrl: (row.immagine_url as string | null) ?? null,
    varianteNome: (row.variante_nome as string | null) ?? null,
  };
}

/** Converte una riga ordini_eventi nella forma tipizzata condivisa. */
function mappaEvento(row: Record<string, unknown>): EventoOrdine {
  return {
    id: String(row.id),
    evento: String(row.evento ?? ""),
    dettaglio: (row.dettaglio as string | null) ?? null,
    motivo: (row.motivo as string | null) ?? null,
    nota: (row.nota as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Converte una riga ordini nella forma "lista" (admin). */
function mappaLista(row: OrdineRow, numeroRighe: number): OrdineAdminLista {
  return {
    id: String(row.id),
    numero: String(row.numero ?? ""),
    stato: (row.stato as StatoOrdine) ?? "in_preparazione",
    statoSpedizione: (row.stato_spedizione as StatoSpedizione | null) ?? null,
    paymentStatus: (row.payment_status as string | null) ?? null,
    modalita: (row.modalita as "ritiro" | "spedizione") ?? "ritiro",
    totale: Number(row.totale ?? 0),
    negozioId: String(row.negozio_id ?? ""),
    negozioNome: String(row.negozio_nome ?? ""),
    clienteNome: String(row.cliente_nome ?? ""),
    clienteCognome: String(row.cliente_cognome ?? ""),
    createdAt: String(row.created_at ?? ""),
    numeroRighe,
  };
}

/** Converte una riga ordini nella forma "dettaglio" (admin). */
function mappaDettaglio(
  row: OrdineRow,
  righe: RigaOrdine[],
  eventi: EventoOrdine[]
): OrdineAdminDettaglio {
  return {
    id: String(row.id),
    numero: String(row.numero ?? ""),
    stato: (row.stato as StatoOrdine) ?? "in_preparazione",
    statoSpedizione: (row.stato_spedizione as StatoSpedizione | null) ?? null,
    modalita: (row.modalita as "ritiro" | "spedizione") ?? "ritiro",
    totale: Number(row.totale ?? 0),
    costoSpedizione: Number(row.costo_spedizione ?? 0),
    createdAt: String(row.created_at ?? ""),
    negozioId: String(row.negozio_id ?? ""),
    negozioNome: String(row.negozio_nome ?? ""),
    clienteNome: String(row.cliente_nome ?? ""),
    clienteCognome: String(row.cliente_cognome ?? ""),
    clienteTelefono: (row.cliente_telefono as string | null) ?? null,
    clienteEmail: (row.cliente_email as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    ritiroData: (row.ritiro_data as string | null) ?? null,
    ritiroFascia: (row.ritiro_fascia as string | null) ?? null,
    spedizioneIndirizzo: (row.spedizione_indirizzo as string | null) ?? null,
    spedizioneCap: (row.spedizione_cap as string | null) ?? null,
    spedizioneCitta: (row.spedizione_citta as string | null) ?? null,
    spedizioneProvincia: (row.spedizione_provincia as string | null) ?? null,
    spedizioneNote: (row.spedizione_note as string | null) ?? null,
    metodoSpedizione: (row.metodo_spedizione as "standard" | "express" | null) ?? null,
    spedizioneCarrier: (row.spedizione_carrier as string | null) ?? null,
    spedizioneServizio: (row.spedizione_servizio as string | null) ?? null,
    spedizionePesoGrammi: (row.spedizione_peso_grammi as number | null) ?? null,
    spedizioneTariffaVersione: (row.spedizione_tariffa_versione as string | null) ?? null,
    trackingCode: (row.tracking_code as string | null) ?? null,
    trackingUrl: (row.tracking_url as string | null) ?? null,
    affidataAt: (row.affidata_at as string | null) ?? null,
    consegnataAt: (row.consegnata_at as string | null) ?? null,
    consegnaStimata: (row.consegna_stimata as string | null) ?? null,
    metodoPagamento: (row.metodo_pagamento as string | null) ?? null,
    paymentProvider: (row.payment_provider as string | null) ?? null,
    paymentStatus: (row.payment_status as string | null) ?? null,
    paymentAmount: num(row.payment_amount),
    paymentPaidAt: (row.payment_paid_at as string | null) ?? null,
    paymentRefundedAt: (row.payment_refunded_at as string | null) ?? null,
    paymentRefundedAmount: num(row.payment_refunded_amount),
    annullatoMotivo: (row.annullato_motivo as string | null) ?? null,
    annullatoNota: (row.annullato_nota as string | null) ?? null,
    annullatoAt: (row.annullato_at as string | null) ?? null,
    righe,
    eventi,
  };
}

// ── Lettura (RLS admin) ─────────────────────────────────────────────────────

/**
 * Elenco GLOBALE degli ordini (tutti i negozi) con filtri e paginazione
 * SERVER-SIDE. La lettura gira con la sessione admin (RLS "ordini admin
 * select all"): nessun filtro negozio aggiuntivo, nessun filtro client-side.
 */
export async function getOrdiniAdmin(
  filtri: FiltriOrdiniAdmin = {}
): Promise<RisultatoOrdiniAdmin> {
  const db = await createServerSupabaseClient();

  const perPagina = Math.min(
    Math.max(1, Number(filtri.perPagina) || DEFAULT_PER_PAGINA),
    MAX_PER_PAGINA
  );
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  // Conteggio totale (per la paginazione), con gli stessi filtri.
  const countQuery = applicaFiltri(
    db.from("ordini").select("id", { head: true, count: "exact" }),
    filtri
  );
  const { count, error: erroreCount } = await countQuery;
  if (erroreCount) {
    throw new Error(`Conteggio ordini fallito: ${erroreCount.message}`);
  }
  const totale = count ?? 0;

  // Pagina corrente (ordini dal più recente).
  const listaQuery = applicaFiltri(db.from("ordini").select("*"), filtri)
    .order("created_at", { ascending: false })
    .range((pagina - 1) * perPagina, pagina * perPagina - 1);
  const { data, error } = await listaQuery;
  if (error) {
    throw new Error(`Lettura ordini fallita: ${error.message}`);
  }
  const ordini = (data ?? []) as OrdineRow[];

  // Conteggio righe per ordine (una sola query batch, nessun N+1).
  const righePerOrdine = new Map<string, number>();
  if (ordini.length > 0) {
    const { data: righe } = await db
      .from("ordini_righe")
      .select("ordine_id")
      .in("ordine_id", ordini.map((o) => String(o.id)));
    for (const r of (righe ?? []) as Array<{ ordine_id: unknown }>) {
      const id = String(r.ordine_id);
      righePerOrdine.set(id, (righePerOrdine.get(id) ?? 0) + 1);
    }
  }

  return {
    ordini: ordini.map((o) => mappaLista(o, righePerOrdine.get(String(o.id)) ?? 0)),
    totale,
    pagina,
    perPagina,
    pagineTotali: totale === 0 ? 0 : Math.ceil(totale / perPagina),
  };
}

/**
 * Dettaglio completo di un ordine (read-only, admin). RLS admin: l'admin
 * vede qualunque ordine; un id inesistente restituisce null.
 */
export async function getOrdineAdmin(ordineId: string): Promise<OrdineAdminDettaglio | null> {
  const db = await createServerSupabaseClient();

  const { data, error } = await db
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .maybeSingle();

  if (error) {
    throw new Error(`Lettura ordine fallita: ${error.message}`);
  }
  if (!data) return null;

  const ordineRow = data as OrdineRow;

  const [righeResult, eventiResult] = await Promise.all([
    db.from("ordini_righe").select("*").eq("ordine_id", ordineId).order("created_at", { ascending: true }),
    db.from("ordini_eventi").select("*").eq("ordine_id", ordineId).order("created_at", { ascending: true }),
  ]);

  const righe = ((righeResult.data ?? []) as OrdineRow[]).map(mappaRiga);
  const eventi = ((eventiResult.data ?? []) as OrdineRow[]).map(mappaEvento);

  return mappaDettaglio(ordineRow, righe, eventi);
}

// ── Azioni (RPC esistenti, service_role) ────────────────────────────────────

/**
 * Cambio stato ORDINE lato admin: riusa la RPC `aggiorna_stato_ordine`
 * (macchina a stati + ownership owner/admin + ripristino stock). Nessuna
 * nuova RPC, nessun UPDATE diretto.
 */
export async function aggiornaStatoOrdineAdmin(
  userId: string,
  ordineId: string,
  nuovoStato: StatoOrdine,
  opts: { motivo?: string | null; nota?: string | null } = {}
): Promise<EsitoAzioneAdmin> {
  if (!isStatoOrdine(nuovoStato)) {
    return { ok: false, codice: "VALIDATION_ERROR", messaggio: "Stato non valido.", status: 422 };
  }
  const db = createAdminSupabaseClient();
  const { data, error } = await (db as any).rpc("aggiorna_stato_ordine", {
    p_ordine_id: ordineId,
    p_nuovo_stato: nuovoStato,
    p_motivo: opts.motivo ?? null,
    p_nota: opts.nota ?? null,
    p_merchant_user_id: userId,
  });

  if (error) {
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile aggiornare l'ordine.", status: 500 };
  }
  const esito = data as unknown as {
    ok: boolean;
    cambiato?: boolean;
    codice?: string;
    messaggio?: string;
  };
  if (!esito || esito.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile aggiornare l'ordine."),
      status: STATUS_DA_CODICE[codice] ?? 500,
    };
  }

  const ordine = await getOrdineAdmin(ordineId).catch(() => null);
  return { ok: true, cambiato: esito.cambiato ?? false, ordine };
}

/**
 * Cambio stato SPEDIZIONE lato admin: riusa la RPC `aggiorna_stato_spedizione`
 * (macchina a stati + ownership owner/admin + tracking obbligatorio).
 */
export async function aggiornaStatoSpedizioneAdmin(
  userId: string,
  ordineId: string,
  nuovoStato: StatoSpedizione,
  opts: {
    trackingCode?: string | null;
    trackingUrl?: string | null;
    consegnaStimata?: string | null;
  } = {}
): Promise<EsitoAzioneAdmin> {
  if (!isStatoSpedizione(nuovoStato)) {
    return { ok: false, codice: "VALIDATION_ERROR", messaggio: "Stato spedizione non valido.", status: 422 };
  }
  const db = createAdminSupabaseClient();
  const { data, error } = await (db as any).rpc("aggiorna_stato_spedizione", {
    p_ordine_id: ordineId,
    p_nuovo_stato: nuovoStato,
    p_tracking_code: opts.trackingCode ?? null,
    p_tracking_url: opts.trackingUrl ?? null,
    p_consegna_stimata: opts.consegnaStimata ?? null,
    p_merchant_user_id: userId,
  });

  if (error) {
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile aggiornare la spedizione.", status: 500 };
  }
  const esito = data as unknown as {
    ok: boolean;
    cambiato?: boolean;
    codice?: string;
    messaggio?: string;
  };
  if (!esito || esito.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile aggiornare la spedizione."),
      status: STATUS_DA_CODICE[codice] ?? 500,
    };
  }

  const ordine = await getOrdineAdmin(ordineId).catch(() => null);
  return { ok: true, cambiato: esito.cambiato ?? false, ordine };
}
