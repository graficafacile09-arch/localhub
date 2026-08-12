/**
 * F2.2 — CHECKOUT CARRELLO (backend).
 *
 * Servizio che trasforma un carrello multi-prodotto (anche multi-negozio) in
 * ORDINI REALI su Supabase, senza mai fidarsi dei valori inviati dal client:
 *
 *   1. valida l'input (chiave checkout, righe 2–50, quantità 1–99, modalità,
 *      cliente, dati ritiro/spedizione) — stesse regole di lib/cliente/orders.ts;
 *   2. risolve i negozi ESCLUSIVAMENTE dal DB tramite i prodotti/varianti
 *      (mai negozio/prezzi/nomi/immagini/totali dal browser);
 *   3. raggruppa le righe per negozio_id e crea UN ORDINE SEPARATO per ogni
 *      negozio:
 *        - gruppi multi-riga (2+) → RPC `crea_ordine_carrello` (F2.1, atomica);
 *        - gruppi con 1 sola riga (es. carrello multi-negozio con un prodotto
 *          per negozio) → RPC legacy `crea_ordine` (mono-riga, stesso modello
 *          idempotenza/stock/ritorno via ordine_to_json). `crea_ordine` NON
 *          viene modificato: viene solo chiamato per gestire il caso limite
 *          che la RPC carrello rifiuta (minimo 2 righe);
 *   4. deriva deterministicamente la chiave di idempotenza per negozio:
 *      checkoutKey + ':' + negozioId (troncata a 64 caratteri) → un retry
 *      della stessa checkoutKey restituisce gli stessi ordini senza duplicare
 *      nulla né decrementare di nuovo lo stock;
 *   5. clienteUserId arriva SOLO dal server (sessione Supabase): se assente
 *      l'ordine nasce guest (cliente_user_id = NULL);
 *   6. ogni negozio fallito produce un errore STRUTTURATO (mai ordini
 *      parziali per quel negozio: le RPC sono atomiche) senza corrompere gli
 *      ordini degli altri negozi;
 *   7. la risposta contiene tutti gli ordini creati/recuperati con i campi
 *      richiesti (ordineId, numero, totale, payment_status, payment_provider,
 *      stato) + gli errori per negozio.
 *
 * Non crea Checkout Session Stripe: lo farà F2.3.
 */
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/slug";
import { inviaNotificaNuovoOrdine } from "@/lib/notifiche/whatsapp";
import { inviaNotificaNuovoOrdineNtfy } from "@/lib/notifiche/ntfy";
import { inviaEmailConfermaOrdine } from "./ordine-email";
import { STATUS_DA_CODICE as STATUS_DA_CODICE_ORDINI } from "./orders";

// ════════════════════════════════════════════════════════════════════
// Tipi pubblici
// ════════════════════════════════════════════════════════════════════

/** Riga del carrello inviata dal client (solo riferimenti + quantità). */
export type RigaCarrelloInput = {
  prodottoId: string;
  varianteId?: string | null;
  quantita: number;
};

/** Input completo del checkout carrello (validato server-side). */
export type CheckoutCarrelloInput = {
  /** Chiave di idempotenza GENERATA dal client (anti doppio invio). */
  checkoutKey: string;
  /** 2–50 righe (vincolo della RPC crea_ordine_carrello). */
  righe: RigaCarrelloInput[];
  cliente: {
    nome: string;
    cognome: string;
    telefono?: string | null;
    email?: string | null;
  };
  modalita: "ritiro" | "spedizione";
  /** Solo modalita='ritiro'. */
  ritiro?: { data?: string | null; fascia?: string | null } | null;
  /** Solo modalita='spedizione'. */
  spedizione?: {
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    note?: string | null;
    metodoSpedizione: "standard" | "express";
    metodoPagamento: "carta" | "paypal" | "klarna" | "bonifico";
  } | null;
  note?: string | null;
  /** IP del richiedente (rate limiting per IP, salvato su ordini.cliente_ip). */
  clienteIp?: string | null;
  /** UUID del cliente AUTENTICATO (SERVER-ONLY dalla sessione). */
  clienteUserId?: string | null;
};

/** Riga dell'ordine restituita dal checkout (snapshot dal DB). */
export type RigaOrdineCarrello = {
  prodottoId: string;
  nomeProdotto: string;
  prezzoUnitario: number;
  quantita: number;
  immagineUrl: string | null;
};

/** Ordine creato/recuperato per un negozio del carrello. */
export type OrdineCarrelloNegozio = {
  ordineId: string;
  numero: string;
  stato: string;
  totale: number;
  paymentStatus: string | null;
  paymentProvider: string | null;
  giaEsistente: boolean;
  negozioId: string;
  negozioNome: string;
  createdAt: string;
  modalita: "ritiro" | "spedizione";
  righe: RigaOrdineCarrello[];
  /**
   * FASE F2.5 — sessione Stripe per questo ordine (solo metodo "carta"):
   * popolato dal server subito dopo la creazione ordine, mai dal client.
   * Assente/null per gli altri metodi (bonifico ecc.).
   */
  pagamento?: {
    redirectUrl?: string | null;
    sessioneId?: string | null;
    giaEsistente?: boolean;
  } | null;
};

/** Errore isolato di un singolo negozio. */
export type ErroreNegozio = {
  negozioId: string;
  codice: string;
  messaggio: string;
};

/** Esito strutturato del checkout carrello. */
export type EsitoCheckoutCarrello = {
  ok: boolean;
  checkoutKey: string;
  /** Tutti gli ordini creati/recuperati (uno per negozio). */
  ordini: OrdineCarrelloNegozio[];
  /** Errori per singolo negozio (gli altri ordini restano validi). */
  errori: ErroreNegozio[];
};

/** Gruppo di righe appartenenti allo stesso negozio (risolto dal DB). */
export type RaggruppamentoNegozio = {
  negozioId: string;
  righe: RigaCarrelloInput[];
};

export type EsitoRaggruppamento =
  | { ok: true; negozi: RaggruppamentoNegozio[] }
  | { ok: false; codice: string; messaggio: string };

// ════════════════════════════════════════════════════════════════════
// Costanti e helper
// ════════════════════════════════════════════════════════════════════

/**
 * HTTP status associato a ciascun codice d'errore: mappa base riusata da
 * lib/cliente/orders.ts (stessi codici RPC) + codici specifici del carrello.
 */
const STATUS_DA_CODICE: Record<string, number> = {
  ...STATUS_DA_CODICE_ORDINI,
  NEGOZIO_DIVERSO: 409,
  DB_UNAVAILABLE: 500,
};

export function statusDaCodice(codice: string): number {
  return STATUS_DA_CODICE[codice] ?? 500;
}

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

/**
 * Chiave di idempotenza DETERMINISTICA per negozio:
 * checkoutKey + ':' + negozioId, troncata a 64 caratteri (limite di
 * ordini.idempotency_key). Stessa checkoutKey + stesso negozio → stessa
 * chiave → un retry NON crea un nuovo ordine né decrementa di nuovo lo stock.
 *
 * NOTA sul troncamento: il suffisso ":<uuid>" è 37 caratteri → il prefisso
 * effettivo è di 27 caratteri. Per chiavi client > 27 caratteri la parte in
 * eccesso non partecipa alla derivazione (stesso primo ordine di 27 char →
 * stessa chiave): con chiavi casuali (uuid/random) la probabilità di
 * collisione è trascurabile (~2^-108), ed è il comportamento richiesto dal
 * report F2 ("checkoutKey + ':' + negozioId rispettando il limite di 64").
 */
export function chiavePerNegozio(checkoutKey: string, negozioId: string): string {
  const suffisso = `:${negozioId}`;
  const maxPrefisso = Math.max(0, 64 - suffisso.length);
  return checkoutKey.slice(0, maxPrefisso) + suffisso;
}

// ════════════════════════════════════════════════════════════════════
// Validazione input (stesse regole di creaOrdine, niente default silenziosi)
// ════════════════════════════════════════════════════════════════════

function validaCheckout(input: CheckoutCarrelloInput): { codice: string; messaggio: string } | null {
  const key = (input.checkoutKey ?? "").trim();
  if (!key || key.length > 64) {
    return { codice: "VALIDATION_ERROR", messaggio: "Chiave di idempotenza non valida." };
  }
  if (!Array.isArray(input.righe) || input.righe.length < 1 || input.righe.length > 50) {
    return { codice: "VALIDATION_ERROR", messaggio: "Il carrello deve contenere da 1 a 50 prodotti." };
  }
  for (let i = 0; i < input.righe.length; i++) {
    const r = input.righe[i];
    if (!r || typeof r.prodottoId !== "string" || !/^\d+$/.test(String(r.prodottoId).trim())) {
      return { codice: "VALIDATION_ERROR", messaggio: `Prodotto non valido (riga ${i + 1}).` };
    }
    const vid = r.varianteId ? String(r.varianteId).trim() : null;
    if (vid && !isUuid(vid)) {
      return { codice: "VARIANTE_NON_VALIDA", messaggio: `Variante non valida (riga ${i + 1}).` };
    }
    const quantita = Number(r.quantita);
    if (!Number.isInteger(quantita) || quantita < 1 || quantita > 99) {
      return { codice: "VALIDATION_ERROR", messaggio: `Quantità non valida (1-99) per la riga ${i + 1}.` };
    }
  }
  if (input.modalita !== "ritiro" && input.modalita !== "spedizione") {
    return { codice: "VALIDATION_ERROR", messaggio: "Modalità di consegna non valida." };
  }
  const cliente = input.cliente ?? ({} as CheckoutCarrelloInput["cliente"]);
  const nome = String(cliente.nome ?? "").trim();
  const cognome = String(cliente.cognome ?? "").trim();
  if (!nome || !cognome || nome.length > 80 || cognome.length > 80) {
    return { codice: "VALIDATION_ERROR", messaggio: "Nome e cognome sono obbligatori." };
  }
  if (input.modalita === "spedizione") {
    const sp = input.spedizione;
    if (!sp || !sp.indirizzo || !sp.cap || !sp.citta || !sp.provincia) {
      return { codice: "VALIDATION_ERROR", messaggio: "Dati di spedizione incompleti." };
    }
    if (!/^\d{5}$/.test(String(sp.cap).trim())) {
      return { codice: "VALIDATION_ERROR", messaggio: "Il CAP deve essere composto da 5 cifre." };
    }
    if (sp.metodoSpedizione !== "standard" && sp.metodoSpedizione !== "express") {
      return { codice: "VALIDATION_ERROR", messaggio: "Metodo di spedizione non valido." };
    }
    if (
      sp.metodoPagamento !== "carta" &&
      sp.metodoPagamento !== "paypal" &&
      sp.metodoPagamento !== "klarna" &&
      sp.metodoPagamento !== "bonifico"
    ) {
      return { codice: "VALIDATION_ERROR", messaggio: "Metodo di pagamento non valido." };
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════
// Risoluzione negozi DAL DB + raggruppamento per negozio
// ════════════════════════════════════════════════════════════════════

/**
 * Risolve prodotti/varianti/negozi esclusivamente dal DB e raggruppa le
 * righe per negozio_id. PRE-FLIGHT usato dalla route PRIMA di qualunque RPC
 * (fail-fast: prodotto non trovato / inattivo, variante non valida /
 * obbligatoria, negozio inattivo) e internamente da creaOrdiniCarrello per
 * derivare le chiavi e costruire i payload. Lo stock NON viene verificato qui:
 * è la RPC atomica la fonte autorevole della disponibilità (evita corse).
 */
export async function raggruppaPerNegozio(
  righe: RigaCarrelloInput[]
): Promise<EsitoRaggruppamento> {
  const db = getDb();
  if (!db) {
    return { ok: false, codice: "DB_UNAVAILABLE", messaggio: "Database non disponibile." };
  }

  const idsProdotti = [...new Set(righe.map((r) => String(r.prodottoId).trim()))];
  const { data: prodotti, error: errProdotti } = await db
    .from("prodotti")
    .select("id, negozio_id, attivo, ha_varianti")
    .in("id", idsProdotti.map(Number));
  if (errProdotti) {
    console.error("[ordini-carrello] lettura prodotti:", errProdotti.message);
    return { ok: false, codice: "DB_UNAVAILABLE", messaggio: "Impossibile verificare i prodotti." };
  }

  const mappaProdotti = new Map<string, Record<string, unknown>>();
  for (const p of (prodotti ?? []) as Record<string, unknown>[]) {
    mappaProdotti.set(String(p.id), p);
  }

  const idsVarianti = [
    ...new Set(righe.filter((r) => r.varianteId).map((r) => String(r.varianteId).trim())),
  ];
  const mappaVarianti = new Map<string, Record<string, unknown>>();
  if (idsVarianti.length > 0) {
    const { data: varianti, error: errVarianti } = await db
      .from("prodotto_varianti")
      .select("id, prodotto_id, attivo")
      .in("id", idsVarianti);
    if (errVarianti) {
      console.error("[ordini-carrello] lettura varianti:", errVarianti.message);
      return { ok: false, codice: "DB_UNAVAILABLE", messaggio: "Impossibile verificare le varianti." };
    }
    for (const v of (varianti ?? []) as Record<string, unknown>[]) {
      mappaVarianti.set(String(v.id), v);
    }
  }

  const perNegozio = new Map<string, RigaCarrelloInput[]>();

  for (let i = 0; i < righe.length; i++) {
    const r = righe[i];
    const pos = i + 1;
    const pid = String(r.prodottoId).trim();
    const prodotto = mappaProdotti.get(pid);

    if (!prodotto) {
      return { ok: false, codice: "PRODOTTO_NON_TROVATO", messaggio: `Prodotto non trovato (riga ${pos}).` };
    }
    if (prodotto.attivo !== true) {
      return { ok: false, codice: "PRODOTTO_INATTIVO", messaggio: "Un prodotto del carrello non è più disponibile." };
    }

    const haVarianti = prodotto.ha_varianti === true;
    const vid = r.varianteId ? String(r.varianteId).trim() : null;

    if (haVarianti && !vid) {
      return { ok: false, codice: "VARIANTE_OBBLIGATORIA", messaggio: `Seleziona una variante del prodotto (riga ${pos}).` };
    }
    if (!haVarianti && vid) {
      return { ok: false, codice: "VARIANTE_NON_VALIDA", messaggio: `Variante non valida per questo prodotto (riga ${pos}).` };
    }
    if (vid) {
      const variante = mappaVarianti.get(vid);
      if (!variante || String(variante.prodotto_id) !== pid) {
        return { ok: false, codice: "VARIANTE_NON_VALIDA", messaggio: `Variante non valida per questo prodotto (riga ${pos}).` };
      }
      if (variante.attivo !== true) {
        return { ok: false, codice: "VARIANTE_NON_VALIDA", messaggio: `Questa variante non è più disponibile (riga ${pos}).` };
      }
    }

    const negozioId = String(prodotto.negozio_id);
    const gruppo = perNegozio.get(negozioId) ?? [];
    gruppo.push(r);
    perNegozio.set(negozioId, gruppo);
  }

  // Negozio SEMPRE risolto dai prodotti: verifica attivo (come la RPC).
  const negoziIds = [...perNegozio.keys()];
  const { data: negozi, error: errNegozi } = await db
    .from("negozi")
    .select("id, attivo, deleted_at")
    .in("id", negoziIds);
  if (errNegozi) {
    console.error("[ordini-carrello] lettura negozi:", errNegozi.message);
    return { ok: false, codice: "DB_UNAVAILABLE", messaggio: "Impossibile verificare i negozi." };
  }
  const mappaNegozi = new Map<string, Record<string, unknown>>();
  for (const n of (negozi ?? []) as Record<string, unknown>[]) {
    mappaNegozi.set(String(n.id), n);
  }
  for (const negozioId of negoziIds) {
    const negozio = mappaNegozi.get(negozioId);
    if (!negozio || negozio.attivo !== true || negozio.deleted_at != null) {
      return { ok: false, codice: "NEGOZIO_INATTIVO", messaggio: "Il negozio non è più attivo." };
    }
  }

  const negoziOut: RaggruppamentoNegozio[] = [];
  for (const [negozioId, righeGruppo] of perNegozio.entries()) {
    negoziOut.push({ negozioId, righe: righeGruppo });
  }

  return { ok: true, negozi: negoziOut };
}

// ════════════════════════════════════════════════════════════════════
// Costruzione payload RPC (naming identico ai test F2.1 e a crea_ordine E5)
// ════════════════════════════════════════════════════════════════════

function costruisciPayloadBase(input: CheckoutCarrelloInput, idempotencyKey: string): Record<string, unknown> {
  const cliente = input.cliente ?? ({} as CheckoutCarrelloInput["cliente"]);
  const userId =
    input.clienteUserId && String(input.clienteUserId).trim()
      ? String(input.clienteUserId).trim()
      : null;

  const payload: Record<string, unknown> = {
    idempotencyKey,
    modalita: input.modalita,
    clienteNome: String(cliente.nome ?? "").trim(),
    clienteCognome: String(cliente.cognome ?? "").trim(),
    clienteTelefono: cliente.telefono ? String(cliente.telefono).trim().slice(0, 30) : null,
    clienteEmail: cliente.email ? String(cliente.email).trim().slice(0, 120) : null,
    clienteUserId: userId,
    clienteIp: input.clienteIp ?? null,
    note: input.note ? String(input.note).trim().slice(0, 500) : null,
  };

  if (input.modalita === "ritiro") {
    payload.ritiroData = input.ritiro?.data ?? null;
    payload.ritiroFascia = input.ritiro?.fascia ?? null;
  } else {
    const sp = input.spedizione!;
    payload.spedizioneIndirizzo = String(sp.indirizzo).trim();
    payload.spedizioneCap = String(sp.cap).trim();
    payload.spedizioneCitta = String(sp.citta).trim();
    payload.spedizioneProvincia = String(sp.provincia).trim();
    payload.spedizioneNote = sp.note ? String(sp.note).trim().slice(0, 500) : null;
    payload.metodoSpedizione = sp.metodoSpedizione;
    payload.metodoPagamento = sp.metodoPagamento;
  }

  return payload;
}

/** Payload per la RPC legacy crea_ordine (gruppo con 1 sola riga). */
function costruisciPayloadSingolaRiga(
  input: CheckoutCarrelloInput,
  riga: RigaCarrelloInput,
  idempotencyKey: string
): Record<string, unknown> {
  return {
    ...costruisciPayloadBase(input, idempotencyKey),
    prodottoId: String(riga.prodottoId).trim(),
    varianteId: riga.varianteId ? String(riga.varianteId).trim() : null,
    quantita: Number(riga.quantita),
  };
}

/** Payload per la RPC crea_ordine_carrello (gruppo con 2+ righe, F2.1). */
function costruisciPayloadMultiRiga(
  input: CheckoutCarrelloInput,
  righe: RigaCarrelloInput[],
  idempotencyKey: string
): Record<string, unknown> {
  return {
    ...costruisciPayloadBase(input, idempotencyKey),
    righe: righe.map((r) => ({
      prodottoId: String(r.prodottoId).trim(),
      varianteId: r.varianteId ? String(r.varianteId).trim() : null,
      quantita: Number(r.quantita),
    })),
  };
}

// ════════════════════════════════════════════════════════════════════
// Arricchimento con i campi pagamento (ordine_to_json non li espone)
// ════════════════════════════════════════════════════════════════════

async function arricchisciConPagamenti(
  db: NonNullable<ReturnType<typeof getDb>>,
  lista: { negozioId: string; ordineJson: Record<string, unknown>; giaEsistente: boolean }[]
): Promise<OrdineCarrelloNegozio[]> {
  const ids = lista.map((x) => String(x.ordineJson.id)).filter(Boolean);
  if (ids.length === 0) return [];

  const { data: righe } = await db
    .from("ordini")
    .select(
      "id, numero, stato, totale, payment_status, payment_provider, negozio_id, negozio_nome, created_at, modalita"
    )
    .in("id", ids);

  const mappa = new Map<string, Record<string, unknown>>();
  for (const r of (righe ?? []) as Record<string, unknown>[]) {
    mappa.set(String(r.id), r);
  }

  return lista.map((x) => {
    const row = mappa.get(String(x.ordineJson.id));
    return {
      ordineId: String(x.ordineJson.id),
      numero: String(row?.numero ?? x.ordineJson.numero ?? ""),
      stato: String(row?.stato ?? x.ordineJson.stato ?? "in_preparazione"),
      totale: Number(row?.totale ?? x.ordineJson.totale ?? 0),
      paymentStatus: (row?.payment_status as string | null) ?? null,
      paymentProvider: (row?.payment_provider as string | null) ?? null,
      giaEsistente: x.giaEsistente,
      negozioId: String(row?.negozio_id ?? x.ordineJson.negozioId ?? x.negozioId ?? ""),
      negozioNome: String(row?.negozio_nome ?? x.ordineJson.negozioNome ?? ""),
      createdAt: String(row?.created_at ?? x.ordineJson.createdAt ?? ""),
      modalita: (row?.modalita ?? x.ordineJson.modalita ?? "ritiro") as "ritiro" | "spedizione",
      righe: Array.isArray(x.ordineJson.righe)
        ? ((x.ordineJson.righe as unknown[]).map((r) => ({
            prodottoId: String((r as Record<string, unknown>).prodottoId),
            nomeProdotto: String((r as Record<string, unknown>).nomeProdotto ?? ""),
            prezzoUnitario: Number((r as Record<string, unknown>).prezzoUnitario ?? 0),
            quantita: Number((r as Record<string, unknown>).quantita ?? 0),
            immagineUrl: ((r as Record<string, unknown>).immagineUrl as string | null) ?? null,
          })) as RigaOrdineCarrello[])
        : [],
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// Creazione ordini carrello
// ════════════════════════════════════════════════════════════════════

/**
 * Crea un ordine separato per ogni negozio del carrello (via RPC atomica
 * crea_ordine_carrello, o crea_ordine per i gruppi con 1 sola riga).
 *
 * Idempotenza: la chiave per negozio è derivata deterministicamente da
 * checkoutKey (+ ':' + negozioId). Un retry della stessa checkoutKey
 * restituisce gli ordini già esistenti senza duplicati né doppi
 * decrementi di stock. Gli errori sono isolati per negozio: se un negozio
 * fallisce (es. SCORTE_INSUFFICIENTI), gli ordini degli altri negozi
 * restano creati e vengono restituiti insieme all'errore.
 */
export async function creaOrdiniCarrello(
  input: CheckoutCarrelloInput
): Promise<EsitoCheckoutCarrello> {
  const checkoutKey = (input.checkoutKey ?? "").trim();
  const base: EsitoCheckoutCarrello = { ok: false, checkoutKey, ordini: [], errori: [] };

  const db = getDb();
  if (!db) {
    return {
      ...base,
      errori: [{ negozioId: "", codice: "DB_UNAVAILABLE", messaggio: "Database non disponibile." }],
    };
  }

  const errInput = validaCheckout(input);
  if (errInput) {
    return { ...base, errori: [{ negozioId: "", codice: errInput.codice, messaggio: errInput.messaggio }] };
  }

  const gruppi = await raggruppaPerNegozio(input.righe);
  if (!gruppi.ok) {
    return { ...base, errori: [{ negozioId: "", codice: gruppi.codice, messaggio: gruppi.messaggio }] };
  }

  const risultati: { negozioId: string; ordineJson: Record<string, unknown>; giaEsistente: boolean }[] = [];
  const errori: ErroreNegozio[] = [];

  for (const gruppo of gruppi.negozi) {
    const key = chiavePerNegozio(checkoutKey, gruppo.negozioId);
    // Gruppi multi-riga → RPC carrello (F2.1); gruppi con 1 sola riga →
    // RPC legacy crea_ordine (la RPC carrello esige minimo 2 righe).
    const nomeRpc = gruppo.righe.length === 1 ? "crea_ordine" : "crea_ordine_carrello";
    const payload =
      gruppo.righe.length === 1
        ? costruisciPayloadSingolaRiga(input, gruppo.righe[0], key)
        : costruisciPayloadMultiRiga(input, gruppo.righe, key);

    const { data, error } = await db.rpc(nomeRpc, { p_payload: payload });

    if (error) {
      // Errore infrastrutturale (le RPC non lanciano per i casi di business).
      console.error(`[ordini-carrello] RPC ${nomeRpc} fallita (negozio ${gruppo.negozioId}):`, error.message);
      errori.push({ negozioId: gruppo.negozioId, codice: "SAVE_FAILED", messaggio: "Impossibile salvare l'ordine." });
      continue;
    }

    const esito = data as unknown as {
      ok?: boolean;
      giaEsistente?: boolean;
      ordine?: Record<string, unknown> | null;
      codice?: string;
      messaggio?: string;
    };

    if (!esito || esito.ok !== true || !esito.ordine?.id) {
      const codice = String(esito?.codice ?? "SAVE_FAILED");
      errori.push({
        negozioId: gruppo.negozioId,
        codice,
        messaggio: String(esito?.messaggio ?? "Impossibile salvare l'ordine."),
      });
      continue;
    }

    risultati.push({
      negozioId: gruppo.negozioId,
      ordineJson: esito.ordine,
      giaEsistente: esito.giaEsistente ?? false,
    });
  }

  const ordini = await arricchisciConPagamenti(db, risultati);

  // ── Notifiche (BEST-EFFORT, mai bloccano; solo ordini REALMENTE nuovi) ──
  // Stesso pattern di creaOrdine: con pagamento online (carta/klarna)
  // l'email di conferma parte solo DOPO la conferma del webhook (F2.3/F2.x);
  // per gli altri metodi (bonifico ecc.) parte subito.
  const pagamentoOnline =
    input.spedizione?.metodoPagamento === "carta" ||
    input.spedizione?.metodoPagamento === "klarna";
  for (const ordine of ordini) {
    if (ordine.giaEsistente) continue;
    if (!pagamentoOnline) {
      await inviaEmailConfermaOrdine(ordine.ordineId).catch(() => {});
    }
    await inviaNotificaNuovoOrdine(ordine.ordineId).catch(() => {});
    await inviaNotificaNuovoOrdineNtfy(ordine.ordineId).catch(() => {});
  }

  return {
    ok: ordini.length > 0 || errori.length === 0,
    checkoutKey,
    ordini,
    errori,
  };
}
