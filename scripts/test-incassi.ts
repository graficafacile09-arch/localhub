/**
 * TEST INCASSI — CALCOLI ECONOMICI PURI (lib/incassi.ts).
 *
 * Copre: ordine pagato, non pagato, rimborso parziale (commissione
 * proporzionale), rimborso totale (commissione 0), storico NULL, invarianti,
 * aggregati (GMV/incassato/commissioni/rimborsi/netto venditori/conteggi),
 * determinismo in centesimi, clamp commissione ≤ netto. Nessuna rete,
 * nessun DB: funzioni pure.
 *
 * Uso: npx tsx scripts/test-incassi.ts
 */

import {
  calcolaEconomiaOrdine,
  sommaIncassi,
  verificaInvarianti,
  type InputEconomiaOrdine,
} from "@/lib/incassi";

let passati = 0;
let falliti = 0;

function check(label: string, cond: boolean, dettaglio?: unknown) {
  if (cond) {
    passati++;
    console.log(`  ✅ ${label}`);
  } else {
    falliti++;
    console.log(`  ❌ ${label}${dettaglio !== undefined ? ` — ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

function uguali(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

/** Snapshot tipico di un ordine pagato con commissione 10%. */
function ordinePagato(extra: Partial<InputEconomiaOrdine> = {}): InputEconomiaOrdine {
  return {
    totale: 25.0,
    commissioneImporto: 2.5,
    paymentAmount: 25.0,
    paymentRefundedAmount: 0,
    paymentStatus: "paid",
    ...extra,
  };
}

async function main() {
  console.log("\n=== A) ORDINE PAGATO (nessun rimborso) ===\n");
  {
    const e = calcolaEconomiaOrdine(ordinePagato());
    check("importoPagato = 25.00", uguali(e.importoPagato, 25.0), e.importoPagato);
    check("commissioneMaturata = 2.50", uguali(e.commissioneMaturata!, 2.5));
    check("commissioneEffettiva = 2.50", uguali(e.commissioneEffettiva, 2.5), e.commissioneEffettiva);
    check("nettoPagato = 25.00", uguali(e.nettoPagato, 25.0));
    check("nettoVenditoreEffettivo = 22.50", uguali(e.nettoVenditoreEffettivo, 22.5), e.nettoVenditoreEffettivo);
    check("nettoVenditoreMaturato = 22.50", uguali(e.nettoVenditoreMaturato!, 22.5));
    check("pagato = true", e.pagato);
    check("rimborsato = false", !e.rimborsato);
    check("rimborsatoTotalmente = false", !e.rimborsatoTotalmente);
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== B) ORDINE NON PAGATO ===\n");
  {
    const e = calcolaEconomiaOrdine(ordinePagato({ paymentAmount: null, paymentStatus: null }));
    check("importoPagato = 0", uguali(e.importoPagato, 0));
    check("commissioneEffettiva = 0", uguali(e.commissioneEffettiva, 0));
    check("nettoPagato = 0", uguali(e.nettoPagato, 0));
    check("nettoVenditoreEffettivo = 0", uguali(e.nettoVenditoreEffettivo, 0));
    check("pagato = false", !e.pagato);
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== C) RIMBORSO PARZIALE (commissione proporzionale) ===\n");
  {
    // Pagato 25.00, rimborsato 10.00 → nettoPagato 15.00 (60% del pagato).
    const e = calcolaEconomiaOrdine(
      ordinePagato({ paymentRefundedAmount: 10.0, paymentStatus: "partially_refunded" })
    );
    check("importoPagato = 25.00", uguali(e.importoPagato, 25.0));
    check("importoRimborsato = 10.00", uguali(e.importoRimborsato, 10.0));
    check("nettoPagato = 15.00", uguali(e.nettoPagato, 15.0));
    // Commissione effettiva = 2.50 × (15/25) = 1.50.
    check("commissioneEffettiva = 1.50 (proporzionale)", uguali(e.commissioneEffettiva, 1.5), e.commissioneEffettiva);
    check("nettoVenditoreEffettivo = 13.50", uguali(e.nettoVenditoreEffettivo, 13.5), e.nettoVenditoreEffettivo);
    check("rimborsato = true", e.rimborsato);
    check("rimborsatoTotalmente = false", !e.rimborsatoTotalmente);
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== D) RIMBORSO TOTALE (commissione 0, netto 0) ===\n");
  {
    const e = calcolaEconomiaOrdine(
      ordinePagato({ paymentRefundedAmount: 25.0, paymentStatus: "refunded" })
    );
    check("importoRimborsato = 25.00", uguali(e.importoRimborsato, 25.0));
    check("nettoPagato = 0", uguali(e.nettoPagato, 0));
    check("commissioneEffettiva = 0 (fee rimborsata)", uguali(e.commissioneEffettiva, 0), e.commissioneEffettiva);
    check("nettoVenditoreEffettivo = 0", uguali(e.nettoVenditoreEffettivo, 0));
    check("rimborsatoTotalmente = true", e.rimborsatoTotalmente);
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== E) STORICO NULL (commissione assente) ===\n");
  {
    const e = calcolaEconomiaOrdine(
      ordinePagato({ commissioneImporto: null, paymentStatus: "paid" })
    );
    check("commissioneMaturata = null", e.commissioneMaturata === null);
    check("commissioneEffettiva = 0", uguali(e.commissioneEffettiva, 0));
    check("nettoVenditoreEffettivo = 25.00 (tutto al venditore)", uguali(e.nettoVenditoreEffettivo, 25.0), e.nettoVenditoreEffettivo);
    check("nettoVenditoreMaturato = null", e.nettoVenditoreMaturato === null);
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== F) RIMBORSO PARZIALE CON STORICO NULL ===\n");
  {
    const e = calcolaEconomiaOrdine(
      ordinePagato({ commissioneImporto: null, paymentRefundedAmount: 10.0, paymentStatus: "partially_refunded" })
    );
    check("commissioneEffettiva = 0", uguali(e.commissioneEffettiva, 0));
    check("nettoVenditoreEffettivo = 15.00", uguali(e.nettoVenditoreEffettivo, 15.0), e.nettoVenditoreEffettivo);
  }

  console.log("\n=== G) DETERMINISMO IN CENTESIMI + CLAMP ===\n");
  {
    // Commissione > nettoPagato (poco pagato, commissione alta) → clamp.
    const e = calcolaEconomiaOrdine(
      ordinePagato({ totale: 100.0, commissioneImporto: 10.0, paymentAmount: 5.0, paymentStatus: "paid" })
    );
    check("clamp: commissioneEffettiva ≤ nettoPagato (5.00)", uguali(e.commissioneEffettiva, 5.0), e.commissioneEffettiva);
    check("nettoVenditoreEffettivo = 0", uguali(e.nettoVenditoreEffettivo, 0));
    check("invarianti ok", verificaInvarianti(e));

    // Centesimi: 12.34 → 1.23.
    const e2 = calcolaEconomiaOrdine(ordinePagato({ totale: 12.34, commissioneImporto: 1.23, paymentAmount: 12.34 }));
    check("centesimi ok (1.23)", uguali(e2.commissioneEffettiva, 1.23), e2.commissioneEffettiva);
  }

  console.log("\n=== H) AGGREGATI (sommaIncassi) ===\n");
  {
    const economie = [
      calcolaEconomiaOrdine(ordinePagato()), // paid 25, comm 2.5, netto 22.5
      calcolaEconomiaOrdine(ordinePagato({ paymentAmount: null, paymentStatus: null })), // non pagato
      calcolaEconomiaOrdine(
        ordinePagato({ paymentRefundedAmount: 25.0, paymentStatus: "refunded" })
      ), // rimborsato totale
      calcolaEconomiaOrdine(
        ordinePagato({ paymentRefundedAmount: 5.0, paymentStatus: "partially_refunded" })
      ), // rimborso parziale: nettoPagato 20, comm 2.50×20/25=2.00, netto 18
    ];
    const r = sommaIncassi(economie);
    check("gmv = 25+25+25 = 75.00", uguali(r.gmv, 75.0), r.gmv);
    check("incassato = 25+0+0+20 = 45.00", uguali(r.incassato, 45.0), r.incassato);
    check("commissioni = 2.50+0+0+2.00 = 4.50", uguali(r.commissioni, 4.5), r.commissioni);
    check("rimborsi = 0+0+25+5 = 30.00", uguali(r.rimborsi, 30.0), r.rimborsi);
    check("nettoVenditori = 22.50+0+0+18 = 40.50", uguali(r.nettoVenditori, 40.5), r.nettoVenditori);
    check("incassato − commissioni = nettoVenditori", uguali(r.incassato - r.commissioni, r.nettoVenditori));
    check("ordiniPagati = 3", r.ordiniPagati === 3, r.ordiniPagati);
    check("ordiniRimborsati = 2", r.ordiniRimborsati === 2, r.ordiniRimborsati);
    check("ordiniRimborsatiTotali = 1", r.ordiniRimborsatiTotali === 1, r.ordiniRimborsatiTotali);
    check("totaleOrdini = 4", r.totaleOrdini === 4);
  }

  console.log("\n=== I) OVER-REFUND IMPOSSIBILE (invariante) ===\n");
  {
    // Un rimborso > pagato (dato incoerente nel DB) → invariante falso, ma i
    // calcoli restano deterministici senza crash.
    const e = calcolaEconomiaOrdine(
      ordinePagato({ paymentRefundedAmount: 30.0, paymentStatus: "refunded" })
    );
    check("rimborsato > pagato → invariante segnalato", !verificaInvarianti(e));
    check("nettoPagato clampato a 0", uguali(e.nettoPagato, 0), e.nettoPagato);
  }

  console.log(`\nIncassi: ${passati} passati, ${falliti} falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
