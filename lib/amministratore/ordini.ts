/**
 * SERVIZIO ORDINI AREA AMMINISTRATORE — LETTURA GLOBALE + AZIONI.
 *
 * Fonte definitiva: Supabase (ordini + ordini_righe + ordini_eventi).
 * La LETTURA usa createAdminSupabaseClient() (service role) dietro il gate
 * applicativo admin (requireApiArea("admin") nelle API, layout dell'area):
 * stesso pattern del cestino negozi e del cestino ordini. Nessun filtro
 * negozio imposto oltre ai filtri richiesti. La policy RLS "ordini admin
 * select all" resta intatta per l'accesso diretto via client pubblico.
 *
 * Le AZIONI (cambio stato ordine / stato spedizione) riusano le RPC esistenti
 * `aggiorna_stato_ordine` e `aggiorna_stato_spedizione` (SECURITY DEFINER,
 * service_role), che ri-verificano l'ownership (owner O admin). L'autorizzazione
 * "admin" è doppiamente garantita: requireApiArea("admin") nella route + la
 * verifica `user_roles.role='admin'` dentro la RPC.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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
  // Commissione piattaforma (snapshot ordine; NULL sugli storici pre-20260904)
  commissionePercentuale: number | null;
  commissioneImporto: number | null;
  /**
   * Netto venditore (DATI DERIVATI): totale ordine − commissione piattaforma.
   * Non è una colonna: calcolato dal read-side quando lo snapshot commissione
   * è presente, altrimenti null (ordini storici senza commissione).
   */
  nettoVenditore: number | null;
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
    commissionePercentuale: num(row.commissione_percentuale),
    commissioneImporto: num(row.commissione_importo),
    nettoVenditore:
      row.commissione_importo === null || row.commissione_importo === undefined
        ? null
        : Math.round((Number(row.totale ?? 0) - Number(row.commissione_importo ?? 0)) * 100) / 100,
    annullatoMotivo: (row.annullato_motivo as string | null) ?? null,
    annullatoNota: (row.annullato_nota as string | null) ?? null,
    annullatoAt: (row.annullato_at as string | null) ?? null,
    righe,
    eventi,
  };
}

// ── Lettura (admin, service role) ─────────────────────────────────────────────

/**
 * Elenco GLOBALE degli ordini (tutti i negozi) con filtri e paginazione
 * SERVER-SIDE. La lettura usa l'admin client (service role) dietro il gate
 * applicativo admin: nessun filtro negozio aggiuntivo, nessun filtro
 * client-side. Gli ordini nel Cestino (deleted_at non null) sono esclusi.
 */
// ── Schema cestino ORDINI ────────────────────────────────────────────────────
// La migration (20260917_ordini_cestino.sql) aggiunge deleted_at/deleted_by a
// ordini. Fino ad applicazione (in attesa di approvazione) la colonna NON esiste:
// un filtro `.is("deleted_at", null)` su colonna mancante rende PostgREST che
// restituisce un ESITO VUOTO SILENZIOSO (senza errore), NON 42703. Quindi NON
// possiamo distinguere per errore: rileviamo la presenza della colonna una sola
// volta (schema probe memoizzato sul service-role) e condizioniamo il filtro.
let _ordineColonnaDeletedAt: boolean | null = null;

/** true se la colonna ordini.deleted_at esiste nel DB corrente. */
async function ordineHaColonnaDeletedAt(): Promise<boolean> {
  if (_ordineColonnaDeletedAt !== null) return _ordineColonnaDeletedAt;
  try {
    const db = createAdminSupabaseClient();
    // `select` su colonna inesistente → errore 42703 attendibile (a differenza
    // del filtro `.is` che è silenzioso).
    const { error } = await db.from("ordini").select("deleted_at").limit(1);
    _ordineColonnaDeletedAt = !error;
  } catch {
    _ordineColonnaDeletedAt = false;
  }
  return _ordineColonnaDeletedAt;
}

export async function getOrdiniAdmin(
  filtri: FiltriOrdiniAdmin = {}
): Promise<RisultatoOrdiniAdmin> {
  const db = createAdminSupabaseClient();

  const perPagina = Math.min(
    Math.max(1, Number(filtri.perPagina) || DEFAULT_PER_PAGINA),
    MAX_PER_PAGINA
  );
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  // Conteggio totale (per la paginazione), con gli stessi filtri.
  // Gli ordini nel Cestino (deleted_at non null) non compaiono nell'elenco
  // ordinario, ma restano recuperabili da getOrdiniCestino().
  const usaCestino = await ordineHaColonnaDeletedAt();
  const totale = await (async () => {
    if (usaCestino) {
      const { count, error } = await applicaFiltri(
        db.from("ordini").select("id", { head: true, count: "exact" }).is("deleted_at", null),
        filtri
      );
      if (error) throw new Error(`Conteggio ordini fallito: ${error.message}`);
      return count ?? 0;
    }
    const { count, error } = await applicaFiltri(
      db.from("ordini").select("id", { head: true, count: "exact" }),
      filtri
    );
    if (error) throw new Error(`Conteggio ordini fallito: ${error.message}`);
    return count ?? 0;
  })();

  // Pagina corrente (ordini dal più recente), esclusi quelli del Cestino.
  let baseLista = db.from("ordini").select("*");
  if (usaCestino) baseLista = baseLista.is("deleted_at", null);
  const listaQuery = applicaFiltri(baseLista, filtri)
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
 * Dettaglio completo di un ordine (read-only, admin). Admin client (service
 * role) dietro il gate applicativo admin; id inesistente → null.
 */
export async function getOrdineAdmin(ordineId: string): Promise<OrdineAdminDettaglio | null> {
  const db = createAdminSupabaseClient();

  let query = db.from("ordini").select("*").eq("id", ordineId);
  if (await ordineHaColonnaDeletedAt()) {
    query = query.is("deleted_at", null);
  }
  const { data, error } = await query.maybeSingle();

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

// ── Cestino ORDINI (soft delete, pattern negozi) ──────────────────────────────────

/** Riga minima di ordine nel Cestino (per lista/ripristino). */
export type OrdineCestino = {
  id: string;
  numero: string;
  stato: StatoOrdine;
  totale: number;
  negozioId: string;
  negozioNome: string;
  clienteNome: string;
  clienteCognome: string;
  createdAt: string;
  deletedAt: string | null;
};

/**
 * Elenco degli ordini nel Cestino (soft deleted: deleted_at non null),
 * ordinati dal più recente. Azione di piattaforma, solo admin.
 */
export async function getOrdiniCestino(): Promise<OrdineCestino[]> {
  // Se la migration cestino non è ancora applicata (colonna mancante) il
  // cestino ordini è vuoto: nessun ordine è mai stato cestinato.
  if (!(await ordineHaColonnaDeletedAt())) return [];
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("ordini")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) {
    throw new Error(error.message ?? "Impossibile recuperare il cestino ordini.");
  }
  return ((data ?? []) as OrdineRow[]).map((o) => ({
    id: String(o.id),
    numero: String(o.numero ?? ""),
    stato: (o.stato as StatoOrdine) ?? "in_preparazione",
    totale: Number(o.totale ?? 0),
    negozioId: String(o.negozio_id ?? ""),
    negozioNome: String(o.negozio_nome ?? ""),
    clienteNome: String(o.cliente_nome ?? ""),
    clienteCognome: String(o.cliente_cognome ?? ""),
    createdAt: String(o.created_at ?? ""),
    deletedAt: (o.deleted_at as string | null) ?? null,
  }));
}

/** Esito del cestinamento multiplo (soft delete batch). */
export type EsitoCestinaBatch = {
  /** Id degli ordini effettivamente spostati nel Cestino. */
  successi: string[];
  /** Id NON cestinati (già nel Cestino o non trovati). */
  errori: string[];
};

/**
 * Cestinamento MULTIPLO (soft delete) — stesso meccanismo del singolo:
 * imposta deleted_at/deleted_by, NON modifica stato/stock, NON cancella
 * fisicamente. Esclude gli ordini già nel Cestino (deleted_at non null) e
 * restituisce il conteggio reale successi/errori (mai un esito silenzioso).
 */
export async function cestinaOrdiniAdmin(
  ordineIds: string[],
  userId: string
): Promise<EsitoCestinaBatch> {
  if (ordineIds.length === 0) return { successi: [], errori: [] };
  const db = createAdminSupabaseClient();
  const { data, error } = await db
    .from("ordini")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .in("id", ordineIds)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    throw new Error(error.message ?? "Impossibile spostare gli ordini nel cestino.");
  }
  const cestinati = new Set((data ?? []).map((r) => String(r.id)));
  return {
    successi: ordineIds.filter((id) => cestinati.has(id)),
    errori: ordineIds.filter((id) => !cestinati.has(id)),
  };
}

/**
 * Sposta un ordine nel Cestino (soft delete) — azione di piattaforma, SOLO
 * admin (verificato da requireApiArea("admin")). Non cancella fisicamente:
 * setta deleted_at/deleted_by, esattamente come cestinaNegozio(). Riusa il
 * cestinamento multiplo (idempotente: ordine già nel Cestino = no-op).
 */
export async function cestinaOrdineAdmin(
  ordineId: string,
  userId: string
): Promise<void> {
  await cestinaOrdiniAdmin([ordineId], userId);
}

/**
 * Ripristina un ordine dal Cestino — ESCLUSIVAMENTE amministratore.
 * Azzera deleted_at/deleted_by (stesso pattern di ripristinaNegozio()).
 */
export async function ripristinaOrdineAdmin(ordineId: string): Promise<void> {
  const db = createAdminSupabaseClient();
  const { error } = await db
    .from("ordini")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", ordineId)
    .not("deleted_at", "is", null);
  if (error) {
    throw new Error(error.message ?? "Impossibile ripristinare l'ordine.");
  }
}

// ── Eliminazione DEFINITIVA dal Cestino (pattern negozi) ─────────────────────

/** Riga minima di ordine eliminato definitivamente (per il log attività). */
export type OrdineEliminatoDefinitivo = {
  id: string;
  numero: string | null;
};

/**
 * Elimina i dati collegati agli ordini nell'ordine richiesto dalle FK reali
 * (stesso pattern di eliminaDatiCollegatiANegozi):
 *   1. ordini_righe           (FK CASCADE)
 *   2. ordini_eventi          (FK CASCADE)
 *   3. ordine_reclami         (FK CASCADE → trascina reclamo_comunicazioni)
 *   4. pagamenti_sessioni     (FK CASCADE)
 *   5. pagamenti_eventi       (FK SET NULL: qui DELETE ESPLICITO perché è una
 *      vera eliminazione definitiva dal Cestino)
 * Ogni passo verifica l'errore: se uno fallisce viene lanciato un errore
 * (l'operazione è segnalata, mai silenziosa).
 */
async function eliminaDatiCollegatiAdOrdini(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  ordineIds: string[]
): Promise<void> {
  const { error: errRighe } = await supabase
    .from("ordini_righe")
    .delete()
    .in("ordine_id", ordineIds);
  if (errRighe) {
    throw new Error(errRighe.message ?? "Impossibile eliminare le righe dell'ordine.");
  }

  const { error: errEventi } = await supabase
    .from("ordini_eventi")
    .delete()
    .in("ordine_id", ordineIds);
  if (errEventi) {
    throw new Error(errEventi.message ?? "Impossibile eliminare gli eventi dell'ordine.");
  }

  const { error: errReclami } = await supabase
    .from("ordine_reclami")
    .delete()
    .in("ordine_id", ordineIds);
  if (errReclami) {
    throw new Error(errReclami.message ?? "Impossibile eliminare i reclami dell'ordine.");
  }

  const { error: errSessioni } = await supabase
    .from("pagamenti_sessioni")
    .delete()
    .in("ordine_id", ordineIds);
  if (errSessioni) {
    throw new Error(errSessioni.message ?? "Impossibile eliminare le sessioni di pagamento.");
  }

  const { error: errEventiPagamento } = await supabase
    .from("pagamenti_eventi")
    .delete()
    .in("ordine_id", ordineIds);
  if (errEventiPagamento) {
    throw new Error(errEventiPagamento.message ?? "Impossibile eliminare gli eventi di pagamento.");
  }
}

/**
 * Elimina DEFINITIVAMENTE un ordine dal database — SOLO se è nel Cestino
 * (deleted_at non null). Elimina prima i dati collegati (righe, eventi,
 * reclami, pagamenti) nell'ordine corretto per l'integrità referenziale.
 * Azione distruttiva e irreversibile, riservata all'amministratore.
 * Un ordine attivo (non cestinato) non viene MAI toccato.
 */
export async function eliminaOrdineDefinitivo(ordineId: string): Promise<void> {
  const supabase = createAdminSupabaseClient();

  // Guardia PRIMA di eliminare i dipendenti: se l'ordine non è nel Cestino
  // non si cancella nulla (evita figli orfani su un ordine attivo).
  const { data: verifica } = await supabase
    .from("ordini")
    .select("id")
    .eq("id", ordineId)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (!verifica) {
    throw new Error("L'ordine non è nel Cestino o non esiste.");
  }

  await eliminaDatiCollegatiAdOrdini(supabase, [ordineId]);

  const { error } = await supabase
    .from("ordini")
    .delete()
    .eq("id", ordineId)
    .not("deleted_at", "is", null);
  if (error) {
    throw new Error(error.message ?? "Impossibile eliminare definitivamente l'ordine.");
  }
}

/**
 * Elimina DEFINITIVAMENTE TUTTI gli ordini presenti nel Cestino
 * (deleted_at non null), con i dati collegati. Stesse protezioni
 * dell'eliminazione singola: un ordine attivo (o ripristinato nel
 * frattempo) non viene MAI toccato. Ritorna gli ordini realmente eliminati
 * (id + numero) per il log attività.
 */
export async function eliminaOrdiniDalCestino(): Promise<OrdineEliminatoDefinitivo[]> {
  const supabase = createAdminSupabaseClient();

  // Recupera gli ordini nel Cestino (id + numero per il log attività).
  const { data: cestino, error: erroreLista } = await supabase
    .from("ordini")
    .select("id, numero")
    .not("deleted_at", "is", null);
  if (erroreLista) {
    throw new Error(erroreLista.message ?? "Impossibile recuperare il cestino ordini.");
  }

  const ordini = (cestino ?? []) as OrdineEliminatoDefinitivo[];
  if (ordini.length === 0) return [];

  const ids = ordini.map((o) => o.id);
  await eliminaDatiCollegatiAdOrdini(supabase, ids);

  // Elimina SOLO gli ordini ancora nel Cestino (deleted_at non null):
  // un ordine ripristinato nel frattempo non viene mai toccato.
  const { data: eliminati, error } = await supabase
    .from("ordini")
    .delete()
    .in("id", ids)
    .not("deleted_at", "is", null)
    .select("id");
  if (error) {
    throw new Error(error.message ?? "Impossibile eliminare definitivamente gli ordini.");
  }

  const eliminatiIds = new Set((eliminati ?? []).map((r) => r.id));
  return ordini.filter((o) => eliminatiIds.has(o.id));
}
