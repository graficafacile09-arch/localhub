/**
 * SERVIZIO INCASSI AREA AMMINISTRATORE — RENDICONTAZIONE GLOBALE (V1).
 *
 * Fonte: snapshot economici su `ordini` + calcoli puri di lib/incassi.ts.
 * La lettura usa createServerSupabaseClient() (RLS): l'admin vede TUTTI gli
 * ordini grazie alla policy "ordini admin select all" — mai un bypass
 * service-role, mai un filtro client-side sul dataset completo.
 *
 * Riepilogo globale: GMV, incassato, commissioni, rimborsi, netto venditori,
 * conteggi ordini pagati/rimborsati. Elenco dettagliato con i dati
 * economici per singolo ordine. Filtri SERVER-SIDE: periodo, negozio,
 * provider, stato pagamento, stato ordine.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  calcolaEconomiaOrdine,
  sommaIncassi,
  type EconomiaOrdine,
  type RiepilogoIncassi,
} from "@/lib/incassi";

/** Filtri degli incassi admin (server-side, tutti facoltativi). */
export type FiltriIncassiAdmin = {
  dataDa?: string;
  dataA?: string;
  negozioId?: string;
  provider?: string;
  pagamento?: string;
  stato?: string;
  pagina?: number;
  perPagina?: number;
};

/** Riga dell'elenco incassi admin (ordine + negozio + dati economici). */
export type RigaIncassoAdmin = {
  id: string;
  numero: string;
  stato: string;
  modalita: "ritiro" | "spedizione";
  totale: number;
  createdAt: string;
  negozioId: string;
  negozioNome: string;
  clienteNome: string;
  clienteCognome: string;
  paymentStatus: string | null;
  paymentProvider: string | null;
  paymentAmount: number | null;
  paymentRefundedAmount: number | null;
  paymentPaidAt: string | null;
  paymentRefundedAt: string | null;
  commissionePercentuale: number | null;
  economia: EconomiaOrdine;
};

/** Risultato completo: riepilogo globale + elenco paginato. */
export type IncassiAdmin = {
  riepilogo: RiepilogoIncassi;
  ordini: RigaIncassoAdmin[];
  pagina: number;
  perPagina: number;
  totaleOrdini: number;
  pagineTotali: number;
};

const DEFAULT_PER_PAGINA = 25;
const MAX_PER_PAGINA = 100;

type OrdineRow = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mappaRiga(row: OrdineRow): RigaIncassoAdmin {
  const economia = calcolaEconomiaOrdine({
    totale: Number(row.totale ?? 0),
    commissioneImporto: num(row.commissione_importo),
    paymentAmount: num(row.payment_amount),
    paymentRefundedAmount: num(row.payment_refunded_amount),
    paymentStatus: (row.payment_status as string | null) ?? null,
  });
  return {
    id: String(row.id),
    numero: String(row.numero ?? ""),
    stato: String(row.stato ?? ""),
    modalita: (row.modalita as "ritiro" | "spedizione") ?? "ritiro",
    totale: Number(row.totale ?? 0),
    createdAt: String(row.created_at ?? ""),
    negozioId: String(row.negozio_id ?? ""),
    negozioNome: String(row.negozio_nome ?? ""),
    clienteNome: String(row.cliente_nome ?? ""),
    clienteCognome: String(row.cliente_cognome ?? ""),
    paymentStatus: (row.payment_status as string | null) ?? null,
    paymentProvider: (row.payment_provider as string | null) ?? null,
    paymentAmount: num(row.payment_amount),
    paymentRefundedAmount: num(row.payment_refunded_amount),
    paymentPaidAt: (row.payment_paid_at as string | null) ?? null,
    paymentRefundedAt: (row.payment_refunded_at as string | null) ?? null,
    commissionePercentuale: num(row.commissione_percentuale),
    economia,
  };
}

/** Query builder con i filtri applicati (condivisa tra elenco e conteggio). */
function applicaFiltri(query: any, filtri: FiltriIncassiAdmin) {
  let q = query;
  if (filtri.dataDa) q = q.gte("created_at", filtri.dataDa);
  if (filtri.dataA) q = q.lte("created_at", filtri.dataA);
  if (filtri.negozioId) q = q.eq("negozio_id", filtri.negozioId);
  if (filtri.provider) q = q.eq("payment_provider", filtri.provider);
  if (filtri.pagamento) q = q.eq("payment_status", filtri.pagamento);
  if (filtri.stato) q = q.eq("stato", filtri.stato);
  return q;
}

/**
 * Incassi globali (tutti i negozi): riepilogo aggregato + elenco paginato
 * con dettaglio economico per ordine. Filtri SERVER-SIDE; la RLS admin
 * delimita l'accesso (mai filtri client-side sull'intero dataset).
 */
export async function getIncassiAdmin(
  filtri: FiltriIncassiAdmin = {}
): Promise<IncassiAdmin> {
  const db = await createServerSupabaseClient();
  const perPagina = Math.min(
    Math.max(1, Number(filtri.perPagina) || DEFAULT_PER_PAGINA),
    MAX_PER_PAGINA
  );
  const pagina = Math.max(1, Number(filtri.pagina) || 1);

  // Conteggio totale (per la paginazione) con gli stessi filtri.
  const countQuery = applicaFiltri(
    db.from("ordini").select("id", { head: true, count: "exact" }),
    filtri
  );
  const { count, error: erroreCount } = await countQuery;
  if (erroreCount) {
    throw new Error(`Conteggio incassi fallito: ${erroreCount.message}`);
  }
  const totaleOrdini = count ?? 0;

  // Pagina corrente (più recenti prima).
  const listaQuery = applicaFiltri(db.from("ordini").select("*"), filtri)
    .order("created_at", { ascending: false })
    .range((pagina - 1) * perPagina, pagina * perPagina - 1);
  const { data, error } = await listaQuery;
  if (error) {
    throw new Error(`Lettura incassi fallita: ${error.message}`);
  }

  const ordini = ((data ?? []) as OrdineRow[]).map(mappaRiga);

  // Riepilogo aggregato: calcolato su TUTTI gli ordini del filtro, non solo
  // la pagina corrente (query dedicata di soli campi economici).
  const riepilogoQuery = applicaFiltri(
    db.from("ordini").select("totale, commissione_importo, payment_amount, payment_refunded_amount, payment_status"),
    filtri
  );
  const { data: dataRiepilogo, error: erroreRiepilogo } = await riepilogoQuery;
  if (erroreRiepilogo) {
    throw new Error(`Lettura riepilogo incassi fallita: ${erroreRiepilogo.message}`);
  }
  const economie = ((dataRiepilogo ?? []) as OrdineRow[]).map((r) =>
    calcolaEconomiaOrdine({
      totale: Number(r.totale ?? 0),
      commissioneImporto: num(r.commissione_importo),
      paymentAmount: num(r.payment_amount),
      paymentRefundedAmount: num(r.payment_refunded_amount),
      paymentStatus: (r.payment_status as string | null) ?? null,
    })
  );
  const riepilogo = sommaIncassi(economie);

  return {
    riepilogo,
    ordini,
    pagina,
    perPagina,
    totaleOrdini,
    pagineTotali: totaleOrdini === 0 ? 0 : Math.ceil(totaleOrdini / perPagina),
  };
}
