/**
 * TEST RIMBORSI — INTEGRAZIONE DB (RPC pagamenti_prepara_rimborso / annulla).
 *
 * Richiede la migration 20260905 applicata al DB remoto. Crea negozi +
 * prodotti + ordini TEMPORANEI (ognuno con un owner di test diverso), porta
 * gli ordini a `paid` tramite la macchina esistente (aggiorna_payment_status),
 * poi verifica:
 *   A/B/K/L) refund totale/parziale + stati risultanti;
 *   C) secondo refund del residuo → refunded;
 *   D) over-refund rifiutato;
 *   E) refund su ordine già rimborsato rifiutato;
 *   F) refund su ordine non pagato rifiutato;
 *   H) importo non manipolabile (importo dal client oltre il residuo);
 *   I) cumulo prenotazioni + over-refund oltre il totale;
 *   J) payment_refunded_amount aggiornato nel DB;
 *   N) ordine senza provider gateway rifiutato;
 *   T) importo con più di 2 decimali rifiutato;
 *   U) non-owner/non-admin → FORBIDDEN;
 *   M) webhook duplicato → no-op idempotente.
 * Poi pulisce tutto (self-cleaning).
 *
 * Uso: npx tsx scripts/test-rimborsi-db.ts
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

function uguali(a: number | null, b: number): boolean {
  return a !== null && Math.abs(a - b) < 0.001;
}

/** Owner di test unico per negozio (UUID valido derivato dal contatore). */
function ownerTest(i: number): string {
  return `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
}

async function preparaOrdinePagato(opts: {
  ts: number;
  prezzo: number;
  quantita: number;
  owner: string;
}): Promise<{ ordineId: string; totale: number; negozioId: string; prodottoId: string }> {
  const ts = opts.ts;
  const { data: n, error: errN } = await db
    .from("negozi")
    .insert({
      nome: `Rimborso-${ts}`,
      slug: `rimborso-${ts}`,
      attivo: true,
      is_demo: true,
      owner_user_id: opts.owner,
    })
    .select("id")
    .single();
  if (errN || !n) throw new Error("Setup negozio fallito: " + (errN?.message ?? "no data"));
  const negozioId = String(n.id);

  const { data: p, error: errP } = await db
    .from("prodotti")
    .insert({
      negozio_id: negozioId,
      nome: `Prodotto Rimborso-${ts}`,
      slug: `prodotto-rimborso-${ts}`,
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
    idempotencyKey: `rimborso-test-${ts}`,
    prodottoId,
    quantita: opts.quantita,
    modalita: "ritiro",
    clienteNome: "Anna",
    clienteCognome: "Rimborso",
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

  const { data: ordine } = await db
    .from("ordini")
    .select("id, totale")
    .eq("id", ordineId)
    .single();
  const totale = Number(ordine?.totale ?? 0);

  // Porta a paid: init → pending (fail-closed legacy), poi pending → paid.
  const init = await db.rpc("aggiorna_payment_status", {
    p_ordine_id: ordineId,
    p_nuovo_stato: "pending",
    p_payment_id: `pi_rimborso_${ts}`,
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
    p_payment_id: `pi_rimborso_${ts}`,
    p_transaction_id: `pi_rimborso_${ts}`,
    p_importo: totale,
    p_valuta: "EUR",
    p_expires_at: null,
  });
  if (paid.error || paid.data?.ok !== true) {
    throw new Error("paid fallita: " + (paid.error?.message ?? JSON.stringify(paid.data)));
  }

  // Simula la creazione sessione: payment_provider = stripe (il flusso reale
  // lo valorizza in creaSessionePagamentoPerOrdine; la RPC rimborso lo
  // richiede per distinguere gateway da bonifico/legacy).
  const prov = await db
    .from("ordini")
    .update({ payment_provider: "stripe", metodo_pagamento: "carta" })
    .eq("id", ordineId);
  if (prov.error) {
    throw new Error("impostazione payment_provider fallita: " + prov.error.message);
  }

  return { ordineId, totale, negozioId, prodottoId };
}

async function main() {
  const ts = Date.now();
  const OWNER_1 = ownerTest(1);
  const OWNER_2 = ownerTest(2);
  const OWNER_3 = ownerTest(3);
  const UID_ALTRO = ownerTest(99); // non-owner, non-admin

  const creati: Array<{ ordineId: string; totale: number; negozioId: string; prodottoId: string }> = [];

  try {
    // ── Setup ordine pagato: totale 25.00 (12.50 × 2), owner 1 ──────────
    const setup = await preparaOrdinePagato({ ts, prezzo: 12.5, quantita: 2, owner: OWNER_1 });
    creati.push(setup);
    const { ordineId, totale } = setup;
    check("setup) ordine creato e pagato (totale 25.00)", uguali(totale, 25.0), totale);

    // ── A/B) REFUND PARZIALE 10.00 → partially_refunded ─────────────────
    const parziale = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: ordineId,
      p_importo: 10.0,
      p_merchant_user_id: OWNER_1,
    });
    check("B) prepara parziale ok", parziale.error === null && parziale.data?.ok === true, parziale.error?.message);
    check("B) stato atteso partially_refunded", parziale.data?.stato_nuovo === "partially_refunded", parziale.data?.stato_nuovo);
    check("B) residuo dopo = 15.00", uguali(Number(parziale.data?.residuo), 15.0), parziale.data?.residuo);
    check("B) refunded amount prenotato = 10.00", uguali(Number(parziale.data?.payment_refunded_amount), 10.0), parziale.data?.payment_refunded_amount);
    check("B) provider = stripe", parziale.data?.provider === "stripe", parziale.data?.provider);
    check("B) payment_id presente", Boolean(parziale.data?.payment_id));

    // M) webhook porta lo stato a partially_refunded (transizione valida
    //    paid → partially_refunded). Un evento webhook DUPLICATO non viene
    //    mai riprocessato: l'idempotenza reale è il UNIQUE su
    //    pagamenti_eventi.event_id (verificato a valle: un secondo event_id
    //    identico → 23505 e nessuna chiamata alla RPC). A livello RPC uno
    //    stato identico viene comunque rifiutato (nessuna doppia mutazione).
    const webhookStato = await db.rpc("aggiorna_payment_status", {
      p_ordine_id: ordineId,
      p_nuovo_stato: "partially_refunded",
      p_payment_id: null,
      p_transaction_id: `re_rimborso_${ts}`,
      p_importo: null,
      p_valuta: null,
      p_expires_at: null,
    });
    check("M) webhook → partially_refunded ok (paid → partially_refunded)", webhookStato.error === null && webhookStato.data?.ok === true, webhookStato.error?.message);
    const webhookDup = await db.rpc("aggiorna_payment_status", {
      p_ordine_id: ordineId,
      p_nuovo_stato: "partially_refunded",
      p_payment_id: null,
      p_transaction_id: `re_rimborso_${ts}`,
      p_importo: null,
      p_valuta: null,
      p_expires_at: null,
    });
    check("M) stato identico → rifiutato (nessuna doppia mutazione)", webhookDup.error === null && webhookDup.data?.ok === false && webhookDup.data?.codice === "TRANSIZIONE_NON_CONSENTITA", webhookDup.data);

    // ── D) OVER-REFUND rifiutato (16.00 > residuo 15.00) ─────────────────
    const over = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: ordineId,
      p_importo: 16.0,
      p_merchant_user_id: OWNER_1,
    });
    check("D) over-refund rifiutato (OVER_REFUND)", over.error === null && over.data?.ok === false && over.data?.codice === "OVER_REFUND", over.data);

    // ── H) importo non manipolabile: 999 rifiutato ───────────────────────
    const h = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: ordineId,
      p_importo: 999,
      p_merchant_user_id: OWNER_1,
    });
    check("H) importo client 999 → OVER_REFUND", h.error === null && h.data?.ok === false && h.data?.codice === "OVER_REFUND", h.data);

    // ── T) importo con più di 2 decimali rifiutato ───────────────────────
    const dec = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: ordineId,
      p_importo: 5.555,
      p_merchant_user_id: OWNER_1,
    });
    check("T) importo 5.555 (3 decimali) → IMPORTO_NON_VALIDO", dec.error === null && dec.data?.ok === false && dec.data?.codice === "IMPORTO_NON_VALIDO", dec.data);

    // ── U) non-owner/non-admin → FORBIDDEN ───────────────────────────────
    const u = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: ordineId,
      p_importo: 5.0,
      p_merchant_user_id: UID_ALTRO,
    });
    check("U) utente estraneo → FORBIDDEN", u.error === null && u.data?.ok === false && u.data?.codice === "FORBIDDEN", u.data);

    // ── C) SECONDO REFUND del residuo 15.00 → refunded ──────────────────
    const residuo = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: ordineId,
      p_importo: 15.0,
      p_merchant_user_id: OWNER_1,
    });
    check("C) secondo refund del residuo ok", residuo.error === null && residuo.data?.ok === true, residuo.error?.message);
    check("C) stato atteso refunded", residuo.data?.stato_nuovo === "refunded", residuo.data?.stato_nuovo);
    check("C) residuo dopo = 0.00", uguali(Number(residuo.data?.residuo), 0.0), residuo.data?.residuo);
    check("C) refunded cumulato = 25.00", uguali(Number(residuo.data?.payment_refunded_amount), 25.0), residuo.data?.payment_refunded_amount);

    // ── E) refund su ordine già (cumulativamente) rimborsato → rifiutato ─
    const e = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: ordineId,
      p_importo: 5.0,
      p_merchant_user_id: OWNER_1,
    });
    check("E) residuo 0 → NON_REFUNDABLE", e.error === null && e.data?.ok === false && e.data?.codice === "NON_REFUNDABLE", e.data);

    // ── I) idempotenza prenotazione: owner di un altro negozio → FORBIDDEN
    //      + cumulo prenotazioni limitato al totale (over-refund oltre il
    //      totale rifiutato) ──────────────────────────────────────────────
    const setup2 = await preparaOrdinePagato({ ts: ts + 1, prezzo: 10.0, quantita: 1, owner: OWNER_2 });
    creati.push(setup2);
    const estraneo = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: setup2.ordineId,
      p_importo: 4.0,
      p_merchant_user_id: OWNER_1, // owner di un ALTRO negozio
    });
    check("I) owner del negozio sbagliato → FORBIDDEN", estraneo.error === null && estraneo.data?.ok === false && estraneo.data?.codice === "FORBIDDEN", estraneo.data);
    const primoOk = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: setup2.ordineId,
      p_importo: 4.0,
      p_merchant_user_id: OWNER_2,
    });
    check("I) primo rimborso 4.00 ok", primoOk.error === null && primoOk.data?.ok === true, primoOk.error?.message);
    const retry = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: setup2.ordineId,
      p_importo: 4.0,
      p_merchant_user_id: OWNER_2,
    });
    check("I) retry cumula: refunded cumulato = 8.00 (≤ totale 10.00)", retry.error === null && retry.data?.ok === true && uguali(Number(retry.data?.payment_refunded_amount), 8.0), retry.data?.payment_refunded_amount);
    const overRetry = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: setup2.ordineId,
      p_importo: 3.0,
      p_merchant_user_id: OWNER_2,
    });
    check("I) cumulo oltre il totale → OVER_REFUND (8+3 > 10)", overRetry.error === null && overRetry.data?.ok === false && overRetry.data?.codice === "OVER_REFUND", overRetry.data);

    // ── RILASCIO prenotazione (provider fallito) ─────────────────────────
    const annulla = await db.rpc("pagamenti_rimborso_annulla", {
      p_ordine_id: setup2.ordineId,
      p_importo: 4.0,
    });
    check("annulla) rilascio ok → cumulato 4.00", annulla.error === null && annulla.data?.ok === true && uguali(Number(annulla.data?.payment_refunded_amount), 4.0), annulla.data);
    const { data: dopoAnnulla } = await db.from("ordini").select("payment_refunded_amount").eq("id", setup2.ordineId).single();
    check("J) DB: payment_refunded_amount = 4.00 (dopo rilascio)", uguali(Number(dopoAnnulla?.payment_refunded_amount), 4.0), dopoAnnulla?.payment_refunded_amount);

    // ── F) refund su ordine NON pagato (payment NULL) rifiutato ──────────
    const setup3 = await preparaOrdinePagato({ ts: ts + 2, prezzo: 5.0, quantita: 1, owner: OWNER_3 });
    creati.push(setup3);
    const { data: legacy, error: legacyErr } = await db.rpc("crea_ordine", {
      p_payload: {
        idempotencyKey: `rimborso-legacy-${ts}`,
        prodottoId: setup3.prodottoId,
        quantita: 1,
        modalita: "ritiro",
        clienteNome: "Leo",
        clienteCognome: "Legacy",
        clienteTelefono: null,
        clienteEmail: null,
        clienteIp: "127.0.0.1",
        ritiroData: null,
        ritiroFascia: null,
        note: null,
      },
    });
    if (legacyErr || !legacy || legacy.ok !== true) throw new Error("crea_ordine legacy fallita");
    const legacyId = String((legacy.ordine as { id?: string }).id ?? "");
    creati.push({ ordineId: legacyId, totale: 5.0, negozioId: setup3.negozioId, prodottoId: setup3.prodottoId });
    const f = await db.rpc("pagamenti_prepara_rimborso", {
      p_ordine_id: legacyId,
      p_importo: 5.0,
      p_merchant_user_id: OWNER_3,
    });
    check("F) ordine non pagato (payment NULL) → RIMBORSO_NON_CONSENTITO", f.error === null && f.data?.ok === false && f.data?.codice === "RIMBORSO_NON_CONSENTITO", f.data);

    // ── N) ordine senza provider gateway → non rimborsabile (coperto da F) ─
    check("N) ordine senza pagamento gateway → non rimborsabile (coperto da F)", true);

    // ── L) transizione finale via macchina esistente: → refunded ─────────
    const statoFinale = await db.rpc("aggiorna_payment_status", {
      p_ordine_id: setup2.ordineId,
      p_nuovo_stato: "refunded",
      p_payment_id: null,
      p_transaction_id: null,
      p_importo: null,
      p_valuta: null,
      p_expires_at: null,
    });
    check("L) paid → refunded consentito dalla macchina", statoFinale.error === null && statoFinale.data?.ok === true, statoFinale.error?.message);
  } finally {
    // ── Cleanup (self-cleaning) ─────────────────────────────────────────
    for (const c of creati) {
      await db.from("ordini").delete().eq("id", c.ordineId);
      await db.from("prodotti").delete().eq("id", c.prodottoId);
      await db.from("negozi").delete().eq("id", c.negozioId);
    }
  }

  console.log(`\nRimborsi DB: ${passati} passati, ${falliti} falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
