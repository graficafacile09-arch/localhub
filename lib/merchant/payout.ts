/**
 * SERVIZIO PAYOUT AREA VENDITORE — V1 (calcolo + tracciamento interno).
 *
 * Payout = netto da erogare al venditore per periodo, calcolato SOLO dagli
 * snapshot di `ordini` (payment_*, commissione_importo) con la stessa formula
 * di lib/incassi.ts (commissione effettiva proporzionale ai rimborsi).
 *
 * OWNERSHIP: canManageStore (owner o admin) PRIMA di ogni operazione; la
 * lettura gira con createServerSupabaseClient() (RLS: il venditore vede
 * solo i payout dei propri negozi). La scrittura (calcolo, azioni di stato)
 * passa dalle RPC service-role che ri-verificano ownership/admin.
 *
 * Nessun Transfer/Payout Stripe reale in V1: `calcolaPayout` calcola e
 * registra il payout interno (stato 'calcolato'); le azioni di stato sono
 * amministrative (in_erogazione/pagato/fallito/annullato).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canManageStore } from "./data";
import {
  calcolaEconomiaOrdine,
  sommaIncassi,
} from "@/lib/incassi";

/** Stato di un payout (macchina a stati V1). */
export type StatoPayout =
  | "calcolato"
  | "in_erogazione"
  | "pagato"
  | "fallito"
  | "annullato";

/** Riga payout (tabella payout). */
export type PayoutRiga = {
  id: string;
  negozioId: string;
  periodoDa: string;
  periodoA: string;
  importoLordo: number;
  commissioneImporto: number;
  importoNetto: number;
  nOrdini: number;
  stato: StatoPayout;
  stripeTransferId: string | null;
  stripePayoutId: string | null;
  stripePayoutStatus: string | null;
  errore: string | null;
  creatoAt: string;
  erogatoAt: string | null;
};

/** Dettaglio payout con gli ordini inclusi (per la UI venditore). */
export type PayoutDettaglio = PayoutRiga & {
  ordini: Array<{
    id: string;
    numero: string;
    totale: number;
    paymentAmount: number | null;
    paymentRefundedAmount: number | null;
    paymentStatus: string | null;
    paymentPaidAt: string | null;
    commissioneImporto: number | null;
  }>;
};

/** Riepilogo del negozio (saldo disponibile + storico). */
export type RiepilogoPayoutVenditore = {
  /** Saldo disponibile: netto degli ordini maturati NON ancora coperti da payout. */
  saldoDisponibile: number;
  /** Totale netto già erogato (payout in stato pagato). */
  totaleErogato: number;
  /** Numero payout calcolati non ancora pagati. */
  payoutInCorso: number;
  /** Ultimo payout (più recente), se esiste. */
  ultimoPayout: PayoutRiga | null;
};

type PayoutRow = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mappaPayout(row: PayoutRow): PayoutRiga {
  return {
    id: String(row.id),
    negozioId: String(row.negozio_id),
    periodoDa: String(row.periodo_da),
    periodoA: String(row.periodo_a),
    importoLordo: Number(row.importo_lordo ?? 0),
    commissioneImporto: Number(row.commissione_importo ?? 0),
    importoNetto: Number(row.importo_netto ?? 0),
    nOrdini: Number(row.n_ordini ?? 0),
    stato: (row.stato as StatoPayout) ?? "calcolato",
    stripeTransferId: (row.stripe_transfer_id as string | null) ?? null,
    stripePayoutId: (row.stripe_payout_id as string | null) ?? null,
    stripePayoutStatus: (row.stripe_payout_status as string | null) ?? null,
    errore: (row.errore as string | null) ?? null,
    creatoAt: String(row.created_at ?? ""),
    erogatoAt: (row.erogato_at as string | null) ?? null,
  };
}

/**
 * Saldo disponibile + riepilogo del negozio. Il saldo è calcolato dagli
 * ordini maturati (paid/partially_refunded/refunded) con payout_id NULL:
 * netto venditore effettivo (stessa formula di lib/incassi.ts). Solo i
 * propri ordini (canManageStore + RLS).
 */
export async function getRiepilogoPayoutVenditore(
  userId: string,
  negozioId: string
): Promise<RiepilogoPayoutVenditore> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) {
    return { saldoDisponibile: 0, totaleErogato: 0, payoutInCorso: 0, ultimoPayout: null };
  }

  const db = await createServerSupabaseClient();

  // Ordini maturati non ancora coperti da payout → saldo disponibile.
  const { data: ordini, error: errOrdini } = await db
    .from("ordini")
    .select("totale, commissione_importo, payment_amount, payment_refunded_amount, payment_status")
    .eq("negozio_id", negozioId)
    .in("payment_status", ["paid", "partially_refunded", "refunded"])
    .is("payout_id", null);
  if (errOrdini) {
    throw new Error(`Lettura saldo fallita: ${errOrdini.message}`);
  }
  const economie = ((ordini ?? []) as PayoutRow[]).map((r) =>
    calcolaEconomiaOrdine({
      totale: Number(r.totale ?? 0),
      commissioneImporto: num(r.commissione_importo),
      paymentAmount: num(r.payment_amount),
      paymentRefundedAmount: num(r.payment_refunded_amount),
      paymentStatus: (r.payment_status as string | null) ?? null,
    })
  );
  const riepilogo = sommaIncassi(economie);

  // Storico payout del negozio.
  const { data: payoutRows, error: errPayout } = await db
    .from("payout")
    .select("*")
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });
  if (errPayout) {
    throw new Error(`Lettura payout fallita: ${errPayout.message}`);
  }
  const payout = ((payoutRows ?? []) as PayoutRow[]).map(mappaPayout);
  const totaleErogato = payout
    .filter((p) => p.stato === "pagato")
    .reduce((s, p) => s + p.importoNetto, 0);

  return {
    saldoDisponibile: riepilogo.nettoVenditori,
    totaleErogato: Math.round(totaleErogato * 100) / 100,
    payoutInCorso: payout.filter((p) => ["calcolato", "in_erogazione"].includes(p.stato)).length,
    ultimoPayout: payout[0] ?? null,
  };
}

/** Storico payout del negozio (dal più recente). */
export async function getPayoutVenditore(
  userId: string,
  negozioId: string
): Promise<PayoutRiga[]> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) return [];

  const db = await createServerSupabaseClient();
  const { data, error } = await db
    .from("payout")
    .select("*")
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Lettura payout fallita: ${error.message}`);
  }
  return ((data ?? []) as PayoutRow[]).map(mappaPayout);
}

/** Dettaglio payout del negozio (con ordini inclusi), ownership verificata. */
export async function getPayoutDettaglioVenditore(
  userId: string,
  negozioId: string,
  payoutId: string
): Promise<PayoutDettaglio | null> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) return null;

  const db = await createServerSupabaseClient();
  const { data, error } = await db
    .from("payout")
    .select("*")
    .eq("id", payoutId)
    .eq("negozio_id", negozioId)
    .maybeSingle();
  if (error) {
    throw new Error(`Lettura payout fallita: ${error.message}`);
  }
  if (!data) return null;

  const payout = mappaPayout(data as PayoutRow);

  const { data: ordini, error: errOrdini } = await db
    .from("ordini")
    .select("id, numero, totale, payment_amount, payment_refunded_amount, payment_status, payment_paid_at, commissione_importo")
    .eq("payout_id", payoutId)
    .order("payment_paid_at", { ascending: true });
  if (errOrdini) {
    throw new Error(`Lettura ordini payout fallita: ${errOrdini.message}`);
  }

  return {
    ...payout,
    ordini: ((ordini ?? []) as PayoutRow[]).map((r) => ({
      id: String(r.id),
      numero: String(r.numero ?? ""),
      totale: Number(r.totale ?? 0),
      paymentAmount: num(r.payment_amount),
      paymentRefundedAmount: num(r.payment_refunded_amount),
      paymentStatus: (r.payment_status as string | null) ?? null,
      paymentPaidAt: (r.payment_paid_at as string | null) ?? null,
      commissioneImporto: num(r.commissione_importo),
    })),
  };
}

/**
 * Calcola un payout per periodo (RPC service-role). Restituisce la riga
 * payout (nuova o già esistente per idempotenza). Valida periodo lato
 * server; ownership verificata dalla RPC (difesa in profondità).
 */
export async function calcolaPayoutVenditore(
  userId: string,
  negozioId: string,
  periodoDa: string,
  periodoA: string
): Promise<
  | { ok: true; payout: PayoutRiga; giaEsistente: boolean }
  | { ok: false; codice: string; messaggio: string; status: number }
> {
  const puòGestire = await canManageStore(userId, negozioId);
  if (!puòGestire) {
    return { ok: false, codice: "FORBIDDEN", messaggio: "Non puoi gestire questo negozio.", status: 403 };
  }
  if (!periodoDa || !periodoA || periodoDa > periodoA) {
    return { ok: false, codice: "PERIODO_NON_VALIDO", messaggio: "Periodo non valido.", status: 422 };
  }

  const db = createAdminSupabaseClient();
  const { data, error } = await db.rpc("payout_calcola", {
    p_negozio_id: negozioId,
    p_periodo_da: periodoDa,
    p_periodo_a: periodoA,
    p_creato_da: userId,
  });
  if (error) {
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Impossibile calcolare il payout.", status: 500 };
  }
  const esito = data as unknown as {
    ok?: boolean;
    giaEsistente?: boolean;
    codice?: string;
    messaggio?: string;
    payout?: Record<string, unknown>;
  };
  if (esito?.ok !== true) {
    const codice = String(esito?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      messaggio: String(esito?.messaggio ?? "Impossibile calcolare il payout."),
      status: codice === "FORBIDDEN" ? 403 : 422,
    };
  }
  return {
    ok: true,
    giaEsistente: esito.giaEsistente === true,
    payout: mappaPayout((esito.payout ?? {}) as PayoutRow),
  };
}
