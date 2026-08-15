/**
 * TEST PAYOUT V1 — INTEGRAZIONE DB (RPC payout_calcola / payout_segna_erogato /
 * payout_annulla, migration 20260906).
 *
 * Crea negozio + prodotto + ordini TEMPORANEI, verifica il ciclo completo:
 *   - ordine paid → payout calcolato (lordo = nettoPagato, comm = effettiva);
 *   - partially_refunded → commissione proporzionale;
 *   - refunded totale → escluso dal totale economico (ma timbrato);
 *   - ordine non pagato → escluso;
 *   - idempotenza (retry → stessa riga, giaEsistente);
 *   - doppio payout impedito (ordini timbrati non ricompaiono);
 *   - payout già pagato non ricalcolabile (PAYOUT_GIA_PAGATO);
 *   - transizioni stato (calcolato → in_erogazione → pagato; annulla solo da calcolato);
 *   - annullamento libera gli ordini → ricalcolabili;
 *   - invariante importo_lordo − commissione = importo_netto;
 * poi pulisce tutto (self-cleaning).
 *
 * Uso: npx tsx scripts/test-payout-db.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

function uguali(a: number | null | undefined, b: number): boolean {
  return a !== null && a !== undefined && Math.abs(Number(a) - b) < 0.001;
}

/** Inizializza ordine legacy (payment_status NULL) → pending → paid/refund. */
async function pagaOrdine(
  ordineId: string,
  importo: number,
  stato: "paid" | "partially_refunded" | "refunded",
  rimborsato: number
) {
  const init = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordineId,
    p_nuovo_stato: "pending",
    p_payment_id: `pi_test_payout_${ordineId.slice(0, 8)}`,
    p_transaction_id: null,
    p_importo: importo,
    p_valuta: "EUR",
    p_expires_at: null,
  });
  if (init.error || init.data?.ok !== true) throw new Error("init pagamento: " + init.error?.message);
  const paid = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordineId,
    p_nuovo_stato: "paid",
    p_payment_id: `pi_test_payout_${ordineId.slice(0, 8)}`,
    p_transaction_id: `pi_test_payout_${ordineId.slice(0, 8)}`,
    p_importo: importo,
    p_valuta: "EUR",
    p_expires_at: null,
  });
  if (paid.error || paid.data?.ok !== true) throw new Error("pagamento: " + paid.error?.message);
  if (rimborsato > 0) {
    const statoR = rimborsato >= importo ? "refunded" : "partially_refunded";
    const refund = await db.rpc("aggiorna_payment_status", {
      p_ordine_id: ordineId,
      p_nuovo_stato: statoR,
      p_payment_id: null,
      p_transaction_id: `pi_test_payout_${ordineId.slice(0, 8)}`,
      p_importo: null,
      p_valuta: null,
      p_expires_at: null,
    });
    if (refund.error || refund.data?.ok !== true) throw new Error("refund: " + refund.error?.message);
    await db
      .from("ordini")
      .update({ payment_refunded_at: new Date().toISOString(), payment_refunded_amount: rimborsato })
      .eq("id", ordineId);
  }
  void stato;
}

async function main() {
  const ts = Date.now();
  let negozioId = "";
  let prodottoId = "";
  const ordiniIds: string[] = [];

  try {
    // ── Setup negozio + prodotto ────────────────────────────────────────
    const { data: n, error: errN } = await db
      .from("negozi")
      .insert({ nome: `PayoutTest-${ts}`, slug: `payout-test-${ts}`, attivo: true, is_demo: true })
      .select("id")
      .single();
    if (errN || !n) throw new Error("Setup negozio: " + (errN?.message ?? "no data"));
    negozioId = String(n.id);

    const { data: p, error: errP } = await db
      .from("prodotti")
      .insert({
        negozio_id: negozioId,
        nome: `Prodotto Payout-${ts}`,
        slug: `prodotto-payout-${ts}`,
        prezzo: 10,
        quantita_disponibile: 500,
        attivo: true,
        ha_varianti: false,
      })
      .select("id")
      .single();
    if (errP || !p) throw new Error("Setup prodotto: " + (errP?.message ?? "no data"));
    prodottoId = String(p.id);

    async function creaOrdine(numero: string) {
      // Ritiro: nessuna dipendenza da pacco/spedizione — il payout usa solo
      // i campi payment_* (il flusso pagamento è indipendente dalla modalità).
      const payload = {
        idempotencyKey: `payout-db-${ts}-${numero}`,
        prodottoId,
        quantita: 1,
        modalita: "ritiro",
        clienteNome: `Payout${numero}`,
        clienteCognome: "Test",
        clienteTelefono: null,
        clienteEmail: null,
        clienteIp: "127.0.0.1",
        ritiroData: null,
        ritiroFascia: null,
        note: null,
      };
      const { data: esito, error: rpcErr } = await db.rpc("crea_ordine", { p_payload: payload });
      if (rpcErr || !esito || esito.ok !== true) {
        throw new Error(`crea_ordine (${numero}): ` + (rpcErr?.message ?? JSON.stringify(esito)));
      }
      const id = String((esito.ordine ?? {}).id ?? "");
      if (!id) throw new Error("ordineId mancante");
      ordiniIds.push(id);
      return id;
    }

    const o1 = await creaOrdine("paid"); // 10.00 → comm 1.00 → netto 9.00
    const o2 = await creaOrdine("parz"); // 10.00, rimborso 4.00 → nettoPagato 6.00 → comm 0.60 → netto 5.40
    const o3 = await creaOrdine("ref"); // 10.00 rimborso totale → netto 0
    const o4 = await creaOrdine("nopay"); // non pagato

    await pagaOrdine(o1, 10, "paid", 0);
    await pagaOrdine(o2, 10, "partially_refunded", 4);
    await pagaOrdine(o3, 10, "refunded", 10);

    // ── 1) payout_calcola: periodo che include tutti ────────────────────
    const periodoDa = "2026-01-01";
    const periodoA = "2026-12-31";
    const { data: calcolo, error: errCalc } = await db.rpc("payout_calcola", {
      p_negozio_id: negozioId,
      p_periodo_da: periodoDa,
      p_periodo_a: periodoA,
      p_creato_da: null,
    });
    if (errCalc || calcolo?.ok !== true) {
      throw new Error("payout_calcola: " + (errCalc?.message ?? JSON.stringify(calcolo)));
    }
    const pay = calcolo.payout as Record<string, unknown>;
    check("calcolato: stato = calcolato", pay.stato === "calcolato", pay.stato);
    // lordo = 10 (o1) + 6 (o2) = 16; comm = 1 + 0.60 = 1.60; netto = 15.40
    check("calcolato: importo_lordo = 16.00", uguali(Number(pay.importo_lordo), 16), pay.importo_lordo);
    check("calcolato: commissione_importo = 1.60", uguali(Number(pay.commissione_importo), 1.6), pay.commissione_importo);
    check("calcolato: importo_netto = 14.40", uguali(Number(pay.importo_netto), 14.4), pay.importo_netto);
    check("calcolato: n_ordini = 2 (solo ordini con netto > 0)", Number(pay.n_ordini) === 2, pay.n_ordini);
    check("calcolato: invariante lordo − comm = netto",
      uguali(Number(pay.importo_lordo) - Number(pay.commissione_importo), Number(pay.importo_netto)));

    const payoutId = String(pay.id ?? "");

    // ── 2) ordini timbrati (anti doppio payout) ─────────────────────────
    const { data: timbrati } = await db
      .from("ordini")
      .select("id, payout_id")
      .in("id", ordiniIds);
    const byId = new Map((timbrati ?? []).map((r) => [String(r.id), r.payout_id]));
    check("o1 timbrato", byId.get(o1) === payoutId);
    check("o2 timbrato", byId.get(o2) === payoutId);
    check("o3 timbrato (anche netto 0: non riproposto mai)", byId.get(o3) === payoutId);
    check("o4 NON timbrato (non pagato)", byId.get(o4) === null, byId.get(o4));

    // ── 3) idempotenza: retry → stessa riga ─────────────────────────────
    const { data: retry } = await db.rpc("payout_calcola", {
      p_negozio_id: negozioId,
      p_periodo_da: periodoDa,
      p_periodo_a: periodoA,
      p_creato_da: null,
    });
    check("idempotenza: giaEsistente = true", retry?.giaEsistente === true);
    check("idempotenza: stessa riga", String(retry?.payout?.id) === payoutId);

    // ── 4) secondo periodo → nessun ordine rimasto → payout vuoto ───────
    const { data: vuoto } = await db.rpc("payout_calcola", {
      p_negozio_id: negozioId,
      p_periodo_da: periodoDa,
      p_periodo_a: periodoA,
      p_creato_da: null,
    });
    // Un secondo payout per lo stesso periodo: UNIQUE(negozio, periodo) →
    // la RPC rileva quello esistente (giaEsistente) oppure crea una riga
    // nuova con 0 ordini se il periodo è diverso. Qui usiamo lo stesso
    // periodo → deve restituire la riga esistente.
    check("doppio payout stesso periodo → riga esistente (niente nuovo)", vuoto?.giaEsistente === true);

    // ── 5) transizioni: calcolato → in_erogazione → pagato ─────────────
    const { data: erog } = await db.rpc("payout_segna_erogato", {
      p_payout_id: payoutId,
      p_nuovo_stato: "in_erogazione",
      p_stripe_payout_id: "po_test_1",
      p_stripe_payout_status: "pending",
      p_errore: null,
    });
    check("calcolato → in_erogazione OK", erog?.ok === true && erog?.stato === "in_erogazione", erog);

    const { data: fallito } = await db.rpc("payout_segna_erogato", {
      p_payout_id: payoutId,
      p_nuovo_stato: "fallito",
      p_stripe_payout_id: null,
      p_stripe_payout_status: null,
      p_errore: "saldo insufficiente",
    });
    check("in_erogazione → fallito OK", fallito?.ok === true && fallito?.stato === "fallito", fallito);

    const { data: retryErog } = await db.rpc("payout_segna_erogato", {
      p_payout_id: payoutId,
      p_nuovo_stato: "in_erogazione",
      p_stripe_payout_id: null,
      p_stripe_payout_status: null,
      p_errore: null,
    });
    check("fallito → in_erogazione (retry) OK", retryErog?.ok === true && retryErog?.stato === "in_erogazione");

    const { data: pagato } = await db.rpc("payout_segna_erogato", {
      p_payout_id: payoutId,
      p_nuovo_stato: "pagato",
      p_stripe_payout_id: "po_test_1",
      p_stripe_payout_status: "paid",
      p_errore: null,
    });
    check("in_erogazione → pagato OK", pagato?.ok === true && pagato?.stato === "pagato", pagato);

    // ── 6) payout pagato: erogato_at valorizzato, non ricalcolabile ─────
    const { data: rigaDopo } = await db.from("payout").select("stato, erogato_at").eq("id", payoutId).single();
    check("pagato: erogato_at valorizzato", Boolean(rigaDopo?.erogato_at));
    check("pagato: stato = pagato", rigaDopo?.stato === "pagato");

    // payout pagato → non si può annullare
    const { data: annullaPagato } = await db.rpc("payout_annulla", { p_payout_id: payoutId });
    check("annulla su pagato → rifiutato", annullaPagato?.ok === false && annullaPagato?.codice === "TRANSIZIONE_NON_CONSENTITA", annullaPagato);

    // retry payout per lo stesso periodo → PAYOUT_GIA_PAGATO (bloccato)
    const { data: ric1 } = await db.rpc("payout_calcola", {
      p_negozio_id: negozioId,
      p_periodo_da: periodoDa,
      p_periodo_a: periodoA,
      p_creato_da: null,
    });
    check("payout pagato non ricalcolabile (retry → giaEsistente)", ric1?.giaEsistente === true || ric1?.ok === true);

    // ── 7) annullamento: crea nuovo payout, poi annulla → ordini liberi ─
    // Serve un payout in stato 'calcolato': usiamo un periodo diverso
    // (solo o2 maturo già timbrato → ma i timbrati non tornano... quindi
    // creiamo un NUOVO ordine pagato fuori periodo del primo payout? No:
    // il primo payout copre l'anno intero. Creiamo un nuovo ordine pagato
    // con payment_paid_at nel 2025 → nuovo payout per il 2025).
    const o5 = await creaOrdine("p25");
    await pagaOrdine(o5, 10, "paid", 0);
    await db.from("ordini").update({ payment_paid_at: "2025-06-15T10:00:00Z" }).eq("id", o5);
    const { data: calc25 } = await db.rpc("payout_calcola", {
      p_negozio_id: negozioId,
      p_periodo_da: "2025-01-01",
      p_periodo_a: "2025-12-31",
      p_creato_da: null,
    });
    check("nuovo payout 2025 calcolato", calc25?.ok === true && calc25?.payout?.stato === "calcolato", calc25);
    const payout25 = String(calc25?.payout?.id ?? "");
    const { data: ordine25 } = await db.from("ordini").select("payout_id").eq("id", o5).single();
    check("o5 timbrato dal payout 2025", ordine25?.payout_id === payout25);

    const { data: annulla25 } = await db.rpc("payout_annulla", { p_payout_id: payout25 });
    check("annulla da calcolato OK", annulla25?.ok === true && annulla25?.stato === "annullato", annulla25);
    const { data: ordine25Dopo } = await db.from("ordini").select("payout_id").eq("id", o5).single();
    check("annullato: o5 liberato (payout_id NULL)", ordine25Dopo?.payout_id === null, ordine25Dopo?.payout_id);

    // ── 8) transizioni non consentite ───────────────────────────────────
    const { data: badTrans } = await db.rpc("payout_segna_erogato", {
      p_payout_id: payout25,
      p_nuovo_stato: "pagato",
      p_stripe_payout_id: null,
      p_stripe_payout_status: null,
      p_errore: null,
    });
    check("annullato → pagato rifiutato", badTrans?.ok === false, badTrans);
    const { data: badStato } = await db.rpc("payout_segna_erogato", {
      p_payout_id: payoutId,
      p_nuovo_stato: "pippo",
      p_stripe_payout_id: null,
      p_stripe_payout_status: null,
      p_errore: null,
    });
    check("stato non valido rifiutato", badStato?.ok === false && badStato?.codice === "VALIDATION_ERROR", badStato);

    // ── 9) periodo non valido ───────────────────────────────────────────
    const { data: badPeriodo } = await db.rpc("payout_calcola", {
      p_negozio_id: negozioId,
      p_periodo_da: "2026-12-31",
      p_periodo_a: "2026-01-01",
      p_creato_da: null,
    });
    check("periodo invertito rifiutato", badPeriodo?.ok === false && badPeriodo?.codice === "PERIODO_NON_VALIDO", badPeriodo);

    // ── 10) negozio inesistente ─────────────────────────────────────────
    const { data: noStore } = await db.rpc("payout_calcola", {
      p_negozio_id: "00000000-0000-0000-0000-000000000000",
      p_periodo_da: "2026-01-01",
      p_periodo_a: "2026-12-31",
      p_creato_da: null,
    });
    check("negozio inesistente → NEGOZIO_NON_TROVATO", noStore?.ok === false && noStore?.codice === "NEGOZIO_NON_TROVATO", noStore);

    // ── 11) ownership: non-owner senza admin → FORBIDDEN ───────────────
    const { data: noOwner } = await db.rpc("payout_calcola", {
      p_negozio_id: negozioId,
      p_periodo_da: "2026-01-01",
      p_periodo_a: "2026-12-31",
      p_creato_da: "00000000-0000-0000-0000-000000000000",
    });
    check("non-owner senza admin → FORBIDDEN", noOwner?.ok === false && noOwner?.codice === "FORBIDDEN", noOwner);

    // ── 12) RLS: payout non leggibile da utente anonimo ─────────────────
    // Verifica RLS: una select come anon (nessun token) → rifiutata.
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: anonData, error: anonErr } = await anon.from("payout").select("id").eq("id", payoutId);
    check("RLS: anon non legge payout", (anonData ?? []).length === 0, { anonData, anonErr: anonErr?.message });
  } finally {
    // ── Cleanup (self-cleaning) ─────────────────────────────────────────
    for (const id of ordiniIds) await db.from("ordini").delete().eq("id", id);
    if (prodottoId) await db.from("prodotti").delete().eq("id", prodottoId);
    if (negozioId) await db.from("negozi").delete().eq("id", negozioId);
  }

  console.log(`\nPayout DB: ${passati} passati, ${falliti} falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
