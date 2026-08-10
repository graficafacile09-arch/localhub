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
  etichettaModalita,
  etichettaStato,
  formattaDataOrdine,
} from "./ordini-format";
import type {
  OrdineClienteDettaglio,
  OrdineClienteLista,
  RigaOrdine,
  StatoOrdine,
} from "./types";

// Ri-esportazione dei formattatori puri (i server component continuano a
// importarli da qui; i client component li importano da ./ordini-format).
export { etichettaModalita, etichettaStato, formattaDataOrdine };

export type { StatoOrdine } from "./types";

/** Client DB strutturale minimo (per iniettare un fake nei test). */
export type OrdiniDbClient = {
  from: (tabella: string) => any;
};

type OrdineRow = Record<string, unknown>;
type RigaRow = Record<string, unknown>;

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

/** Converte una riga ordini nella forma \"lista\" (Area Clienti). */
function mappaLista(row: OrdineRow): OrdineClienteLista {
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
  };
}

/** Converte una riga ordini nella forma \"dettaglio\" (con righe). */
function mappaDettaglio(row: OrdineRow, righe: RigaOrdine[]): OrdineClienteDettaglio {
  return {
    ...mappaLista(row),
    email: (row.cliente_email as string | null) ?? null,
    telefono: (row.cliente_telefono as string | null) ?? null,
    metodoSpedizione: (row.metodo_spedizione as "standard" | "express" | null) ?? null,
    metodoPagamento:
      (row.metodo_pagamento as "carta" | "paypal" | "bonifico" | null) ?? null,
    spedizioneIndirizzo: (row.spedizione_indirizzo as string | null) ?? null,
    spedizioneCap: (row.spedizione_cap as string | null) ?? null,
    spedizioneCitta: (row.spedizione_citta as string | null) ?? null,
    spedizioneProvincia: (row.spedizione_provincia as string | null) ?? null,
    spedizioneNote: (row.spedizione_note as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    righe,
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
  return (data ?? []).map((r: OrdineRow) => mappaLista(r));
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

  const righe = await caricaRighe(db, ordineId);
  return mappaDettaglio(data as OrdineRow, righe);
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

  const righe = await caricaRigheGuest(db, (data ?? []).map((r: OrdineRow) => String(r.id)));
  const righePerOrdine = new Map<string, RigaOrdine[]>();
  for (const r of righe) {
    const lista = righePerOrdine.get(r.ordineId) ?? [];
    lista.push(r);
    righePerOrdine.set(r.ordineId, lista);
  }

  return (data ?? []).map((r: OrdineRow) =>
    mappaDettaglio(r, righePerOrdine.get(String(r.id)) ?? [])
  );
}

/** Righe di più ordini in un'unica query (per il recupero guest). */
async function caricaRigheGuest(
  db: OrdiniDbClient,
  ordineIds: string[]
): Promise<Array<RigaOrdine & { ordineId: string }>> {
  if (ordineIds.length === 0) return [];
  const { data, error } = await db
    .from("ordini_righe")
    .select("*")
    .in("ordine_id", ordineIds);

  if (error) {
    throw new Error(`Lettura righe ordini fallita: ${error.message}`);
  }
  return (data ?? []).map((r: RigaRow) => ({
    ordineId: String(r.ordine_id),
    ...mappaRiga(r),
  }));
}
