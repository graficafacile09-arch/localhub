/**
 * SERVIZIO ORDINI AREA VENDITORE — LETTURA + GESTIONE STATO.
 *
 * Fonte definitiva: Supabase (tabella ordini + ordini_righe + ordini_eventi,
 * snapshot già presenti nel DB). Nessun localStorage, nessun dato demo.
 *
 * OWNERSHIP (fondamentale):
 *   - Ogni funzione verifica PRIMA che l'utente possa gestire il negozio
 *     (canManageStore: negozi.owner_user_id = utente, oppure admin
 *     autorizzato). Poi applica SEMPRE un filtro server-side su negozio_id:
 *     un venditore NON può vedere/modificare ordini di altri negozi
 *     cambiando un ID nell'URL o nella request.
 *   - Il CAMBIO STATO passa dalla RPC `aggiorna_stato_ordine` (service role,
 *     migrazione 20260815) che ri-verifica l'ownership ATOMICAMENTE e
 *     implementa la macchina a stati + ripristino stock, quindi il client
 *     NON può mai manipolare né lo stato né lo stock direttamente.
 *
 * EMAIL BEST-EFFORT:
 *   - Dopo un cambio stato riuscito viene inviata al cliente l'email di
 *     aggiornamento (Resend). Un errore email NON fallisce mai l'operazione
 *     di stato: ordine/stato restano validi, l'errore è solo loggato.
 *   - Nessuna email duplicata: inviata SOLO quando la RPC riporta
 *     `cambiato: true` (retry con lo stesso stato → no-op → nessuna email).
 *
 * LETTO/NON LETTO:
 *   - All'apertura del dettaglio l'ordine viene marcato letto (letto_at),
 *     così la lista può mostrare l'indicazione "nuovo/non letto".
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inviaEmailAggiornamentoStatoOrdine } from "@/lib/cliente/ordine-email";
import type { RigaOrdine, StatoOrdine } from "@/lib/cliente/types";
import { canManageStore } from "./data";
import { prioritaStato, statiPerFiltro, type FiltroOrdini } from "./ordini-stati";

/** Client DB strutturale minimo (per iniettare un fake nei test). */
export type OrdiniVenditoreDbClient = {
  from: (tabella: string) => any;
};

type OrdineRow = Record<string, unknown>;
type RigaRow = Record<string, unknown>;
type EventoRow = Record<string, unknown>;

/** Riga della lista ordini venditore (snapshot dal DB, nessuna join). */
export type OrdineVenditoreLista = {
  id: string;
  numero: string;
  stato: StatoOrdine;
  totale: number;
  costoSpedizione: number;
  createdAt: string;
  modalita: "ritiro" | "spedizione";
  negozioId: string;
  negozioNome: string;
  clienteNome: string;
  clienteCognome: string;
  clienteTelefono: string | null;
  note: string | null;
  numeroRighe: number;
  lettoAt: string | null;
};

/** Evento dello storico ordine (tabella ordini_eventi). */
export type EventoOrdine = {
  id: string;
  evento: string;
  dettaglio: string | null;
  motivo: string | null;
  nota: string | null;
  createdAt: string;
};

/** Dettaglio completo ordine (area venditore). */
export type OrdineVenditoreDettaglio = OrdineVenditoreLista & {
  clienteEmail: string | null;
  ritiroData: string | null;
  ritiroFascia: string | null;
  spedizioneIndirizzo: string | null;
  spedizioneCap: string | null;
  spedizioneCitta: string | null;
  spedizioneProvincia: string | null;
  spedizioneNote: string | null;
  metodoSpedizione: "standard" | "express" | null;
  metodoPagamento: "carta" | "paypal" | "bonifico" | null;
  annullatoMotivo: string | null;
  annullatoNota: string | null;
  annullatoAt: string | null;
  righe: RigaOrdine[];
  eventi: EventoOrdine[];
};

/** Esito di un cambio stato. */
export type EsitoAggiornamentoStato =
  | { ok: true; cambiato: boolean; ordine: OrdineVenditoreDettaglio | null }
  | { ok: false; codice: string; messaggio: string; status: number };

/** HTTP status associato a ciascun codice d'errore della RPC. */
const STATUS_DA_CODICE: Record<string, number> = {
  VALIDATION_ERROR: 422,
  ORDINE_NON_TROVATO: 404,
  FORBIDDEN: 403,
  TRANSIZIONE_NON_CONSENTITA: 409,
  MOTIVO_OBBLIGATORIO: 422,
  SAVE_FAILED: 500,
};

/** Converte una riga ordini_righe nella forma tipizzata. */
function mappaRiga(row: RigaRow): RigaOrdine {
  return {
    prodottoId: String(row.prodotto_id),
    nomeProdotto: String(row.nome_prodotto ?? ""),
    prezzoUnitario: Number(row.prezzo_unitario ?? 0),
    quantita: Number(row.quantita ?? 1),
    immagineUrl: (row.immagine_url as string | null) ?? null,
  };
}

/** Converte una riga ordini_eventi nella forma tipizzata. */
function mappaEvento(row: EventoRow): EventoOrdine {
  return {
    id: String(row.id),
    evento: String(row.evento ?? ""),
    dettaglio: (row.dettaglio as string | null) ?? null,
    motivo: (row.motivo as string | null) ?? null,
    nota: (row.nota as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

/** Converte una riga ordini nella forma "lista" (area venditore). */
function mappaLista(row: OrdineRow, numeroRighe = 0): OrdineVenditoreLista {
  return {
    id: String(row.id),
    numero: String(row.numero ?? ""),
    stato: (row.stato as StatoOrdine) ?? "in_preparazione",
    totale: Number(row.totale ?? 0),
    costoSpedizione: Number(row.costo_spedizione ?? 0),
    createdAt: String(row.created_at ?? ""),
    modalita: (row.modalita as "ritiro" | "spedizione") ?? "ritiro",
    negozioId: String(row.negozio_id ?? ""),
    negozioNome: String(row.negozio_nome ?? ""),
    clienteNome: String(row.cliente_nome ?? ""),
    clienteCognome: String(row.cliente_cognome ?? ""),
    clienteTelefono: (row.cliente_telefono as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    numeroRighe,
    lettoAt: (row.letto_at as string | null) ?? null,
  };
}

/** Converte una riga ordini nella forma "dettaglio". */
function mappaDettaglio(row: OrdineRow, righe: RigaOrdine[], eventi: EventoOrdine[]): OrdineVenditoreDettaglio {
  return {
    ...mappaLista(row, righe.length),
    clienteEmail: (row.cliente_email as string | null) ?? null,
    ritiroData: (row.ritiro_data as string | null) ?? null,
    ritiroFascia: (row.ritiro_fascia as string | null) ?? null,
    spedizioneIndirizzo: (row.spedizione_indirizzo as string | null) ?? null,
    spedizioneCap: (row.spedizione_cap as string | null) ?? null,
    spedizioneCitta: (row.spedizione_citta as string | null) ?? null,
    spedizioneProvincia: (row.spedizione_provincia as string | null) ?? null,
    spedizioneNote: (row.spedizione_note as string | null) ?? null,
    metodoSpedizione: (row.metodo_spedizione as "standard" | "express" | null) ?? null,
    metodoPagamento: (row.metodo_pagamento as "carta" | "paypal" | "bonifico" | null) ?? null,
    annullatoMotivo: (row.annullato_motivo as string | null) ?? null,
    annullatoNota: (row.annullato_nota as string | null) ?? null,
    annullatoAt: (row.annullato_at as string | null) ?? null,
    righe,
    eventi,
  };
}

/** Client corretto per la LETTURA (RLS: merchant → solo i propri ordini). */
async function getReadDb() {
  return await createServerSupabaseClient();
}

/**
 * Elenco degli ordini del negozio (SOLO se l'utente può gestirlo).
 * Ordinamento: prima i nuovi, poi in lavorazione, poi conclusi; a parità
 * di priorità il più recente prima (stessa regola di ordini-stati.ts).
 * Il filtro (Tutti/Nuovi/In lavorazione/Pronti/Completati/Annullati) limita
 * gli stati restituiti lato DB.
 */
/** Opzioni testabili del servizio (ownership pre-valutata). */
export type OpzioniOrdiniVenditore = {
  client?: OrdiniVenditoreDbClient;
  /** Override di canManageStore per i test (undefined → query reale). */
  puòGestire?: boolean;
};

/** Verifica l'ownership: override testabile oppure query reale. */
async function verificaOwnership(opts: OpzioniOrdiniVenditore, userId: string, negozioId: string): Promise<boolean> {
  if (opts.puòGestire !== undefined) return opts.puòGestire;
  return canManageStore(userId, negozioId);
}

export async function getOrdiniVenditore(
  userId: string,
  negozioId: string,
  filtro?: FiltroOrdini | null,
  opts: OpzioniOrdiniVenditore = {}
): Promise<OrdineVenditoreLista[]> {
  const puòGestire = await verificaOwnership(opts, userId, negozioId);
  if (!puòGestire) return [];

  const db = (opts.client ?? (await getReadDb())) as OrdiniVenditoreDbClient;
  const stati = filtro ? statiPerFiltro(filtro) : [];

  let query = db.from("ordini").select("*").eq("negozio_id", negozioId);
  if (stati.length > 0) query = query.in("stato", stati);
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Lettura ordini fallita: ${error.message}`);
  }
  const ordini = (data ?? []) as OrdineRow[];

  // Conteggio righe in UN'UNICA query (nessun N+1).
  const conteggi = new Map<string, number>();
  if (ordini.length > 0) {
    const { data: righeIds, error: errRighe } = await db
      .from("ordini_righe")
      .select("ordine_id")
      .in("ordine_id", ordini.map((o) => String(o.id)));
    if (!errRighe) {
      for (const r of (righeIds ?? []) as Array<{ ordine_id: unknown }>) {
        const id = String(r.ordine_id);
        conteggi.set(id, (conteggi.get(id) ?? 0) + 1);
      }
    }
  }

  const lista = ordini.map((o) => mappaLista(o, conteggi.get(String(o.id)) ?? 0));
  // Ordinamento stabile: priorità di stato, poi più recenti (già ordinati).
  lista.sort((a, b) => {
    const diff = prioritaStato(a.stato) - prioritaStato(b.stato);
    if (diff !== 0) return diff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return lista;
}

/**
 * Dettaglio di un ordine del negozio CON verifica di ownership server-side
 * (canManageStore + filtro negozio_id). All'apertura l'ordine viene marcato
 * "letto" (letto_at) — scrittura via admin client, mai esposta all'utente.
 * Restituisce null se l'ordine non esiste o non appartiene al negozio.
 */
export async function getOrdineVenditore(
  userId: string,
  negozioId: string,
  ordineId: string,
  opts: OpzioniOrdiniVenditore = {}
): Promise<OrdineVenditoreDettaglio | null> {
  const puòGestire = await verificaOwnership(opts, userId, negozioId);
  if (!puòGestire) return null;

  const db = (opts.client ?? (await getReadDb())) as OrdiniVenditoreDbClient;

  const { data, error } = await db
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .eq("negozio_id", negozioId)
    .maybeSingle();

  if (error) {
    throw new Error(`Lettura ordine fallita: ${error.message}`);
  }
  if (!data) return null;

  const ordineRow = data as OrdineRow;

  // Righe + eventi (letture parallele indipendenti).
  const [righeResult, eventiResult] = await Promise.all([
    db.from("ordini_righe").select("*").eq("ordine_id", ordineId).order("created_at", { ascending: true }),
    db.from("ordini_eventi").select("*").eq("ordine_id", ordineId).order("created_at", { ascending: true }),
  ]);
  const righe = (righeResult.data ?? []).map((r: RigaRow) => mappaRiga(r));
  const eventi = (eventiResult.data ?? []).map((r: EventoRow) => mappaEvento(r));

  // Marca come letto (best-effort): prima apertura del dettaglio.
  try {
    const adminDb = createAdminSupabaseClient();
    await adminDb
      .from("ordini")
      .update({ letto_at: new Date().toISOString() })
      .eq("id", ordineId)
      .eq("negozio_id", negozioId)
      .is("letto_at", null);
  } catch (err) {
    console.error("[ordini-venditore] marcatura letto fallita:", (err as Error)?.message);
  }

  return mappaDettaglio(ordineRow, righe, eventi);
}

/**
 * Cambio stato ordine (area venditore).
 * - Verifica ownership (canManageStore);
 * - chiama la RPC `aggiorna_stato_ordine` (service role) che gestisce
 *   ATOMICAMENTE: lock riga, macchina a stati, motivo obbligatorio per
 *   l'annullamento, ripristino stock e storico eventi;
 * - se la RPC riporta `cambiato: true`, invia l'email di aggiornamento al
 *   cliente (BEST-EFFORT: un errore email non fallisce mai l'operazione).
 */
export async function aggiornaStatoOrdineVenditore(
  userId: string,
  negozioId: string,
  ordineId: string,
  nuovoStato: StatoOrdine,
  opts: { motivo?: string | null; nota?: string | null } = {}
): Promise<EsitoAggiornamentoStato> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) {
    return { ok: false, codice: "FORBIDDEN", messaggio: "Non puoi gestire questo ordine.", status: 403 };
  }

  const adminDb = createAdminSupabaseClient();
  const { data, error } = await adminDb.rpc("aggiorna_stato_ordine", {
    p_ordine_id: ordineId,
    p_nuovo_stato: nuovoStato,
    p_motivo: opts.motivo ?? null,
    p_nota: opts.nota ?? null,
    p_merchant_user_id: userId,
  });

  if (error) {
    console.error("[ordini-venditore] RPC aggiorna_stato_ordine fallita:", error.message);
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile aggiornare l'ordine.", status: 500 };
  }

  const esito = data as unknown as {
    ok: boolean;
    cambiato?: boolean;
    ordine?: Record<string, unknown>;
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

  // ── Email al cliente (BEST-EFFORT, SOLO se lo stato è davvero cambiato:
  //    retry idempotente → cambiato:false → nessuna email duplicata). ──────
  const cambiato = esito.cambiato ?? false;
  if (cambiato) {
    await inviaEmailAggiornamentoStatoOrdine(ordineId).catch(() => {});
  }

  // Ricarica il dettaglio aggiornato (marcato letto? no: lo stato nuovo va
  // restituito; il refresh della pagina farà comunque una nuova lettura).
  let dettaglio: OrdineVenditoreDettaglio | null = null;
  try {
    dettaglio = await getOrdineVenditore(userId, negozioId, ordineId, { puòGestire: true });
  } catch {
    dettaglio = null;
  }

  return { ok: true, cambiato, ordine: dettaglio };
}
