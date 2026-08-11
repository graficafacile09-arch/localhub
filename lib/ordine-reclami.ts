/**
 * RECLAMI ORDINE — servizio condiviso (Area Clienti + Area Venditore).
 *
 * Fonte di verità: Supabase (tabella `ordine_reclami`, migrazione 20260816).
 * Le notifiche (ntfy venditore + admin) sono SOLO canali di avviso:
 * se falliscono, il reclamo resta salvato (best-effort, mai throw).
 *
 * SICUREZZA (tutta server-side, mai fidarsi del browser):
 *   - CREAZIONE: la RPC `crea_reclamo_ordine` verifica che l'ordine
 *     appartenga all'utente della SESSIONE (ordini.cliente_user_id) e che
 *     non sia annullato; blocca i reclami duplicati ATTIVI restituendo
 *     quello esistente (mai un secondo reclamo, mai un errore);
 *   - GESTIONE VENDITORE: la RPC `aggiorna_stato_reclamo` verifica che il
 *     negozio dell'ordine sia di proprietà del venditore (negozi.owner_user_id
 *     o admin autorizzato) ATOMICAMENTE, con macchina a stati;
 *   - LETTURE: filtri espliciti su identità + RLS come rete di sicurezza.
 *
 * ENV notifiche (server-side, mai NEXT_PUBLIC_):
 *   NTFY_ORDERS_TOPIC — topic VENDITORE (lo stesso dei nuovi ordini);
 *   NTFY_ADMIN_TOPIC  — topic SYSTEM/ADMIN di InCittà (OPZIONALE: se assente
 *                       la notifica admin viene saltata senza errori).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inviaMessaggioNtfy, type ConfigNtfy } from "@/lib/notifiche/ntfy";
import { canManageStore } from "@/lib/merchant/data";
import {
  ETICHETTE_STATO,
  etichettaMotivoAnnullamento,
  isStatoOrdine,
} from "@/lib/merchant/ordini-stati";

// ═══════════════════════════════════════════════════════════════════════
// PARTE PURA (tipi + macchina a stati + messaggio ntfy): ri-exportata dal
// modulo server-free lib/ordine-reclami-stati.ts, importabile anche dai
// componenti client.
// ═══════════════════════════════════════════════════════════════════════
import {
  azioniReclamoDisponibili,
  costruisciMessaggioReclamoNtfy,
  costruisciMessaggioRispostaClienteNtfy,
  ETICHETTA_TIPO_RECLAMO,
  ETICHETTE_STATO_RECLAMO,
  formattaDataOraReclamo,
  isStatoReclamo,
  isTipoReclamo,
  transizioneReclamoConsentita,
  type AzioneReclamo,
  type DatiNotificaReclamoNtfy,
  type DatiRispostaClienteNtfy,
  type ProdottoNotifica,
  type ReclamoOrdine,
  type StatoReclamo,
  type TipoReclamo,
} from "./ordine-reclami-stati";

export {
  azioniReclamoDisponibili,
  costruisciMessaggioReclamoNtfy,
  costruisciMessaggioRispostaClienteNtfy,
  ETICHETTA_TIPO_RECLAMO,
  ETICHETTE_STATO_RECLAMO,
  formattaDataOraReclamo,
  isStatoReclamo,
  isTipoReclamo,
  transizioneReclamoConsentita,
  type AzioneReclamo,
  type DatiNotificaReclamoNtfy,
  type DatiRispostaClienteNtfy,
  type ProdottoNotifica,
  type ReclamoOrdine,
  type StatoReclamo,
  type TipoReclamo,
};

export type EsitoCreaReclamo =
  | { ok: true; giaEsistente: boolean; reclamo: ReclamoOrdine }
  | { ok: false; codice: string; messaggio: string; status: number };

export type EsitoAggiornaReclamo =
  | { ok: true; cambiato: boolean; reclamo: ReclamoOrdine | null }
  | { ok: false; codice: string; messaggio: string; status: number };

/** Client DB strutturale minimo (per iniettare un fake nei test). */
export type ReclamiDbClient = {
  from: (tabella: string) => any;
};

const STATUS_DA_CODICE: Record<string, number> = {
  VALIDATION_ERROR: 422,
  ORDINE_NON_TROVATO: 404,
  FORBIDDEN: 403,
  RECLAMO_NON_AMMESSO: 409,
  RECLAMO_NON_TROVATO: 404,
  TRANSIZIONE_NON_CONSENTITA: 409,
  SAVE_FAILED: 500,
};

// ═══════════════════════════════════════════════════════════════════════
// CONTESTO RECLAMO PER NOTIFICHE (email + ntfy) — dati dal DB, mai dal browser
// ═══════════════════════════════════════════════════════════════════════

// Helpers condivisi per i link delle notifiche (nessuna logica duplicata).
function linkClienteOrdine(ordineId: string): string | null {
  return ordineId
    ? `${SITE_URL.replace(/\/+$/, "")}/cliente/ordini/${encodeURIComponent(ordineId)}`
    : null;
}

function linkVenditoreOrdine(negozioId: string, ordineId: string): string | null {
  return negozioId && ordineId
    ? `${SITE_URL.replace(/\/+$/, "")}/merchant/${encodeURIComponent(negozioId)}/ordini/${encodeURIComponent(ordineId)}`
    : null;
}

/**
 * Contesto completo di un reclamo per le notifiche (email al cliente,
 * ntfy/email al venditore). Tutto letto dal DB lato server: ordine
 * (numero, negozio), snapshot cliente e prodotti con codice articolo e
 * link annuncio. I link sono le pagine REALI del progetto.
 * Il CODICE ARTICOLO è `prodotti.id` (bigint) — l'identificativo usato
 * realmente nelle righe ordine e nel catalogo (ordini_righe.prodotto_id):
 * MAI un UUID, mai lo slug. Lo `sku` esiste solo nello schema separato
 * della pipeline LocalHub (products), NON nella tabella prodotti dell'app.
 */
export type ContestoReclamoNotifica = {
  reclamoId: string;
  ordineId: string;
  negozioId: string;
  numero: string;
  negozioNome: string;
  clienteNome: string;
  clienteEmail: string;
  prodotti: ProdottoNotifica[];
  /** Link alla pagina cliente (/cliente/ordini/<ordineId>) o null. */
  linkCliente: string | null;
  /** Link alla console operativa venditore (/merchant/.../ordini/...) o null. */
  linkVenditore: string | null;
};

/**
 * Carica dal DB il contesto completo di un reclamo per email/ntfy.
 * BEST-EFFORT: su errore restituisce null (il chiamante NON deve mai
 * far fallire il salvataggio del messaggio per un problema di notifica).
 * I dati descrittivi (nome cliente, prodotti, codice, link) vengono
 * recuperati qui, lato server: mai fidarsi del browser.
 */
export async function caricaContestoReclamo(
  reclamoId: string,
  opts: { db?: ReclamiDbClient } = {}
): Promise<ContestoReclamoNotifica | null> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as ReclamiDbClient;

    const { data: reclamo } = await db
      .from("ordine_reclami")
      .select("id, ordine_id, negozio_id, cliente_nome, cliente_email")
      .eq("id", reclamoId)
      .maybeSingle();
    if (!reclamo) {
      console.error(`[ordine-reclami] reclamo ${reclamoId}: contesto non trovato`);
      return null;
    }

    const ordineId = String(reclamo.ordine_id ?? "");
    const negozioId = String(reclamo.negozio_id ?? "");
    const clienteNome = String(reclamo.cliente_nome ?? "").trim();
    const clienteEmail = String(reclamo.cliente_email ?? "").trim();

    const { data: ordine } = await db
      .from("ordini")
      .select("numero, negozio_nome")
      .eq("id", ordineId)
      .maybeSingle();

    const numero = String(ordine?.numero ?? "");
    const negozioNome = String(ordine?.negozio_nome ?? "");

    // Righe ordine: nome prodotto (snapshot) + prodotto_id (codice articolo).
    const { data: righe } = await db
      .from("ordini_righe")
      .select("prodotto_id, nome_prodotto")
      .eq("ordine_id", ordineId)
      .order("created_at", { ascending: true });

    const righeOrdine = Array.isArray(righe) ? (righe as Record<string, unknown>[]) : [];
    const idProdotti = Array.from(
      new Set(righeOrdine.map((r) => String(r.prodotto_id ?? "")).filter(Boolean))
    );

    // Slug dei prodotti → URL pubblico annuncio (/prodotto/<slug>).
    const slugPerId = new Map<string, string>();
    if (idProdotti.length > 0) {
      const { data: prodotti } = await db
        .from("prodotti")
        .select("id, slug")
        .in("id", idProdotti);
      for (const p of (Array.isArray(prodotti) ? (prodotti as Record<string, unknown>[]) : [])) {
        const slug = String(p.slug ?? "").trim();
        if (slug) slugPerId.set(String(p.id), slug);
      }
    }

    const baseUrl = SITE_URL.replace(/\/+$/, "");
    const prodotti: ProdottoNotifica[] = righeOrdine.map((r) => {
      const prodottoId = String(r.prodotto_id ?? "");
      const slug = slugPerId.get(prodottoId);
      return {
        codiceArticolo: prodottoId,
        nomeProdotto: String(r.nome_prodotto ?? "").trim(),
        urlAnnuncio: slug ? `${baseUrl}/prodotto/${encodeURIComponent(slug)}` : null,
      };
    });

    return {
      reclamoId,
      ordineId,
      negozioId,
      numero,
      negozioNome,
      clienteNome,
      clienteEmail,
      prodotti,
      linkCliente: linkClienteOrdine(ordineId),
      linkVenditore: linkVenditoreOrdine(negozioId, ordineId),
    };
  } catch (err) {
    console.error(
      `[ordine-reclami] reclamo ${reclamoId}: contesto non caricabile (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function mappaReclamo(row: Record<string, unknown>): ReclamoOrdine {
  return {
    id: String(row.id ?? ""),
    ordineId: String(row.ordine_id ?? ""),
    negozioId: String(row.negozio_id ?? ""),
    clienteUserId: (row.cliente_user_id as string | null) ?? null,
    clienteNome: String(row.cliente_nome ?? ""),
    clienteEmail: (row.cliente_email as string | null) ?? null,
    clienteTelefono: (row.cliente_telefono as string | null) ?? null,
    tipo: (row.tipo as TipoReclamo) ?? "ordine_non_arrivato",
    messaggio: (row.messaggio as string | null) ?? null,
    stato: (row.stato as StatoReclamo) ?? "aperto",
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    gestitoAt: (row.gestito_at as string | null) ?? null,
    gestitoDa: (row.gestito_da as string | null) ?? null,
    gestitoNota: (row.gestito_nota as string | null) ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CREAZIONE (cliente autenticato)
// ═══════════════════════════════════════════════════════════════════════

/** Opzioni testabili per la creazione (RPC, fetch e DB notifica iniettati). */
export type OpzioniCreaReclamo = {
  rpc?: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  fetchImpl?: typeof fetch;
  db?: ReclamiDbClient;
};

/**
 * Crea un reclamo per un ordine PROPRIO (l'utente arriva dalla sessione
 * server-side; la RPC ri-verifica l'ownership atomica). Se esiste già un
 * reclamo ATTIVO dello stesso tipo, restituisce quello esistente
 * (giaEsistente: true) — mai un secondo reclamo. Dopo la creazione invia
 * le notifiche ntfy (venditore + admin) in BEST-EFFORT: un errore di
 * notifica NON fa mai fallire il reclamo.
 */
export async function creaReclamoOrdine(
  userId: string,
  ordineId: string,
  input: { tipo?: TipoReclamo; messaggio?: string | null },
  opts: OpzioniCreaReclamo = {}
): Promise<EsitoCreaReclamo> {
  const tipo: TipoReclamo = isTipoReclamo(input.tipo) ? input.tipo : "ordine_non_arrivato";
  const messaggio =
    typeof input.messaggio === "string" ? input.messaggio.trim().slice(0, 1000) || null : null;

  const chiamaRpc =
    opts.rpc ??
    ((fn: string, params: Record<string, unknown>) =>
      (createAdminSupabaseClient() as any).rpc(fn, params));
  const { data, error } = await chiamaRpc("crea_reclamo_ordine", {
    p_ordine_id: ordineId,
    p_cliente_user_id: userId,
    p_tipo: tipo,
    p_messaggio: messaggio,
  });

  if (error) {
    console.error("[ordine-reclami] RPC crea_reclamo_ordine fallita:", error.message);
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile salvare il reclamo.", status: 500 };
  }

  const esito = data as unknown as {
    ok?: boolean;
    giaEsistente?: boolean;
    reclamo?: Record<string, unknown>;
    codice?: string;
    messaggio?: string;
  };

  if (!esito || esito.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile salvare il reclamo."),
      status: STATUS_DA_CODICE[codice] ?? 500,
    };
  }

  const reclamo = mappaReclamo((esito.reclamo ?? {}) as Record<string, unknown>);
  const giaEsistente = esito.giaEsistente ?? false;

  // Notifiche BEST-EFFORT (mai bloccano la risposta): solo per un reclamo
  // REALMENTE nuovo (mai per i duplicati già esistenti).
  if (!giaEsistente) {
    await notificaReclamoNtfy(reclamo, { fetchImpl: opts.fetchImpl, db: opts.db }).catch(() => {});
  }

  return { ok: true, giaEsistente, reclamo };
}

// ═══════════════════════════════════════════════════════════════════════
// LETTURE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reclami di un ordine per il CLIENTE (filtro server-side su identità +
 * RLS). L'ordine deve appartenere all'utente: se non lo è, la query non
 * restituisce nulla (mai leak).
 */
export async function getReclamiOrdineCliente(
  userId: string,
  ordineId: string,
  client?: ReclamiDbClient
): Promise<ReclamoOrdine[]> {
  const db = (client ?? (await createServerSupabaseClient())) as ReclamiDbClient;
  const { data, error } = await db
    .from("ordine_reclami")
    .select("*")
    .eq("ordine_id", ordineId)
    .eq("cliente_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    // Best-effort: un errore (es. tabella non ancora migrata) non deve far
    // fallire la pagina del dettaglio ordine.
    console.error("[ordine-reclami] lettura cliente fallita:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => mappaReclamo(r));
}

/** Opzioni testabili (ownership pre-valutata). */
export type OpzioniReclamiVenditore = {
  client?: ReclamiDbClient;
  puòGestire?: boolean;
};

/** Opzioni testabili per il cambio stato (RPC e ownership iniettati). */
export type OpzioniAggiornaReclamo = {
  rpc?: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  puòGestire?: boolean;
};

async function verificaOwnershipReclami(
  opts: OpzioniReclamiVenditore,
  userId: string,
  negozioId: string
): Promise<boolean> {
  if (opts.puòGestire !== undefined) return opts.puòGestire;
  return canManageStore(userId, negozioId);
}

/**
 * Reclami degli ordini di un negozio per il VENDITORE (ownership server-side
 * + filtro negozio_id). Un venditore non può vedere reclami di altri negozi.
 */
export async function getReclamiVenditore(
  userId: string,
  negozioId: string,
  ordineId: string,
  opts: OpzioniReclamiVenditore = {}
): Promise<ReclamoOrdine[]> {
  const puòGestire = await verificaOwnershipReclami(opts, userId, negozioId);
  if (!puòGestire) return [];

  const db = (opts.client ?? (await createServerSupabaseClient())) as ReclamiDbClient;
  const { data, error } = await db
    .from("ordine_reclami")
    .select("*")
    .eq("ordine_id", ordineId)
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ordine-reclami] lettura venditore fallita:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => mappaReclamo(r));
}

/**
 * Numero di reclami ATTIVI (aperto/in gestione) di un negozio — usato dalla
 * dashboard venditore. Best-effort: 0 su errore (mai fallisce la dashboard).
 */
export async function getConteggioReclamiApertiVenditore(
  userId: string,
  negozioId: string,
  opts: OpzioniReclamiVenditore = {}
): Promise<number> {
  const puòGestire = await verificaOwnershipReclami(opts, userId, negozioId);
  if (!puòGestire) return 0;

  const db = (opts.client ?? (await createServerSupabaseClient())) as ReclamiDbClient;
  const { count, error } = await db
    .from("ordine_reclami")
    .select("id", { head: true, count: "exact" })
    .eq("negozio_id", negozioId)
    .in("stato", ["aperto", "in_gestione"]);

  if (error) {
    console.error("[ordine-reclami] conteggio venditore fallito:", error.message);
    return 0;
  }
  return count ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════
// GESTIONE VENDITORE (cambio stato)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cambio stato reclamo (area venditore). Ownership verificata in TS
 * (canManageStore) e ri-verificata ATOMICAMENTE dalla RPC
 * `aggiorna_stato_reclamo` (macchina a stati + gestito_at/da). Stesso
 * stato → no-op idempotente (cambiato: false). Il reclamo viene sempre
 * risolto per ID: l'authority finale è la RPC (negozio del reclamo).
 */
export async function aggiornaStatoReclamoVenditore(
  userId: string,
  negozioId: string,
  reclamoId: string,
  nuovoStato: StatoReclamo,
  nota?: string | null,
  opts: OpzioniAggiornaReclamo = {}
): Promise<EsitoAggiornaReclamo> {
  const puòGestire =
    opts.puòGestire !== undefined ? opts.puòGestire : await canManageStore(userId, negozioId);
  if (!puòGestire) {
    return { ok: false, codice: "FORBIDDEN", messaggio: "Non puoi gestire reclami di questo negozio.", status: 403 };
  }

  const chiamaRpc =
    opts.rpc ??
    ((fn: string, params: Record<string, unknown>) =>
      (createAdminSupabaseClient() as any).rpc(fn, params));
  const { data, error } = await chiamaRpc("aggiorna_stato_reclamo", {
    p_reclamo_id: reclamoId,
    p_nuovo_stato: nuovoStato,
    p_merchant_user_id: userId,
    p_nota: nota ?? null,
  });

  if (error) {
    console.error("[ordine-reclami] RPC aggiorna_stato_reclamo fallita:", error.message);
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile aggiornare il reclamo.", status: 500 };
  }

  const esito = data as unknown as {
    ok?: boolean;
    cambiato?: boolean;
    reclamo?: Record<string, unknown>;
    codice?: string;
    messaggio?: string;
  };

  if (!esito || esito.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile aggiornare il reclamo."),
      status: STATUS_DA_CODICE[codice] ?? 500,
    };
  }

  return {
    ok: true,
    cambiato: esito.cambiato ?? false,
    reclamo: esito.reclamo ? mappaReclamo(esito.reclamo) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICHE ntfy (venditore + admin, BEST-EFFORT)
// ═══════════════════════════════════════════════════════════════════════

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.incitta.online";

/** Opzioni di notifica (fetch e DB per i test). */
export type OpzioniNotificaReclamo = {
  fetchImpl?: typeof fetch;
  db?: ReclamiDbClient;
};

/**
 * Notifica ntfy di un nuovo reclamo: al VENDITORE (topic NTFY_ORDERS_TOPIC,
 * stesso dei nuovi ordini) e al SYSTEM/ADMIN (topic NTFY_ADMIN_TOPIC,
 * OPZIONALE: se non configurato la notifica admin viene saltata).
 * BEST-EFFORT: MAI throw, il reclamo DB è la fonte di verità.
 *
 * Il messaggio identifica subito l'ordine (numero LEGGIBILE tipo "LH-00125",
 * MAI l'UUID), il negozio, il cliente e lo STATO ATTUALE dell'ordine
 * (con motivo/nota se ANNULLATO). Tutti i dati sono letti dal DB lato
 * server: nessun valore inviato dal browser.
 */
export async function notificaReclamoNtfy(
  reclamo: ReclamoOrdine,
  opts: OpzioniNotificaReclamo = {}
): Promise<void> {
  try {
    // Dati ordine per il messaggio (numero leggibile, negozio, stato,
    // annullamento, cliente, link). Tutto letto dal DB: mai dal browser.
    const adminDb = (opts.db ?? createAdminSupabaseClient()) as ReclamiDbClient;
    const { data: ordine } = await adminDb
      .from("ordini")
      .select(
        "numero, negozio_nome, stato, annullato_motivo, annullato_nota, cliente_nome, cliente_cognome"
      )
      .eq("id", reclamo.ordineId)
      .maybeSingle();

    const numero = String(ordine?.numero ?? "");
    const negozioNome = String(ordine?.negozio_nome ?? "");

    // Stato ordine ATTUALE con etichetta leggibile; ANNULLATO esplicito e
    // maiuscolo come richiesto, con motivo + nota se disponibili.
    const statoValue = ordine?.stato;
    const èAnnullato = statoValue === "cancellato";
    const statoOrdine = èAnnullato
      ? "ANNULLATO"
      : isStatoOrdine(statoValue)
        ? ETICHETTE_STATO[statoValue]
        : typeof statoValue === "string"
          ? statoValue
          : "";
    const motivoAnnullamento =
      èAnnullato && ordine?.annullato_motivo
        ? etichettaMotivoAnnullamento(String(ordine.annullato_motivo))
        : null;
    const notaAnnullamento =
      èAnnullato && ordine?.annullato_nota ? String(ordine.annullato_nota) : null;

    // Nome cliente: snapshot del reclamo (nome + cognome dell'ordine al
    // momento della segnalazione); fallback sul nome attuale dell'ordine.
    const clienteNome =
      reclamo.clienteNome.trim() ||
      `${String(ordine?.cliente_nome ?? "")} ${String(ordine?.cliente_cognome ?? "")}`.trim();

    // Link alla gestione ordine nel pannello venditore. Gli ID sono quelli
    // REALI del reclamo (ordine_id/negozio_id scritti dalla RPC lato server,
    // MAI dal browser). Il link viene generato SOLO se entrambi gli ID sono
    // valorizzati: altrimenti il messaggio mostra il fallback leggibile
    // (mai un URL rotto con doppie slash tipo "/merchant//ordini/").
    const negozioId = String(reclamo.negozioId ?? "").trim();
    const ordineId = String(reclamo.ordineId ?? "").trim();
    const linkVenditore = linkVenditoreOrdine(negozioId, ordineId);

    const corpo = costruisciMessaggioReclamoNtfy({
      numero,
      negozioNome,
      clienteNome,
      statoOrdine,
      motivoAnnullamento,
      notaAnnullamento,
      dataOra: formattaDataOraReclamo(reclamo.createdAt),
      messaggio: reclamo.messaggio,
      linkOrdine: linkVenditore,
    });
    const titolo = `Reclamo ordine #${numero || ""}`.trim();
    const ref = `reclamo ${reclamo.ordineId.slice(0, 8)}`;

    // Venditore (topic ordini esistente; non crea topic casuali nuovi).
    const configVenditore: ConfigNtfy = {
      enabled: process.env.NTFY_ENABLED !== "false",
      serverUrl: process.env.NTFY_SERVER_URL ?? "https://ntfy.sh",
      topic: process.env.NTFY_ORDERS_TOPIC ?? "",
    };
    await inviaMessaggioNtfy(
      configVenditore,
      { titolo, tags: "rotating_light", priorita: "high", corpo },
      ref,
      opts.fetchImpl
    );

    // Admin/System (solo se NTFY_ADMIN_TOPIC configurato).
    const adminTopic = (process.env.NTFY_ADMIN_TOPIC ?? "").trim();
    if (adminTopic) {
      const configAdmin: ConfigNtfy = {
        enabled: process.env.NTFY_ENABLED !== "false",
        serverUrl: process.env.NTFY_SERVER_URL ?? "https://ntfy.sh",
        topic: adminTopic,
      };
      await inviaMessaggioNtfy(
        configAdmin,
        { titolo: `${titolo} [ADMIN]`, tags: "rotating_light", priorita: "high", corpo },
        `${ref} (admin)`,
        opts.fetchImpl
      );
    } else {
      console.log(`[ordine-reclami] ${ref}: NTFY_ADMIN_TOPIC non configurato, notifica admin saltata`);
    }
  } catch (err) {
    console.error(
      `[ordine-reclami] reclamo ${reclamo.id}: notifica fallita (best-effort): ${(err as Error)?.message ?? "sconosciuto"}`
    );
  }
}
