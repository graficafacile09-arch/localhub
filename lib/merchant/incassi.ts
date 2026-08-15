/**
 * SERVIZIO INCASSI AREA VENDITORE — RENDICONTAZIONE (V1, sola lettura).
 *
 * Fonte: snapshot economici già presenti su `ordini` (commissione_*,
 * payment_*) + calcoli puri di lib/incassi.ts. Nessuna nuova colonna,
 * nessun payout: SOLO rendicontazione degli incassi.
 *
 * OWNERSHIP (fondamentale):
 *   - canManageStore (negozi.owner_user_id, oppure admin) PRIMA di leggere;
 *   - filtro server-side su negozio_id OGNI volta: un venditore non può
 *     vedere gli incassi di altri negozi cambiando l'ID nell'URL;
 *   - la lettura gira con createServerSupabaseClient() (RLS): il venditore
 *     vede esclusivamente i propri ordini.
 *
 * Filtri (tutti facoltativi, applicati SERVER-SIDE):
 *   - dataDa / dataA: periodo su created_at;
 *   - pagamento: stato pagamento (payment_status);
 *   - provider: payment_provider;
 *   - stato: stato ordine.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canManageStore } from "./data";
import {
  calcolaEconomiaOrdine,
  sommaIncassi,
  type EconomiaOrdine,
  type RiepilogoIncassi,
} from "@/lib/incassi";

/** Filtri degli incassi venditore (server-side). */
export type FiltriIncassiVenditore = {
  dataDa?: string;
  dataA?: string;
  pagamento?: string;
  provider?: string;
  stato?: string;
};

/** Riga dell'elenco incassi venditore (ordine + dati economici derivati). */
export type RigaIncassoVenditore = {
  id: string;
  numero: string;
  stato: string;
  modalita: "ritiro" | "spedizione";
  totale: number;
  createdAt: string;
  clienteNome: string;
  clienteCognome: string;
  paymentStatus: string | null;
  paymentProvider: string | null;
  paymentPaidAt: string | null;
  paymentRefundedAt: string | null;
  economia: EconomiaOrdine;
};

/** Risultato completo: riepilogo aggregato + elenco dettagliato. */
export type IncassiVenditore = {
  riepilogo: RiepilogoIncassi;
  ordini: RigaIncassoVenditore[];
};

type OrdineRow = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mappaRiga(row: OrdineRow): RigaIncassoVenditore {
  const economica = calcolaEconomiaOrdine({
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
    clienteNome: String(row.cliente_nome ?? ""),
    clienteCognome: String(row.cliente_cognome ?? ""),
    paymentStatus: (row.payment_status as string | null) ?? null,
    paymentProvider: (row.payment_provider as string | null) ?? null,
    paymentPaidAt: (row.payment_paid_at as string | null) ?? null,
    paymentRefundedAt: (row.payment_refunded_at as string | null) ?? null,
    economia: economica,
  };
}

/** Query builder con i filtri applicati (condivisa tra righe e conteggio). */
function applicaFiltri(query: any, filtri: FiltriIncassiVenditore) {
  let q = query;
  if (filtri.dataDa) q = q.gte("created_at", filtri.dataDa);
  if (filtri.dataA) q = q.lte("created_at", filtri.dataA);
  if (filtri.pagamento) q = q.eq("payment_status", filtri.pagamento);
  if (filtri.provider) q = q.eq("payment_provider", filtri.provider);
  if (filtri.stato) q = q.eq("stato", filtri.stato);
  return q;
}

/**
 * Incassi del negozio: riepilogo aggregato + elenco ordini con dettaglio
 * economico, filtri SERVER-SIDE, ownership verificata. Il venditore vede
 * esclusivamente i propri ordini (canManageStore + negozio_id + RLS).
 */
export async function getIncassiVenditore(
  userId: string,
  negozioId: string,
  filtri: FiltriIncassiVenditore = {}
): Promise<IncassiVenditore> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) {
    return { riepilogo: sommaIncassi([]), ordini: [] };
  }

  const db = await createServerSupabaseClient();
  const query = applicaFiltri(
    db.from("ordini").select("*").eq("negozio_id", negozioId),
    filtri
  );
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Lettura incassi fallita: ${error.message}`);
  }

  const ordini = ((data ?? []) as OrdineRow[]).map(mappaRiga);
  const riepilogo = sommaIncassi(ordini.map((o) => o.economia));
  return { riepilogo, ordini };
}
