/**
 * SERVIZIO PAYOUT AREA AMMINISTRATORE — V1 (supervisione globale).
 *
 * Payout interni di TUTTI i negozi (calcolo + tracciamento). La lettura usa
 * createServerSupabaseClient() (RLS admin: vede tutto); le azioni di stato
 * passano dalle RPC service-role (payout_segna_erogato / payout_annulla),
 * che NON creano transfer/payout reali su Stripe (V1 interna).
 *
 * L'accesso è garantito dal layout admin + requireApiArea("admin") nelle
 * route; la RLS admin delimita ogni lettura (mai filtri client-side).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StatoPayout } from "@/lib/merchant/payout";

/** Filtri dell'elenco payout admin (server-side). */
export type FiltriPayoutAdmin = {
  negozioId?: string;
  stato?: string;
  dataDa?: string;
  dataA?: string;
  pagina?: number;
  perPagina?: number;
};

/** Riga payout admin (con nome negozio). */
export type PayoutAdminRiga = {
  id: string;
  negozioId: string;
  negozioNome: string;
  periodoDa: string;
  periodoA: string;
  importoLordo: number;
  commissioneImporto: number;
  importoNetto: number;
  nOrdini: number;
  stato: StatoPayout;
  stripePayoutId: string | null;
  stripePayoutStatus: string | null;
  errore: string | null;
  creatoAt: string;
  erogatoAt: string | null;
};

/** Riepilogo aggregato globale. */
export type RiepilogoPayoutAdmin = {
  /** Netto totale in stato 'calcolato' (da erogare). */
  daErogare: number;
  /** Netto totale in stato 'in_erogazione'. */
  inErogazione: number;
  /** Netto totale in stato 'pagato'. */
  pagato: number;
  /** Conteggio payout in stato 'fallito'. */
  falliti: number;
  /** Netto totale in stato 'fallito'. */
  importoFalliti: number;
  /** Conteggio totale payout. */
  totalePayout: number;
};

export type RiconciliazionePayoutAdmin = {
  ok: boolean;
  ordiniAssociati: number;
  ordiniConImporto: number;
  lordoOrdini: number;
  commissioneOrdini: number;
  nettoCalcolato: number;
  lordoPayout: number;
  commissionePayout: number;
  nettoPayout: number;
  differenzaLordo: number;
  differenzaCommissione: number;
  differenzaNetto: number;
  ordiniFuoriNegozio: number;
  ordiniConStatoNonValido: number;
  ordiniSenzaDataPagamento: number;
  ordiniDuplicati: number;
  ordiniFuoriPeriodo: number;
  errori: string[];
};

export type RisultatoPayoutAdmin = {
  riepilogo: RiepilogoPayoutAdmin;
  payout: PayoutAdminRiga[];
  totale: number;
  pagina: number;
  perPagina: number;
  pagineTotali: number;
};

const DEFAULT_PER_PAGINA = 20;
const MAX_PER_PAGINA = 100;

type PayoutRow = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mappaPayout(row: PayoutRow): PayoutAdminRiga {
  return {
    id: String(row.id),
    negozioId: String(row.negozio_id ?? ""),
    negozioNome: String(row.negozio_nome ?? ""),
    periodoDa: String(row.periodo_da),
    periodoA: String(row.periodo_a),
    importoLordo: Number(row.importo_lordo ?? 0),
    commissioneImporto: Number(row.commissione_importo ?? 0),
    importoNetto: Number(row.importo_netto ?? 0),
    nOrdini: Number(row.n_ordini ?? 0),
    stato: (row.stato as StatoPayout) ?? "calcolato",
    stripePayoutId: (row.stripe_payout_id as string | null) ?? null,
    stripePayoutStatus: (row.stripe_payout_status as string | null) ?? null,
    errore: (row.errore as string | null) ?? null,
    creatoAt: String(row.creato_at ?? ""),
    erogatoAt: (row.erogato_at as string | null) ?? null,
  };
}

/** Query builder con i filtri applicati (condivisa tra elenco e riepilogo). */
function applicaFiltri(query: any, filtri: FiltriPayoutAdmin) {
  let q = query;
  if (filtri.negozioId) q = q.eq("negozio_id", filtri.negozioId);
  if (filtri.stato) q = q.eq("stato", filtri.stato);
  if (filtri.dataDa) q = q.gte("periodo_da", filtri.dataDa);
  if (filtri.dataA) q = q.lte("periodo_a", filtri.dataA);
  return q;
}

/**
 * Elenco GLOBALE payout (tutti i negozi) con filtri e paginazione
 * server-side, + riepilogo aggregato. RLS admin: vede tutto.
 */
export async function getPayoutAdmin(
  filtri: FiltriPayoutAdmin = {}
): Promise<RisultatoPayoutAdmin> {
  const db = await createServerSupabaseClient();
  const perPagina = Math.min(
    Math.max(1, Number(filtri.perPagina) || DEFAULT_PER_PAGINA),
    MAX_PER_PAGINA
  );
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  // Conteggio totale.
  const countQuery = applicaFiltri(
    db.from("payout").select("id", { head: true, count: "exact" }),
    filtri
  );
  const { count, error: errCount } = await countQuery;
  if (errCount) {
    throw new Error(`Conteggio payout fallito: ${errCount.message}`);
  }
  const totale = count ?? 0;

  // Pagina corrente (più recenti prima), con nome negozio (join embedded).
  const listaQuery = applicaFiltri(
    db.from("payout").select("*, negozi(nome)"),
    filtri
  )
    .order("creato_at", { ascending: false })
    .range((pagina - 1) * perPagina, pagina * perPagina - 1);
  const { data, error } = await listaQuery;
  if (error) {
    throw new Error(`Lettura payout fallita: ${error.message}`);
  }

  const righe = ((data ?? []) as PayoutRow[]).map((r) => {
    const negozi = (r.negozi ?? null) as { nome?: string } | null;
    return mappaPayout({ ...r, negozio_nome: negozi?.nome ?? "" });
  });

  // Riepilogo aggregato su TUTTI i payout (non solo la pagina).
  const riepilogoQuery = applicaFiltri(
    db.from("payout").select("stato, importo_netto"),
    filtri
  );
  const { data: dataRiep, error: errRiep } = await riepilogoQuery;
  if (errRiep) {
    throw new Error(`Lettura riepilogo payout fallita: ${errRiep.message}`);
  }
  const riepilogo: RiepilogoPayoutAdmin = {
    daErogare: 0,
    inErogazione: 0,
    pagato: 0,
    falliti: 0,
    importoFalliti: 0,
    totalePayout: (dataRiep ?? []).length,
  };
  for (const r of (dataRiep ?? []) as PayoutRow[]) {
    const importo = Number(r.importo_netto ?? 0);
    if (r.stato === "calcolato") riepilogo.daErogare += importo;
    else if (r.stato === "in_erogazione") riepilogo.inErogazione += importo;
    else if (r.stato === "pagato") riepilogo.pagato += importo;
    else if (r.stato === "fallito") {
      riepilogo.falliti += 1;
      riepilogo.importoFalliti += importo;
    }
  }
  riepilogo.daErogare = Math.round(riepilogo.daErogare * 100) / 100;
  riepilogo.inErogazione = Math.round(riepilogo.inErogazione * 100) / 100;
  riepilogo.pagato = Math.round(riepilogo.pagato * 100) / 100;
  riepilogo.importoFalliti = Math.round(riepilogo.importoFalliti * 100) / 100;

  return {
    riepilogo,
    payout: righe,
    totale,
    pagina,
    perPagina,
    pagineTotali: totale === 0 ? 0 : Math.ceil(totale / perPagina),
  };
}

/**
 * Calcola un payout per un negozio e periodo (admin).
 * Il calcolo resta interno: non crea Transfer/Payout Stripe reali.
 */
export async function calcolaPayoutAdmin(
  negozioId: string,
  periodoDa: string,
  periodoA: string,
  creatoDa?: string | null
): Promise<
  | { ok: true; giaEsistente: boolean; payout: Record<string, unknown> }
  | { ok: false; codice: string; messaggio: string; status: number }
> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("payout_calcola", {
    p_negozio_id: negozioId,
    p_periodo_da: periodoDa,
    p_periodo_a: periodoA,
    p_creato_da: creatoDa ?? null,
  });
  if (error) {
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile calcolare il payout.", status: 500 };
  }
  const esito = data as unknown as {
    ok?: boolean;
    giaEsistente?: boolean;
    payout?: Record<string, unknown>;
    codice?: string;
    messaggio?: string;
  };
  if (esito?.ok !== true || !esito.payout) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile calcolare il payout."),
      status: codice === "NEGOZIO_NON_TROVATO" ? 404 : codice === "FORBIDDEN" ? 403 : 409,
    };
  }
  return {
    ok: true,
    giaEsistente: esito.giaEsistente === true,
    payout: esito.payout,
  };
}

/** Dettaglio payout (admin, read-only). */
function arrotonda2(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
}

/**
 * Riconciliazione contabile read-only del payout.
 * Non modifica ordini, payout o Stripe: ricostruisce il totale dagli ordini
 * timbrati con payout_id e verifica gli invarianti economici.
 */
export function riconciliaOrdiniPayout(
  payout: PayoutAdminRiga,
  ordini: Array<Record<string, unknown>>
): RiconciliazionePayoutAdmin {
  const errori: string[] = [];
  let lordoOrdini = 0;
  let commissioneOrdini = 0;
  let nettoCalcolato = 0;
  let ordiniConImporto = 0;
  let ordiniFuoriNegozio = 0;
  let ordiniConStatoNonValido = 0;
  let ordiniSenzaDataPagamento = 0;
  const ids = new Set<string>();
  let ordiniDuplicati = 0;
  let ordiniFuoriPeriodo = 0;

  for (const o of ordini) {
    const id = String(o.id ?? "");
    if (id && ids.has(id)) ordiniDuplicati += 1;
    if (id) ids.add(id);

    const negozioId = o.negozio_id == null ? payout.negozioId : String(o.negozio_id);
    if (negozioId !== payout.negozioId) ordiniFuoriNegozio += 1;

    const stato = String(o.payment_status ?? "");
    if (!["paid", "partially_refunded", "refunded"].includes(stato)) ordiniConStatoNonValido += 1;

    if (!o.payment_paid_at) ordiniSenzaDataPagamento += 1;
    else {
      const data = String(o.payment_paid_at).slice(0, 10);
      if (data < payout.periodoDa || data > payout.periodoA) ordiniFuoriPeriodo += 1;
    }

    const pagato = Number(o.payment_amount ?? 0);
    const rimborsato = Number(o.payment_refunded_amount ?? 0);
    const commissioneMaturata = Number(o.commissione_importo ?? 0);
    const nettoPagato = arrotonda2(pagato - rimborsato);
    if (nettoPagato <= 0) continue;

    let commissione = commissioneMaturata;
    if (rimborsato >= pagato || pagato <= 0) commissione = 0;
    else if (rimborsato > 0) commissione = arrotonda2(commissioneMaturata * (nettoPagato / pagato));
    commissione = Math.max(0, Math.min(commissione, nettoPagato));

    lordoOrdini = arrotonda2(lordoOrdini + nettoPagato);
    commissioneOrdini = arrotonda2(commissioneOrdini + commissione);
    nettoCalcolato = arrotonda2(nettoCalcolato + nettoPagato - commissione);
    ordiniConImporto += 1;
  }

  const differenzaLordo = arrotonda2(lordoOrdini - payout.importoLordo);
  const differenzaCommissione = arrotonda2(commissioneOrdini - payout.commissioneImporto);
  const differenzaNetto = arrotonda2(nettoCalcolato - payout.importoNetto);

  if (differenzaLordo !== 0) errori.push("Il lordo degli ordini non coincide con il lordo del payout.");
  if (differenzaCommissione !== 0) errori.push("La commissione degli ordini non coincide con quella del payout.");
  if (differenzaNetto !== 0) errori.push("Il netto degli ordini non coincide con il netto del payout.");
  if (ordiniFuoriNegozio > 0) errori.push("Sono presenti ordini appartenenti a un negozio diverso.");
  if (ordiniConStatoNonValido > 0) errori.push("Sono presenti ordini con stato pagamento non valido.");
  if (ordiniSenzaDataPagamento > 0) errori.push("Sono presenti ordini senza data di pagamento.");
  if (ordiniDuplicati > 0) errori.push("Sono presenti ordini duplicati nel dettaglio.");
  if (ordiniFuoriPeriodo > 0) errori.push("Sono presenti ordini fuori dal periodo del payout.");

  return {
    ok: errori.length === 0 && ordiniConImporto === payout.nOrdini,
    ordiniAssociati: ordini.length,
    ordiniConImporto,
    lordoOrdini,
    commissioneOrdini,
    nettoCalcolato,
    lordoPayout: payout.importoLordo,
    commissionePayout: payout.commissioneImporto,
    nettoPayout: payout.importoNetto,
    differenzaLordo,
    differenzaCommissione,
    differenzaNetto,
    ordiniFuoriNegozio,
    ordiniConStatoNonValido,
    ordiniSenzaDataPagamento,
    ordiniDuplicati,
    errori: ordini.length !== payout.nOrdini
      ? [...errori, "Il numero di ordini associati non coincide con quello registrato nel payout."]
      : errori,
  };
}

/**
  payoutId: string
): Promise<PayoutAdminRiga & { ordini: Array<Record<string, unknown>>; riconciliazione: RiconciliazionePayoutAdmin } | null> {
  const db = await createServerSupabaseClient();
  const { data, error } = await db
    .from("payout")
    .select("*, negozi(nome)")
    .eq("id", payoutId)
    .maybeSingle();
  if (error) {
    throw new Error(`Lettura payout fallita: ${error.message}`);
  }
  if (!data) return null;
  const r = data as PayoutRow;
  const negozi = (r.negozi ?? null) as { nome?: string } | null;

  const { data: ordini, error: errOrdini } = await db
    .from("ordini")
    .select("id, numero, negozio_id, totale, payment_amount, payment_refunded_amount, payment_status, payment_paid_at, commissione_importo")
    .eq("payout_id", payoutId)
    .order("payment_paid_at", { ascending: true });
  if (errOrdini) {
    throw new Error(`Lettura ordini payout fallita: ${errOrdini.message}`);
  }

  return {
    ...mappaPayout({ ...r, negozio_nome: negozi?.nome ?? "" }),
    ordini: (ordini ?? []) as Array<Record<string, unknown>>,
    riconciliazione: riconciliaOrdiniPayout(
      mappaPayout({ ...r, negozio_nome: negozi?.nome ?? "" }),
      (ordini ?? []) as Array<Record<string, unknown>>
    ),
  };
}

/**
 * Aggiorna lo stato di un payout (admin): 'in_erogazione' | 'pagato' |
 * 'fallito' via RPC service-role. Nessuna chiamata Stripe in V1.
 */
export async function aggiornaStatoPayoutAdmin(
  payoutId: string,
  nuovoStato: "in_erogazione" | "pagato" | "fallito",
  opts: {
    stripePayoutId?: string | null;
    stripePayoutStatus?: string | null;
    errore?: string | null;
  } = {}
): Promise<
  | { ok: true; cambiato: boolean; stato: string }
  | { ok: false; codice: string; messaggio: string; status: number }
> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("payout_segna_erogato", {
    p_payout_id: payoutId,
    p_nuovo_stato: nuovoStato,
    p_stripe_payout_id: opts.stripePayoutId ?? null,
    p_stripe_payout_status: opts.stripePayoutStatus ?? null,
    p_errore: opts.errore ?? null,
  });
  if (error) {
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile aggiornare il payout.", status: 500 };
  }
  const esito = data as unknown as {
    ok?: boolean;
    cambiato?: boolean;
    stato?: string;
    codice?: string;
    messaggio?: string;
  };
  if (esito?.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile aggiornare il payout."),
      status: codice === "PAYOUT_NON_TROVATO" ? 404 : 409,
    };
  }
  return { ok: true, cambiato: esito.cambiato ?? false, stato: String(esito.stato ?? nuovoStato) };
}

/** Annulla un payout (admin, solo da 'calcolato'). */
export async function annullaPayoutAdmin(
  payoutId: string
): Promise<
  | { ok: true; cambiato: boolean; stato: string }
  | { ok: false; codice: string; messaggio: string; status: number }
> {
  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("payout_annulla", {
    p_payout_id: payoutId,
  });
  if (error) {
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile annullare il payout.", status: 500 };
  }
  const esito = data as unknown as {
    ok?: boolean;
    cambiato?: boolean;
    stato?: string;
    codice?: string;
    messaggio?: string;
  };
  if (esito?.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile annullare il payout."),
      status: codice === "PAYOUT_NON_TROVATO" ? 404 : 409,
    };
  }
  return { ok: true, cambiato: esito.cambiato ?? false, stato: String(esito.stato ?? "annullato") };
}
