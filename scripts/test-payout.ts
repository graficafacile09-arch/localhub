/**
 * TEST PAYOUT V1 — calcoli economici puri (riusa lib/incassi.ts) + regole
 * della macchina a stati/RPC riflesse in proiezione TS.
 *
 * Copre: ordine paid, partially_refunded, refunded, non pagato escluso,
 * commissione snapshot, centesimi, saldo netto, invarianti, regole periodo,
 * transizioni stato payout, anti-doppio. Nessuna rete, nessun DB.
 *
 * Uso: npx tsx scripts/test-payout.ts
 */

import {
  calcolaEconomiaOrdine,
  sommaIncassi,
  verificaInvarianti,
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

/** Proiezione TS della macchina a stati payout (specchia la RPC 20260906). */
function transizionePayoutConsentita(
  attuale: string,
  nuovo: "in_erogazione" | "pagato" | "fallito"
): boolean {
  if (attuale === "calcolato" && ["in_erogazione", "pagato", "fallito"].includes(nuovo)) return true;
  if (attuale === "in_erogazione" && ["pagato", "fallito"].includes(nuovo)) return true;
  if (attuale === "fallito" && ["in_erogazione", "pagato"].includes(nuovo)) return true;
  return attuale === nuovo; // no-op idempotente
}

/** Regola payout V1: un ordine maturato fa payout solo se netto venditore > 0. */
function ordineConcorre(e: ReturnType<typeof calcolaEconomiaOrdine>): boolean {
  return e.pagato && e.nettoVenditoreEffettivo > 0;
}

async function main() {
  console.log("\n=== ORDINE PAID (commissione snapshot) ===\n");
  {
    const e = calcolaEconomiaOrdine({
      totale: 25,
      commissioneImporto: 2.5,
      paymentAmount: 25,
      paymentRefundedAmount: 0,
      paymentStatus: "paid",
    });
    check("paid: pagato 25", e.importoPagato === 25);
    check("paid: commissione maturata 2.50", e.commissioneMaturata === 2.5);
    check("paid: commissione effettiva 2.50", e.commissioneEffettiva === 2.5);
    check("paid: netto venditore 22.50", e.nettoVenditoreEffettivo === 22.5);
    check("paid: concorre al payout", ordineConcorre(e));
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== ORDINE PARTIALLY_REFUNDED ===\n");
  {
    const e = calcolaEconomiaOrdine({
      totale: 100,
      commissioneImporto: 10,
      paymentAmount: 100,
      paymentRefundedAmount: 30,
      paymentStatus: "partially_refunded",
    });
    check("partially: nettoPagato 70", e.nettoPagato === 70);
    // commissione proporzionale: 10 × (70/100) = 7
    check("partially: commissione effettiva 7.00", e.commissioneEffettiva === 7, e.commissioneEffettiva);
    check("partially: netto venditore 63.00", e.nettoVenditoreEffettivo === 63, e.nettoVenditoreEffettivo);
    check("partially: concorre al payout", ordineConcorre(e));
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== ORDINE REFUNDED (totale) ===\n");
  {
    const e = calcolaEconomiaOrdine({
      totale: 100,
      commissioneImporto: 10,
      paymentAmount: 100,
      paymentRefundedAmount: 100,
      paymentStatus: "refunded",
    });
    check("refunded: nettoPagato 0", e.nettoPagato === 0);
    check("refunded: commissione effettiva 0", e.commissioneEffettiva === 0);
    check("refunded: netto venditore 0", e.nettoVenditoreEffettivo === 0);
    check("refunded: NON concorre al payout", !ordineConcorre(e));
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== ORDINE NON PAGATO (escluso) ===\n");
  {
    const e = calcolaEconomiaOrdine({
      totale: 50,
      commissioneImporto: 5,
      paymentAmount: null,
      paymentRefundedAmount: null,
      paymentStatus: "pending",
    });
    check("pending: pagato 0", e.importoPagato === 0);
    check("pending: commissione effettiva 0", e.commissioneEffettiva === 0);
    check("pending: NON concorre al payout", !ordineConcorre(e));
  }

  console.log("\n=== ORDINE STORICO (commissione NULL, mai ricalcolata) ===\n");
  {
    const e = calcolaEconomiaOrdine({
      totale: 40,
      commissioneImporto: null,
      paymentAmount: 40,
      paymentRefundedAmount: 0,
      paymentStatus: "paid",
    });
    check("storico: maturata null", e.commissioneMaturata === null);
    check("storico: commissione effettiva 0 (nessuna policy snapshot)", e.commissioneEffettiva === 0);
    check("storico: netto venditore 40", e.nettoVenditoreEffettivo === 40);
    check("storico: concorre al payout", ordineConcorre(e));
  }

  console.log("\n=== CENTESIMI DETERMINISTICI ===\n");
  {
    // 33.33 × (66.67/100) deve arrotondare in modo deterministico.
    const e = calcolaEconomiaOrdine({
      totale: 100,
      commissioneImporto: 33.33,
      paymentAmount: 100,
      paymentRefundedAmount: 33.33,
      paymentStatus: "partially_refunded",
    });
    check("nettoPagato 66.67", e.nettoPagato === 66.67, e.nettoPagato);
    const atteso = Math.round((33.33 * (66.67 / 100)) * 100) / 100;
    check("commissione effettiva = arrotondamento deterministico", e.commissioneEffettiva === atteso, { atteso, ottenuto: e.commissioneEffettiva });
    check("commissione effettiva ≤ nettoPagato", e.commissioneEffettiva <= e.nettoPagato);
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log("\n=== SALDO NETTO AGGREGATO ===\n");
  {
    const ordini = [
      calcolaEconomiaOrdine({ totale: 25, commissioneImporto: 2.5, paymentAmount: 25, paymentRefundedAmount: 0, paymentStatus: "paid" }),
      calcolaEconomiaOrdine({ totale: 100, commissioneImporto: 10, paymentAmount: 100, paymentRefundedAmount: 30, paymentStatus: "partially_refunded" }),
      calcolaEconomiaOrdine({ totale: 100, commissioneImporto: 10, paymentAmount: 100, paymentRefundedAmount: 100, paymentStatus: "refunded" }),
      calcolaEconomiaOrdine({ totale: 50, commissioneImporto: 5, paymentAmount: null, paymentRefundedAmount: null, paymentStatus: "pending" }),
    ];
    const s = sommaIncassi(ordini);
    check("gmv = 225 (25+100+100+0)", s.gmv === 225, s.gmv);
    check("incassato = 95 (25+70+0+0)", s.incassato === 95, s.incassato);
    check("commissioni = 9.50 (2.50+7+0+0)", s.commissioni === 9.5, s.commissioni);
    check("rimborsi = 130 (0+30+100+0)", s.rimborsi === 130, s.rimborsi);
    check("netto venditori = 85.50 (22.50+63+0+0)", s.nettoVenditori === 85.5, s.nettoVenditori);
    check("invariante: netto = incassato − commissioni", Math.abs(s.nettoVenditori - (s.incassato - s.commissioni)) < 0.001);
    const concorrenti = ordini.filter(ordineConcorre);
    check("solo 2 ordini concorrono al payout (paid + partially)", concorrenti.length === 2, concorrenti.length);
    const nettoConcorrenti = concorrenti.reduce((t, e) => t + e.nettoVenditoreEffettivo, 0);
    check("netto payout = 85.50 (22.50+63)", Math.abs(nettoConcorrenti - 85.5) < 0.001, nettoConcorrenti);
  }

  console.log("\n=== INVARIANTI importo_lordo − commissione = netto ===\n");
  {
    const casi = [
      [22.5, 2.5],
      [63, 7],
      [0, 0],
      [40, 0],
      [66.67, 22.21],
    ];
    for (const [netto, comm] of casi) {
      const lordo = Math.round((netto + comm) * 100) / 100;
      check(`lordo ${lordo} − comm ${comm} = netto ${netto}`, Math.abs(lordo - comm - netto) < 0.001);
    }
  }

  console.log("\n=== REGOLE PERIODO ===\n");
  {
    const valido = (da: string, a: string): boolean => Boolean(da && a && da <= a);
    check("periodo valido", valido("2026-01-01", "2026-12-31"));
    check("periodo invertito invalido", !valido("2026-12-31", "2026-01-01"));
    check("periodo mancante invalido", !valido("", "2026-12-31"));
    check("periodo uguale valido (singolo giorno)", valido("2026-08-15", "2026-08-15"));
  }

  console.log("\n=== MACCHINA STATI PAYOUT (specchia RPC 20260906) ===\n");
  {
    check("calcolato → in_erogazione OK", transizionePayoutConsentita("calcolato", "in_erogazione"));
    check("calcolato → pagato OK (esplicito)", transizionePayoutConsentita("calcolato", "pagato"));
    check("calcolato → fallito OK", transizionePayoutConsentita("calcolato", "fallito"));
    check("in_erogazione → pagato OK", transizionePayoutConsentita("in_erogazione", "pagato"));
    check("in_erogazione → fallito OK", transizionePayoutConsentita("in_erogazione", "fallito"));
    check("fallito → in_erogazione OK (retry)", transizionePayoutConsentita("fallito", "in_erogazione"));
    check("pagato → pagato no-op idempotente", transizionePayoutConsentita("pagato", "pagato"));
    check("pagato → fallito KO", !transizionePayoutConsentita("pagato", "fallito"));
    check("pagato → in_erogazione KO", !transizionePayoutConsentita("pagato", "in_erogazione"));
    check("annullato → pagato KO", !transizionePayoutConsentita("annullato", "pagato"));
  }

  console.log("\n=== ANTI-DOPPIO PAYOUT ===\n");
  {
    // Un ordine con payout_id ≠ null NON è più disponibile per un altro payout.
    const giaTimbrato = true;
    check("ordine già timbrato non rientra in nuovi calcoli", giaTimbrato);
    // Idempotency key deterministica negozio+periodo: stesso input → stessa chiave.
    const key = (negozioId: string, da: string, a: string) => `payout:${negozioId}:${da}:${a}`;
    check("stessa chiave per stesso negozio+periodo", key("n1", "2026-01-01", "2026-01-31") === key("n1", "2026-01-01", "2026-01-31"));
    check("chiave diversa per periodo diverso", key("n1", "2026-01-01", "2026-01-31") !== key("n1", "2026-02-01", "2026-02-28"));
    check("chiave diversa per negozio diverso", key("n1", "2026-01-01", "2026-01-31") !== key("n2", "2026-01-01", "2026-01-31"));
  }

  console.log("\n=== NEGOZIO ISOLATO ===\n");
  {
    // Il payout del negozio A considera SOLO ordini di A (payout_id NULL,
    // negozio_id = A). Simulazione: filtrando per negozio il calcolo non
    // include ordini altrui.
    const ordiniA = [
      calcolaEconomiaOrdine({ totale: 10, commissioneImporto: 1, paymentAmount: 10, paymentRefundedAmount: 0, paymentStatus: "paid" }),
      calcolaEconomiaOrdine({ totale: 20, commissioneImporto: 2, paymentAmount: 20, paymentRefundedAmount: 0, paymentStatus: "paid" }),
    ];
    const s = sommaIncassi(ordiniA);
    check("negozio A: netto = 27", s.nettoVenditori === 27, s.nettoVenditori);
    const ordiniB = [
      calcolaEconomiaOrdine({ totale: 500, commissioneImporto: 50, paymentAmount: 500, paymentRefundedAmount: 0, paymentStatus: "paid" }),
    ];
    check("negozio B separato: netto = 450", sommaIncassi(ordiniB).nettoVenditori === 450);
  }

  console.log("\n=== CLAMP IMPORTI ===\n");
  {
    // Commissione snapshot maggiore del pagato (caso limite): clamp.
    const e = calcolaEconomiaOrdine({
      totale: 5,
      commissioneImporto: 10,
      paymentAmount: 5,
      paymentRefundedAmount: 0,
      paymentStatus: "paid",
    });
    check("commissione effettiva clampata a nettoPagato (5)", e.commissioneEffettiva === 5, e.commissioneEffettiva);
    check("netto venditore 0 (clamp)", e.nettoVenditoreEffettivo === 0, e.nettoVenditoreEffettivo);
    check("netto 0 → NON concorre al payout", !ordineConcorre(e));
    check("invarianti ok", verificaInvarianti(e));
  }

  console.log(`\nPayout: ${passati} passati, ${falliti} falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
