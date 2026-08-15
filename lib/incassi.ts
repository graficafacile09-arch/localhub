/**
 * INCASSI InCittà — CALCOLI ECONOMICI PURI (V1 rendicontazione, solo server).
 *
 * Tutti i calcoli monetari avvengono QUI, server-side e deterministici in
 * centesimi (Math.round). Nessun importo/commissione arriva mai dal client.
 * La fonte è ESCLUSIVAMENTE lo snapshot già presente su `ordini`:
 *   - totale (ordini.totale)
 *   - commissione_percentuale / commissione_importo (20260904)
 *   - payment_amount / payment_refunded_amount / payment_status /
 *     payment_provider / payment_paid_at / payment_refunded_at (20260818+)
 *
 * SEMANTICA DEI CAMPI DERIVATI (per singolo ordine):
 *   - commissioneMaturata  = snapshot commissione_importo (la commissione
 *     che la piattaforma matura sull'ordine, determinata alla CREAZIONE dalla
 *     RPC crea_ordine/crea_ordine_carrello — mai ricalcolata qui);
 *   - importoPagato        = payment_amount (quanto il cliente ha pagato);
 *   - importoRimborsato    = payment_refunded_amount (quanto è stato
 *     restituito al cliente; prenotazione rimborso inclusa);
 *   - nettoPagato          = importoPagato − importoRimborsato (incasso
 *     effettivo del marketplace dopo i rimborsi);
 *   - commissioneEffettiva = quota di commissione coerente con il rimborso:
 *       · rimborso TOTALE (rimborsato ≥ pagato) → 0 (Stripe Connect rimborsa
 *         anche l'application_fee: la piattaforma non trattiene nulla);
 *       · rimborso PARZIALE → commissioneMaturata × (nettoPagato / pagato)
 *         proporzionale all'importo effettivamente trattenuto;
 *       · nessun rimborso   → commissioneMaturata;
 *       · ordine non pagato → 0;
 *   - nettoVenditoreEffettivo = nettoPagato − commissioneEffettiva (quanto
 *     il venditore ha DAVVERO incassato a valle di commissioni e rimborsi);
 *   - nettoVenditoreMaturato  = totale − commissioneMaturata (netto teorico
 *     se l'ordine fosse interamente pagato e mai rimborsato — dato
 *     informativo, separato dal dato effettivo).
 *
 * AGGREGATI (per negozio / periodo / piattaforma):
 *   - gmv                  = Σ importoPagato (volume lordo incassato);
 *   - incassato            = Σ nettoPagato (dopo i rimborsi);
 *   - commissioni          = Σ commissioneEffettiva (commissione trattenuta);
 *   - rimborsi             = Σ importoRimborsato;
 *   - nettoVenditori       = Σ nettoVenditoreEffettivo = incassato − commissioni;
 *   - ordiniPagati         = conteggio ordini con pagamento avvenuto
 *                            (payment_status ∈ paid | partially_refunded | refunded);
 *   - ordiniRimborsati     = conteggio ordini con importoRimborsato > 0;
 *   - ordiniRimborsatiTotali = conteggio ordini rimborsati al 100%.
 *
 * La V1 è SOLO rendicontazione: non altera payment_status, non tocca stock,
 * non crea payout. Stripe Connect/application_fee resta la fonte del
 * movimento reale; la piattaforma usa questi snapshot per la propria
 * contabilità interna.
 */

/** Dati grezzi di un ordine usati per il calcolo economico. */
export type InputEconomiaOrdine = {
  /** Totale ordine (ordini.totale, €). */
  totale: number;
  /** Snapshot commissione (ordini.commissione_importo, €; null = storico pre-20260904). */
  commissioneImporto: number | null;
  /** Importo pagato dal cliente (ordini.payment_amount, €). */
  paymentAmount: number | null;
  /** Importo rimborsato (ordini.payment_refunded_amount, €). */
  paymentRefundedAmount: number | null;
  /** Stato pagamento (ordini.payment_status). */
  paymentStatus: string | null;
};

/** Dati economici DERIVATI di un singolo ordine (mai dal client). */
export type EconomiaOrdine = {
  /** Commissione maturata alla creazione (snapshot; null = ordine storico). */
  commissioneMaturata: number | null;
  /** Importo pagato dal cliente (0 se non pagato). */
  importoPagato: number;
  /** Importo rimborsato (0 se nessun rimborso). */
  importoRimborsato: number;
  /** Incasso effettivo del marketplace dopo i rimborsi (pagato − rimborsato). */
  nettoPagato: number;
  /** Quota di commissione effettivamente trattenuta (coerente coi rimborsi). */
  commissioneEffettiva: number;
  /** Netto venditore effettivo (nettoPagato − commissioneEffettiva). */
  nettoVenditoreEffettivo: number;
  /** Netto venditore maturato (totale − commissioneMaturata; informativo). */
  nettoVenditoreMaturato: number | null;
  /** True se l'ordine è stato pagato (payment_status ∈ paid/partially_refunded/refunded). */
  pagato: boolean;
  /** True se l'ordine ha un rimborso (importoRimborsato > 0). */
  rimborsato: boolean;
  /** True se l'ordine è rimborsato al 100%. */
  rimborsatoTotalmente: boolean;
};

/** Arrotondamento deterministico in centesimi (mai float sporchi). */
function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Stato considerato "pagato" (il denaro è stato incassato dal marketplace). */
const STATI_PAGATI = new Set(["paid", "partially_refunded", "refunded"]);

/**
 * Calcola i dati economici derivati di un ordine (funzione PURA, testabile).
 * Regole (tutte in centesimi, deterministiche):
 *   - commissioneEffettiva: 0 se non pagato o rimborso totale; proporzionale
 *     al nettoPagato in caso di rimborso parziale; altrimenti maturata;
 *   - clamp: commissioneEffettiva ≥ 0 e ≤ max(0, nettoPagato).
 */
export function calcolaEconomiaOrdine(input: InputEconomiaOrdine): EconomiaOrdine {
  const totale = Number.isFinite(input.totale) ? input.totale : 0;
  const maturata =
    input.commissioneImporto !== null && Number.isFinite(input.commissioneImporto)
      ? cents(Math.max(0, input.commissioneImporto))
      : null;
  const pagato = Number.isFinite(input.paymentAmount) ? cents(Math.max(0, input.paymentAmount ?? 0)) : 0;
  const rimborsato = Number.isFinite(input.paymentRefundedAmount)
    ? cents(Math.max(0, input.paymentRefundedAmount ?? 0))
    : 0;
  const nettoPagato = cents(Math.max(0, pagato - rimborsato));

  const status = input.paymentStatus ?? null;
  const pagatoFlag = STATI_PAGATI.has(status ?? "") && pagato > 0;
  const rimborsatoFlag = rimborsato > 0;
  const rimborsatoTotale = rimborsatoFlag && rimborsato >= pagato && pagato > 0;

  // Commissione effettiva (coerente coi rimborsi):
  //   - non pagato → 0; rimborso totale → 0 (fee rimborsata anche su Connect);
  //   - rimborso parziale → proporzionale al nettoPagato/pagato;
  //   - nessun rimborso → commissione maturata.
  let commissioneEffettiva = 0;
  if (maturata !== null && pagatoFlag) {
    if (rimborsatoTotale) {
      commissioneEffettiva = 0;
    } else if (rimborsato > 0) {
      const quota = maturata * (nettoPagato / pagato);
      commissioneEffettiva = cents(Math.max(0, Math.min(quota, nettoPagato)));
    } else {
      commissioneEffettiva = cents(Math.min(maturata, nettoPagato));
    }
  }
  commissioneEffettiva = cents(Math.max(0, Math.min(commissioneEffettiva, nettoPagato)));

  const nettoEffettivo = cents(nettoPagato - commissioneEffettiva);
  const nettoMaturato =
    maturata !== null ? cents(Math.max(0, totale - maturata)) : null;

  return {
    commissioneMaturata: maturata,
    importoPagato: pagato,
    importoRimborsato: rimborsato,
    nettoPagato,
    commissioneEffettiva,
    nettoVenditoreEffettivo: nettoEffettivo,
    nettoVenditoreMaturato: nettoMaturato,
    pagato: pagatoFlag,
    rimborsato: rimborsatoFlag,
    rimborsatoTotalmente: rimborsatoTotale,
  };
}

/** Riepilogo aggregato degli incassi (per negozio / periodo / piattaforma). */
export type RiepilogoIncassi = {
  /** Σ importoPagato — volume lordo incassato (GMV). */
  gmv: number;
  /** Σ nettoPagato — incasso effettivo dopo i rimborsi. */
  incassato: number;
  /** Σ commissioneEffettiva — commissione piattaforma trattenuta. */
  commissioni: number;
  /** Σ importoRimborsato — totale rimborsato ai clienti. */
  rimborsi: number;
  /** Σ nettoVenditoreEffettivo — netto venditori (= incassato − commissioni). */
  nettoVenditori: number;
  /** Conteggio ordini pagati (paid/partially_refunded/refunded). */
  ordiniPagati: number;
  /** Conteggio ordini con almeno un rimborso. */
  ordiniRimborsati: number;
  /** Conteggio ordini rimborsati al 100%. */
  ordiniRimborsatiTotali: number;
  /** Conteggio totale di ordini considerati. */
  totaleOrdini: number;
};

/** Somma i dati economici di più ordini in un riepilogo (funzione PURA). */
export function sommaIncassi(economie: EconomiaOrdine[]): RiepilogoIncassi {
  let gmv = 0;
  let incassato = 0;
  let commissioni = 0;
  let rimborsi = 0;
  let nettoVenditori = 0;
  let ordiniPagati = 0;
  let ordiniRimborsati = 0;
  let ordiniRimborsatiTotali = 0;
  for (const e of economie) {
    gmv = cents(gmv + e.importoPagato);
    incassato = cents(incassato + e.nettoPagato);
    commissioni = cents(commissioni + e.commissioneEffettiva);
    rimborsi = cents(rimborsi + e.importoRimborsato);
    nettoVenditori = cents(nettoVenditori + e.nettoVenditoreEffettivo);
    if (e.pagato) ordiniPagati++;
    if (e.rimborsato) ordiniRimborsati++;
    if (e.rimborsatoTotalmente) ordiniRimborsatiTotali++;
  }
  return {
    gmv,
    incassato,
    commissioni,
    rimborsi,
    nettoVenditori,
    ordiniPagati,
    ordiniRimborsati,
    ordiniRimborsatiTotali,
    totaleOrdini: economie.length,
  };
}

/** Invarianti di sanità dei calcoli (usate dai test e dal read-side). */
export function verificaInvarianti(e: EconomiaOrdine): boolean {
  if (e.importoPagato < 0 || e.importoRimborsato < 0 || e.nettoPagato < 0) return false;
  if (e.importoRimborsato > e.importoPagato && e.importoPagato > 0) return false; // mai over-refund
  if (e.commissioneEffettiva < 0 || e.commissioneEffettiva > e.nettoPagato) return false;
  if (Math.abs(e.nettoVenditoreEffettivo - (e.nettoPagato - e.commissioneEffettiva)) > 0.001) return false;
  return true;
}
