/**
 * Servizio Ordini dell'Area Clienti — LETTURA.
 *
 * Fonte definitiva: Supabase (tabella ordini + ordini_righe, snapshot già
 * presenti nel DB). Nessun localStorage, nessuna ricostruzione dal checkout,
 * nessun dato demo. Tutte le funzioni applicano SEMPRE un filtro
 * server-side sull'identità:
 *   - getOrdiniCliente:  cliente_user_id = utente autenticato (sessione);
 *   - getOrdineCliente:  id = ordineId AND cliente_user_id = utente — un
 *     cliente NON può vedere l'ordine di un altro modificando l'URL;
 *   - recuperaOrdiniGuest: email AND telefono dell'ordine — mai accesso al
 *     solo UUID, mai elenco completo nel browser.
 *
 * L'RLS della tabella è una rete di sicurezza aggiuntiva (self select); la
 * verifica esplicita qui garantisce l'ownership anche se le policy cambiassero.
 *
 * Il client Supabase usa la sessione dell'utente (cookie httpOnly): le query
 * girano con i permessi dell'utente loggato, mai con il service role.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  configStatoOrdine,
  etichettaModalita,
  etichettaStato,
  formattaDataOraEvento,
  formattaDataOrdine,
  sintesiProdotti,
} from "./ordini-format";
import type {
  EventoOrdine,
  OrdineClienteDettaglio,
  OrdineClienteLista,
  RigaOrdine,
  StatoOrdine,
} from "./types";

// Ri-esportazione dei formattatori puri (i server component continuano a
// importarli da qui; i client component li importano da ./ordini-format).
export {
  configStatoOrdine,
  etichettaModalita,
  etichettaStato,
  formattaDataOraEvento,
  formattaDataOrdine,
  sintesiProdotti,
};

export type { StatoOrdine } from "./types";

/** Client DB strutturale minimo (per iniettare un fake nei test). */
export type OrdiniDbClient = {
  from: (tabella: string) => any;
};

type OrdineRow = Record<string, unknown>;
type RigaRow = Record<string, unknown>;
type EventoRow = Record<string, unknown>;

/** Converte una riga ordini_righe nella forma tipizzata. */
function mappaRiga(row: RigaRow): RigaOrdine {
  return {
    prodottoId: String(row.prodotto_id),
    nomeProdotto: String(row.nome_prodotto ?? ""),
    prezzoUnitario: Number(row.prezzo_unitario ?? 0),
    quantita: Number(row.quantita ?? 1),
    immagineUrl: (row.immagine_url as string | null) ?? null,
    varianteNome: (row.variante_nome as string | null) ?? null,
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

/** Converte una riga ordini nella forma \"lista\" (Area Clienti). */
function mappaLista(row: OrdineRow, righe: RigaOrdine[] = []): OrdineClienteLista {
  return {
    id: String(row.id),
    numero: String(row.numero ?? ""),
    stato: (row.stato as StatoOrdine) ?? "in_preparazione",
    totale: Number(row.totale ?? 0),
    costoSpedizione: Number(row.costo_spedizione ?? 0),
    createdAt: String(row.created_at ?? ""),
    modalita: (row.modalita as "ritiro" | "spedizione") ?? "ritiro",
    negozioNome: String(row.negozio_nome ?? ""),
    ritiroData: (row.ritiro_data as string | null) ?? null,
    ritiroFascia: (row.ritiro_fascia as string | null) ?? null,
    righe,
  };
}

/** Converte una riga ordini nella forma \"dettaglio\" (con righe). */
function mappaDettaglio(
  row: OrdineRow,
  righe: RigaOrdine[],
  eventi: EventoOrdine[]
): OrdineClienteDettaglio {
  return {
    ...mappaLista(row, righe),
    email: (row.cliente_email as string | null) ?? null,
    telefono: (row.cliente_telefono as string | null) ?? null,
    metodoSpedizione: (row.metodo_spedizione as "standard" | "express" | null) ?? null,
    spedizioneCarrier: (row.spedizione_carrier as string | null) ?? null,
    spedizioneServizio: (row.spedizione_servizio as string | null) ?? null,
    spedizionePesoGrammi: (row.spedizione_peso_grammi as number | null) ?? null,
    spedizioneTariffaVersione: (row.spedizione_tariffa_versione as string | null) ?? null,
    metodoPagamento:
      (row.metodo_pagamento as "carta" | "paypal" | "bonifico" | null) ?? null,
    paymentProvider: (row.payment_provider as string | null) ?? null,
    spedizioneIndirizzo: (row.spedizione_indirizzo as string | null) ?? null,
    spedizioneCap: (row.spedizione_cap as string | null) ?? null,
    spedizioneCitta: (row.spedizione_citta as string | null) ?? null,
    spedizioneProvincia: (row.spedizione_provincia as string | null) ?? null,
    spedizioneNote: (row.spedizione_note as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    annullatoMotivo: (row.annullato_motivo as string | null) ?? null,
    annullatoNota: (row.annullato_nota as string | null) ?? null,
    annullatoAt: (row.annullato_at as string | null) ?? null,
    righe,
    eventi,
  };
}

/** Recupera le righe di un ordine (ordinate per creazione). */
async function caricaRighe(db: OrdiniDbClient, ordineId: string): Promise<RigaOrdine[]> {
  const { data, error } = await db
    .from("ordini_righe")
    .select("*")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Lettura righe ordine fallita: ${error.message}`);
  }
  return (data ?? []).map((r: RigaRow) => mappaRiga(r));
}

/**
 * Elenco degli ordini del cliente autenticato, dal più recente al più
 * vecchio. Filtro server-side: SOLO cliente_user_id = utente della sessione.
 * Le righe prodotto di TUTTI gli ordini vengono caricate in un'unica query
 * batch (nessun N+1), così la card può mostrare nome, foto, quantità e prezzo.
 */
export async function getOrdiniCliente(
  userId: string,
  client?: OrdiniDbClient
): Promise<OrdineClienteLista[]> {
  const db = (client ?? (await createServerSupabaseClient())) as OrdiniDbClient;

  const { data, error } = await db
    .from("ordini")
    .select("*")
    .eq("cliente_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Lettura ordini fallita: ${error.message}`);
  }
  const rows = (data ?? []) as OrdineRow[];

  // Righe di tutti gli ordini in un'unica query (nessun N+1).
  const righePerOrdine = new Map<string, RigaOrdine[]>();
  try {
    const batch = await caricaRigheBatch(db, rows.map((r) => String(r.id)));
    for (const riga of batch) {
      const lista = righePerOrdine.get(riga.ordineId) ?? [];
      lista.push(riga);
      righePerOrdine.set(riga.ordineId, lista);
    }
  } catch (err) {
    // Best-effort: la lista NON deve fallire se le righe non sono leggibili.
    console.error(`[ordini-cliente] lettura righe lista fallita: ${(err as Error)?.message}`);
  }

  return rows.map((r: OrdineRow) =>
    mappaLista(r, righePerOrdine.get(String(r.id)) ?? [])
  );
}

/**
 * Dettaglio di un ordine del cliente CON verifica di ownership server-side:
 * l'ordine viene restituito SOLO se cliente_user_id = utente della sessione
 * E id = ordineId. Altrimenti null (mai \"non autorizzato\" rivelatore).
 */
export async function getOrdineCliente(
  userId: string,
  ordineId: string,
  client?: OrdiniDbClient
): Promise<OrdineClienteDettaglio | null> {
  const db = (client ?? (await createServerSupabaseClient())) as OrdiniDbClient;

  const { data, error } = await db
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .eq("cliente_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Lettura ordine fallita: ${error.message}`);
  }
  if (!data) return null;

  // Righe + eventi (letture parallele indipendenti; la cronologia usa gli
  // stessi dati reali del trigger ordini_eventi).
  const [righe, eventi] = await Promise.all([
    caricaRighe(db, ordineId),
    caricaEventi(db, ordineId),
  ]);
  return mappaDettaglio(data as OrdineRow, righe, eventi);
}

/**
 * Recupero degli ordini GUEST (acquisti senza account).
 * Richiede email E telefono dell'ordine (entrambi): la corrispondenza
 * avviene SOLO lato server e non rivela ordini altrui né consente accesso
 * conoscendo solo un UUID. I pattern di ricerca vengono escapati (mai
 * wildcard dall'utente).
 */
export async function recuperaOrdiniGuest(
  email: string,
  telefono: string,
  client?: OrdiniDbClient
): Promise<OrdineClienteDettaglio[]> {
  const db = (client ?? (await createServerSupabaseClient())) as OrdiniDbClient;

  const emailPulita = String(email ?? "").trim().toLowerCase();
  const telefonoPulito = String(telefono ?? "").trim();
  if (!emailPulita || !telefonoPulito) return [];

  // Escape dei caratteri wildcard di LIKE/ILIKE.
  const escapeLike = (v: string) => v.replace(/[\\%_]/g, "\\$&");

  const { data, error } = await db
    .from("ordini")
    .select("*")
    .ilike("cliente_email", escapeLike(emailPulita))
    .eq("cliente_telefono", telefonoPulito)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Ricerca ordini fallita: ${error.message}`);
  }

  const ordineIds = (data ?? []).map((r: OrdineRow) => String(r.id));
  const [righe, eventi] = await Promise.all([
    caricaRigheGuest(db, ordineIds),
    caricaEventiGuest(db, ordineIds),
  ]);
  const righePerOrdine = new Map<string, RigaOrdine[]>();
  for (const r of righe) {
    const lista = righePerOrdine.get(r.ordineId) ?? [];
    lista.push(r);
    righePerOrdine.set(r.ordineId, lista);
  }
  const eventiPerOrdine = new Map<string, EventoOrdine[]>();
  for (const e of eventi) {
    const lista = eventiPerOrdine.get(e.ordineId) ?? [];
    lista.push(e);
    eventiPerOrdine.set(e.ordineId, lista);
  }

  return (data ?? []).map((r: OrdineRow) =>
    mappaDettaglio(r, righePerOrdine.get(String(r.id)) ?? [], eventiPerOrdine.get(String(r.id)) ?? [])
  );
}

/** Eventi di un ordine (per la cronologia del dettaglio). */
async function caricaEventi(db: OrdiniDbClient, ordineId: string): Promise<EventoOrdine[]> {
  const { data, error } = await db
    .from("ordini_eventi")
    .select("*")
    .eq("ordine_id", ordineId)
    .order("created_at", { ascending: true });

  if (error) {
    // Best-effort: la cronologia non deve mai far fallire il dettaglio.
    console.error(`[ordini-cliente] lettura eventi fallita: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r: EventoRow) => mappaEvento(r));
}

/** Righe di più ordini in un'unica query (per la lista). */
async function caricaRigheBatch(
  db: OrdiniDbClient,
  ordineIds: string[]
): Promise<Array<RigaOrdine & { ordineId: string }>> {
  if (ordineIds.length === 0) return [];
  const { data, error } = await db
    .from("ordini_righe")
    .select("*")
    .in("ordine_id", ordineIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Lettura righe ordini fallita: ${error.message}`);
  }
  return (data ?? []).map((r: RigaRow) => ({
    ordineId: String(r.ordine_id),
    ...mappaRiga(r),
  }));
}

/** Righe di più ordini in un'unica query (per il recupero guest). */
async function caricaRigheGuest(
  db: OrdiniDbClient,
  ordineIds: string[]
): Promise<Array<RigaOrdine & { ordineId: string }>> {
  return caricaRigheBatch(db, ordineIds);
}

/** Eventi di più ordini in un'unica query (per il recupero guest). */
async function caricaEventiGuest(
  db: OrdiniDbClient,
  ordineIds: string[]
): Promise<Array<EventoOrdine & { ordineId: string }>> {
  if (ordineIds.length === 0) return [];
  const { data, error } = await db
    .from("ordini_eventi")
    .select("*")
    .in("ordine_id", ordineIds);

  if (error) {
    console.error(`[ordini-cliente] lettura eventi guest fallita: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r: EventoRow) => ({
    ordineId: String(r.ordine_id),
    ...mappaEvento(r),
  }));
}
