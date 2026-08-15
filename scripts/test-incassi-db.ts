/**
 * TEST INCASSI — INTEGRITÀ DB (snapshot reali su ordini + calcoli).
 *
 * Crea negozi + prodotti + ordini TEMPORANEI via crea_ordine, porta gli
 * ordini agli stati: non pagato, pagato, parzialmente rimborsato, totalmente
 * rimborsato; poi verifica che gli snapshot (commissione_*, payment_*) siano
 * coerenti e che i calcoli economici di lib/incassi.ts producano i valori
 * attesi (netto, commissione proporzionale, rimborso totale → 0). Pulisce
 * tutto (self-cleaning).
 *
 * Uso: npx tsx scripts/test-incassi-db.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  calcolaEconomiaOrdine,
  sommaIncassi,
  verificaInvarianti,
} from "@/lib/incassi";

const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

function uguali(a: number | null, b: number): boolean {
  return a !== null && Math.abs(a - b) < 0.001;
}

type Setup = { negozioId: string; prodottoId: string; ordineId: string; totale: number };

async function creaOrdine(opts: { ts: number; prezzo: number; quantita: number }): Promise<Setup> {
  const ts = opts.ts;
  const { data: n, error: errN } = await db
    .from("negozi")
    .insert({ nome: `Incassi-${ts}`, slug: `incassi-${ts}`, attivo: true, is_demo: true })
    .select("id")
    .single();
  if (errN || !n) throw new Error("Setup negozio fallito: " + (errN?.message ?? "no data"));
  const negozioId = String(n.id);

  const { data: p, error: errP } = await db
    .from("prodotti")
    .insert({
      negozio_id: negozioId,
      nome: `Prodotto Incassi-${ts}`,
      slug: `prodotto-incassi-${ts}`,
      prezzo: opts.prezzo,
      quantita_disponibile: 50,
      attivo: true,
      ha_varianti: false,
    })
    .select("id")
    .single();
  if (errP || !p) throw new Error("Setup prodotto fallito: " + (errP?.message ?? "no data"));
  const prodottoId = String(p.id);

  const payload = {
    idempotencyKey: `incassi-test-${ts}`,
    prodottoId,
    quantita: opts.quantita,
    modalita: "ritiro",
    clienteNome: "Maria",
    clienteCognome: "Incassi",
    clienteTelefono: null,
    clienteEmail: null,
    clienteIp: "127.0.0.1",
    ritiroData: null,
    ritiroFascia: null,
    note: null,
  };
  const { data: esito, error: rpcErr } = await db.rpc("crea_ordine", { p_payload: payload });
  if (rpcErr || !esito || esito.ok !== true) {
    throw new Error("crea_ordine fallita: " + (rpcErr?.message ?? JSON.stringify(esito)));
  }
  const ordineId = String((esito.ordine as { id?: string }).id ?? "");
  if (!ordineId) throw new Error("ordineId mancante dalla RPC");

  const { data: ordine } = await db.from("ordini").select("totale").eq("id", ordineId).single();
  return { negozioId, prodottoId, ordineId, totale: Number(ordine?.totale ?? 0) };
}

/** Porta un ordine a `paid` (macchina esistente: pending → paid). */
async function marcaPagato(ordineId: string, totale: number, ts: number) {
  const init = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordineId,
    p_nuovo_stato: "pending",
    p_payment_id: `pi_incassi_${ts}`,
    p_transaction_id: null,
    p_importo: totale,
    p_valuta: "EUR",
    p_expires_at: null,
  });
  if (init.error || init.data?.ok !== true) {
    throw new Error("init pending fallita: " + (init.error?.message ?? JSON.stringify(init.data)));
  }
  const paid = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordineId,
    p_nuovo_stato: "paid",
    p_payment_id: `pi_incassi_${ts}`,
    p_transaction_id: `pi_incassi_${ts}`,
    p_importo: totale,
    p_valuta: "EUR",
    p_expires_at: null,
  });
  if (paid.error || paid.data?.ok !== true) {
    throw new Error("paid fallita: " + (paid.error?.message ?? JSON.stringify(paid.data)));
  }
}

/** Legge gli snapshot economici di un ordine dal DB. */
async function snapshotOrdine(ordineId: string) {
  const { data } = await db
    .from("ordini")
    .select(
      "id, totale, commissione_percentuale, commissione_importo, payment_amount, payment_refunded_amount, payment_status"
    )
    .eq("id", ordineId)
    .single();
  return data;
}

async function main() {
  const ts = Date.now();
  const setups: Setup[] = [];

  try {
    // ── 1. Ordine NON pagato ─────────────────────────────────────────────
    const nonPagato = await creaOrdine({ ts, prezzo: 10.0, quantita: 1 });
    setups.push(nonPagato);
    {
      const s = await snapshotOrdine(nonPagato.ordineId);
      check("1) ordine creato: payment_status NULL", s?.payment_status === null, s?.payment_status);
      check("1) commissione snapshot presente (10%)", uguali(Number(s?.commissione_importo), 1.0), s?.commissione_importo);
      const e = calcolaEconomiaOrdine({
        totale: Number(s?.totale),
        commissioneImporto: s?.commissione_importo ?? null,
        paymentAmount: s?.payment_amount ?? null,
        paymentRefundedAmount: s?.payment_refunded_amount ?? null,
        paymentStatus: s?.payment_status ?? null,
      });
      check("1) importoPagato = 0", uguali(e.importoPagato, 0));
      check("1) commissioneEffettiva = 0", uguali(e.commissioneEffettiva, 0));
      check("1) nettoVenditoreEffettivo = 0", uguali(e.nettoVenditoreEffettivo, 0));
      check("1) invarianti ok", verificaInvarianti(e));
    }

    // ── 2. Ordine PAGATO ─────────────────────────────────────────────────
    const pagato = await creaOrdine({ ts: ts + 1, prezzo: 12.5, quantita: 2 });
    setups.push(pagato);
    await marcaPagato(pagato.ordineId, pagato.totale, ts + 1);
    {
      const s = await snapshotOrdine(pagato.ordineId);
      check("2) payment_status = paid", s?.payment_status === "paid", s?.payment_status);
      check("2) payment_amount = totale 25.00", uguali(Number(s?.payment_amount), 25.0), s?.payment_amount);
      check("2) commissione_importo = 2.50", uguali(Number(s?.commissione_importo), 2.5), s?.commissione_importo);
      const e = calcolaEconomiaOrdine({
        totale: Number(s?.totale),
        commissioneImporto: s?.commissione_importo ?? null,
        paymentAmount: s?.payment_amount ?? null,
        paymentRefundedAmount: s?.payment_refunded_amount ?? null,
        paymentStatus: s?.payment_status ?? null,
      });
      check("2) nettoVenditoreEffettivo = 22.50", uguali(e.nettoVenditoreEffettivo, 22.5), e.nettoVenditoreEffettivo);
      check("2) commissioneEffettiva = 2.50", uguali(e.commissioneEffettiva, 2.5), e.commissioneEffettiva);
      check("2) invarianti ok", verificaInvarianti(e));
    }

    // ── 3. Ordine PARZIALMENTE RIMBORSATO ────────────────────────────────
    const parziale = await creaOrdine({ ts: ts + 2, prezzo: 12.5, quantita: 2 });
    setups.push(parziale);
    await marcaPagato(parziale.ordineId, parziale.totale, ts + 2);
    // Rimborso parziale di 10.00: simuliamo l'esito del webhook (fonte
    // autorevole) che valorizza payment_refunded_amount e porta lo stato a
    // partially_refunded — esattamente ciò che fa charge.refunded.
    await db.from("ordini").update({
      payment_status: "partially_refunded",
      payment_refunded_amount: 10.0,
      payment_refunded_at: new Date().toISOString(),
    }).eq("id", parziale.ordineId);
    {
      const s = await snapshotOrdine(parziale.ordineId);
      const e = calcolaEconomiaOrdine({
        totale: Number(s?.totale),
        commissioneImporto: s?.commissione_importo ?? null,
        paymentAmount: s?.payment_amount ?? null,
        paymentRefundedAmount: s?.payment_refunded_amount ?? null,
        paymentStatus: s?.payment_status ?? null,
      });
      check("3) payment_status = partially_refunded", s?.payment_status === "partially_refunded");
      check("3) importoRimborsato = 10.00", uguali(e.importoRimborsato, 10.0));
      check("3) nettoPagato = 15.00", uguali(e.nettoPagato, 15.0));
      check("3) commissioneEffettiva = 1.50 (2.50 × 15/25)", uguali(e.commissioneEffettiva, 1.5), e.commissioneEffettiva);
      check("3) nettoVenditoreEffettivo = 13.50", uguali(e.nettoVenditoreEffettivo, 13.5), e.nettoVenditoreEffettivo);
      check("3) invarianti ok", verificaInvarianti(e));
    }

    // ── 4. Ordine TOTALMENTE RIMBORSATO ──────────────────────────────────
    const totale = await creaOrdine({ ts: ts + 3, prezzo: 12.5, quantita: 2 });
    setups.push(totale);
    await marcaPagato(totale.ordineId, totale.totale, ts + 3);
    await db.from("ordini").update({
      payment_status: "refunded",
      payment_refunded_amount: totale.totale,
      payment_refunded_at: new Date().toISOString(),
    }).eq("id", totale.ordineId);
    {
      const s = await snapshotOrdine(totale.ordineId);
      const e = calcolaEconomiaOrdine({
        totale: Number(s?.totale),
        commissioneImporto: s?.commissione_importo ?? null,
        paymentAmount: s?.payment_amount ?? null,
        paymentRefundedAmount: s?.payment_refunded_amount ?? null,
        paymentStatus: s?.payment_status ?? null,
      });
      check("4) payment_status = refunded", s?.payment_status === "refunded");
      check("4) commissioneEffettiva = 0 (fee rimborsata)", uguali(e.commissioneEffettiva, 0), e.commissioneEffettiva);
      check("4) nettoVenditoreEffettivo = 0", uguali(e.nettoVenditoreEffettivo, 0));
      check("4) rimborsatoTotalmente = true", e.rimborsatoTotalmente);
      check("4) invarianti ok", verificaInvarianti(e));
    }

    // ── 5. Aggregati su TUTTI e 4 ────────────────────────────────────────
    {
      const righe = await db
        .from("ordini")
        .select("totale, commissione_importo, payment_amount, payment_refunded_amount, payment_status")
        .in("id", setups.map((s) => s.ordineId));
      const economie = (righe.data ?? []).map((r) =>
        calcolaEconomiaOrdine({
          totale: Number(r.totale),
          commissioneImporto: r.commissione_importo ?? null,
          paymentAmount: r.payment_amount ?? null,
          paymentRefundedAmount: r.payment_refunded_amount ?? null,
          paymentStatus: r.payment_status ?? null,
        })
      );
      const riepilogo = sommaIncassi(economie);
      // non pagato 0 + pagato 25 + parziale 25 + totale 25 = 75
      check("5) gmv = 75.00", uguali(riepilogo.gmv, 75.0), riepilogo.gmv);
      // incassato = 0 + 25 + 15 + 0 = 40
      check("5) incassato = 40.00", uguali(riepilogo.incassato, 40.0), riepilogo.incassato);
      // commissioni = 0 + 2.50 + 1.50 + 0 = 4.00
      check("5) commissioni = 4.00", uguali(riepilogo.commissioni, 4.0), riepilogo.commissioni);
      // netto venditori = 0 + 22.50 + 13.50 + 0 = 36.00
      check("5) nettoVenditori = 36.00", uguali(riepilogo.nettoVenditori, 36.0), riepilogo.nettoVenditori);
      check("5) rimborsi = 10 + 25 = 35.00", uguali(riepilogo.rimborsi, 35.0), riepilogo.rimborsi);
      check("5) ordiniPagati = 3", riepilogo.ordiniPagati === 3, riepilogo.ordiniPagati);
      check("5) ordiniRimborsati = 2", riepilogo.ordiniRimborsati === 2, riepilogo.ordiniRimborsati);
      check("5) ordiniRimborsatiTotali = 1", riepilogo.ordiniRimborsatiTotali === 1, riepilogo.ordiniRimborsatiTotali);
      check("5) totaleOrdini = 4", riepilogo.totaleOrdini === 4);
    }
  } finally {
    // ── Cleanup (self-cleaning) ─────────────────────────────────────────
    for (const s of setups) {
      await db.from("ordini").delete().eq("id", s.ordineId);
      await db.from("prodotti").delete().eq("id", s.prodottoId);
      await db.from("negozi").delete().eq("id", s.negozioId);
    }
  }

  console.log(`\nIncassi DB: ${passati} passati, ${falliti} falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
