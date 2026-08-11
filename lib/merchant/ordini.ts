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
import type { EventoOrdine, RigaOrdine, StatoOrdine } from "@/lib/cliente/types";
import { canManageStore } from "./data";
import { prioritaStato, statiPerFiltro, type FiltroOrdini } from "./ordini-stati";

// Ri-esportazione del tipo condiviso (le pagine importano EventoOrdine da
// questo modulo; la definizione canonica è in lib/cliente/types.ts).
export type { EventoOrdine };

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
  /** True se l'ordine ha almeno un reclamo ATTIVO (aperto/in gestione). */
  haReclamoAperto: boolean;
  /** Righe prodotto (per la sintesi in lista e il dettaglio). */
  righe: RigaOrdine[];
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

/** Converte una riga ordini nella forma "lista" (area venditore). */
function mappaLista(row: OrdineRow, righe: RigaOrdine[] = []): OrdineVenditoreLista {
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
    numeroRighe: righe.length,
    lettoAt: (row.letto_at as string | null) ?? null,
    haReclamoAperto: false,
    righe,
  };
}

/** Converte una riga ordini nella forma "dettaglio". */
function mappaDettaglio(row: OrdineRow, righe: RigaOrdine[], eventi: EventoOrdine[]): OrdineVenditoreDettaglio {
  return {
    ...mappaLista(row, righe),
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

/** Opzioni testabili del cambio stato (RPC, email, evento iniettati). */
export type OpzioniAggiornaStatoOrdine = {
  client?: OrdiniVenditoreDbClient;
  /** Override di canManageStore per i test. */
  puòGestire?: boolean;
  /** Override della RPC aggiorna_stato_ordine per i test. */
  rpc?: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  /** Override dell'email di aggiornamento stato per i test. */
  inviaEmail?: (ordineId: string) => Promise<{ stato: string; motivo: string }>;
  /** Client usato per registrare l'evento di email non inviata. */
  eventiClient?: OrdiniVenditoreDbClient;
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

  // Righe di TUTTI gli ordini in un'unica query (nessun N+1): nome, foto,
  // quantità e prezzo per la sintesi nelle card della lista.
  const righePerOrdine = new Map<string, RigaOrdine[]>();
  if (ordini.length > 0) {
    const { data: righeData, error: errRighe } = await db
      .from("ordini_righe")
      .select("*")
      .in("ordine_id", ordini.map((o) => String(o.id)))
      .order("created_at", { ascending: true });
    if (!errRighe) {
      for (const r of (righeData ?? []) as RigaRow[]) {
        const id = String(r.ordine_id);
        const lista = righePerOrdine.get(id) ?? [];
        lista.push(mappaRiga(r));
        righePerOrdine.set(id, lista);
      }
    }
  }

  const lista = ordini.map((o) =>
    mappaLista(o, righePerOrdine.get(String(o.id)) ?? [])
  );

  // Reclami ATTIVI degli ordini elencati (best-effort: se la tabella non
  // esiste o la query fallisce, la lista non deve rompersi).
  try {
    if (lista.length > 0) {
      const { data: reclamiIds } = await db
        .from("ordine_reclami")
        .select("ordine_id")
        .in("ordine_id", lista.map((o) => o.id))
        .in("stato", ["aperto", "in_gestione"]);
      const conReclamo = new Set(
        ((reclamiIds ?? []) as Array<{ ordine_id: unknown }>).map((r) => String(r.ordine_id))
      );
      for (const ordine of lista) {
        ordine.haReclamoAperto = conReclamo.has(ordine.id);
      }
    }
  } catch (err) {
    console.error("[ordini-venditore] lettura reclami attivi fallita (best-effort):", (err as Error)?.message);
  }

  // Ordinamento stabile: priorità di stato, poi più recenti (già ordinati).
  lista.sort((a, b) => {
    const diff = prioritaStato(a.stato) - prioritaStato(b.stato);
    if (diff !== 0) return diff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return lista;
}

/**
 * Conteggio degli ordini NON LETTI (letto_at null) per ciascun negozio.
 * Usato dai badge di navigazione ("Ordini [3]" in sidebar e bottom nav).
 * Le query girano con RLS (client server): il venditore vede SOLO i propri
 * ordini, quindi il conteggio è già limitato ai negozi di sua proprietà.
 * Best-effort: un errore non deve far fallire la navigazione.
 */
export async function getConteggiOrdiniNonLetti(
  negozioIds: string[],
  client?: OrdiniVenditoreDbClient
): Promise<Record<string, number>> {
  const ids = (negozioIds ?? []).filter(Boolean);
  if (ids.length === 0) return {};
  try {
    const db = (client ?? (await getReadDb())) as OrdiniVenditoreDbClient;
    const { data, error } = await db
      .from("ordini")
      .select("negozio_id")
      .in("negozio_id", ids)
      .is("letto_at", null);
    if (error) {
      console.error(`[ordini-venditore] conteggio non letti fallito: ${error.message}`);
      return {};
    }
    const conteggi: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ negozio_id: unknown }>) {
      const id = String(r.negozio_id);
      conteggi[id] = (conteggi[id] ?? 0) + 1;
    }
    return conteggi;
  } catch (err) {
    console.error(`[ordini-venditore] conteggio non letti (eccezione): ${(err as Error)?.message}`);
    return {};
  }
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
 *   cliente (BEST-EFFORT: un errore email non fallisce mai l'operazione) e
 *   se l'email non parte registra la mancata consegna in `ordini_eventi`.
 */
export async function aggiornaStatoOrdineVenditore(
  userId: string,
  negozioId: string,
  ordineId: string,
  nuovoStato: StatoOrdine,
  opts: { motivo?: string | null; nota?: string | null } & OpzioniAggiornaStatoOrdine = {}
): Promise<EsitoAggiornamentoStato> {
  const puòGestire =
    opts.puòGestire !== undefined ? opts.puòGestire : await canManageStore(userId, negozioId);
  if (!puòGestire) {
    return { ok: false, codice: "FORBIDDEN", messaggio: "Non puoi gestire questo ordine.", status: 403 };
  }

  const chiamaRpc =
    opts.rpc ??
    ((fn: string, params: Record<string, unknown>) =>
      (createAdminSupabaseClient() as any).rpc(fn, params));
  const { data, error } = await chiamaRpc("aggiorna_stato_ordine", {
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
  // L'esito NON viene mai ignorato: se l'email non parte (errore Resend,
  // email cliente assente/non valida) la mancata consegna viene REGISTRATA
  // in ordini_eventi, così non si perde mai l'informazione e il venditore
  // la vede nello storico dell'ordine.
  const cambiato = esito.cambiato ?? false;
  if (cambiato) {
    const esitoEmail = opts.inviaEmail
      ? await opts.inviaEmail(ordineId).catch((err) => {
          console.error(`[ordini-venditore] eccezione email per ${ordineId}:`, (err as Error)?.message);
          return { stato: "error", motivo: "eccezione" } as const;
        })
      : await inviaEmailAggiornamentoStatoOrdine(ordineId).catch((err) => {
          console.error(`[ordini-venditore] eccezione email per ${ordineId}:`, (err as Error)?.message);
          return { stato: "error", motivo: "eccezione" } as const;
        });

    if (esitoEmail.stato !== "sent") {
      // Type guard esplicito: la union include un ramo con `stato: string`
      // (override dei test) e uno "sent" senza `motivo` — mai assumere il
      // narrowing automatico.
      const motivoEmail = "motivo" in esitoEmail ? esitoEmail.motivo : "sconosciuto";

      // Stati che NON prevedono email al cliente (es. in_lavorazione,
      // in_consegna) → "stato_non_notificato" NON è una mancata consegna:
      // nessun evento fuorviante nello storico. Si registra solo la mancata
      // consegna REALE (errore Resend, email assente/non valida, ecc.).
      if (motivoEmail !== "stato_non_notificato") {
        console.error(
          `[ordini-venditore] ordine ${ordineId}: email di stato NON inviata (${esitoEmail.stato}: ${motivoEmail})`
        );
        await registraEmailStatoNonInviata(
          ordineId,
          nuovoStato,
          { stato: esitoEmail.stato, motivo: motivoEmail },
          opts.eventiClient
        ).catch(() => {});
      }
    }
  }

  // Ricarica il dettaglio aggiornato (marcato letto? no: lo stato nuovo va
  // restituito; il refresh della pagina farà comunque una nuova lettura).
  let dettaglio: OrdineVenditoreDettaglio | null = null;
  try {
    dettaglio = await getOrdineVenditore(userId, negozioId, ordineId, {
      puòGestire: true,
      client: opts.client,
    });
  } catch {
    dettaglio = null;
  }

  return { ok: true, cambiato, ordine: dettaglio };
}

/**
 * REGISTRAZIONE DELLA MANCATA CONSEGNA EMAIL (mai persa):
 * quando l'email di aggiornamento stato non parte, viene inserito un evento
 * in `ordini_eventi` (la stessa tabella dello storico già visibile nel
 * dettaglio venditore) con evento = "email_stato_non_inviata" e il motivo
 * della mancata consegna. Best-effort: un errore qui NON fa fallire mai
 * l'operazione di stato. Nessuna email duplicata nei retry: la RPC riporta
 * cambiato=false per lo stesso stato → qui non si arriva.
 */
async function registraEmailStatoNonInviata(
  ordineId: string,
  stato: string,
  esito: { stato: string; motivo: string },
  eventiClient?: OrdiniVenditoreDbClient
): Promise<void> {
  try {
    const adminDb = (eventiClient ?? createAdminSupabaseClient()) as OrdiniVenditoreDbClient;
    await adminDb.from("ordini_eventi").insert({
      ordine_id: ordineId,
      evento: "email_stato_non_inviata",
      dettaglio: `Email di stato non inviata (${esito.stato})`,
      motivo: stato,
      nota: esito.motivo,
    });
    console.warn(
      `[ordini-venditore] ordine ${ordineId}: mancata consegna email registrata nello storico (motivo: ${esito.motivo})`
    );
  } catch (err) {
    console.error(
      `[ordini-venditore] ordine ${ordineId}: registrazione mancata email fallita: ${(err as Error)?.message}`
    );
  }
}
