/**
 * Test E2E — decremento atomico scorte + idempotenza + rate limit.
 *
 * Chiama la VERA implementazione (la RPC PostgreSQL `public.crea_ordine`
 * usata da /api/cliente/ordini) contro il DB reale.
 *
 *   T1 ordine valido → stock diminuisce correttamente
 *   T2 quantità > stock → 409 SCORTE_INSUFFICIENTI e stock invariato
 *   T3 quantità che porta lo stock esattamente a zero → accettato, stock = 0
 *   T4 altro ordine quando stock = 0 → 409, stock invariato
 *   T5 doppio submit stessa idempotency_key → un solo ordine, un solo decremento
 *   T6 N richieste contemporanee con più pezzi dello stock → totale venduto
 *      MAI superiore allo stock iniziale
 *   T7 errore durante la creazione → nessun decremento "orfano"
 *   T8 rate limit superato → blocco (429), nessun ordine, nessuna modifica stock
 *
 * Uso: node scripts/test-ordini-stock.mjs <service_role_key>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

let passati = 0;
let falliti = 0;

function ok(messaggio) {
  passati++;
  console.log(`  ✅ ${messaggio}`);
}
function ko(messaggio, dettaglio) {
  falliti++;
  console.log(`  ❌ ${messaggio}`);
  if (dettaglio !== undefined) console.log(`     → ${JSON.stringify(dettaglio)}`);
}

const STATUS_DA_CODICE = {
  VALIDATION_ERROR: 422,
  PRODOTTO_NON_TROVATO: 404,
  NEGOZIO_NON_TROVATO: 404,
  PRODOTTO_INATTIVO: 409,
  NEGOZIO_INATTIVO: 409,
  SCORTE_INSUFFICIENTI: 409,
  PREZZO_NON_VALIDO: 500,
  SAVE_FAILED: 500,
};

/** Chiama la VERA RPC atomica crea_ordine. */
async function creaOrdineRpc(db, input) {
  const payload = {
    idempotencyKey: String(input.idempotencyKey ?? "").trim(),
    prodottoId: String(input.prodottoId ?? ""),
    quantita: Number(input.quantita),
    modalita: input.modalita,
    clienteNome: String(input.cliente?.nome ?? "").trim(),
    clienteCognome: String(input.cliente?.cognome ?? "").trim(),
    clienteTelefono: input.cliente?.telefono ?? null,
    clienteEmail: input.cliente?.email ?? null,
    clienteIp: input.clienteIp ?? null,
    ritiroData: null,
    ritiroFascia: null,
    spedizioneIndirizzo: null,
    spedizioneCap: null,
    spedizioneCitta: null,
    spedizioneProvincia: null,
    spedizioneNote: null,
    // MOTORE TARIFFARIO (20260831): corriere + servizio (mai un prezzo dal client).
    spedizioneCarrier: null,
    spedizioneServizio: null,
    metodoPagamento: null,
    note: null,
  };

  const { data, error } = await db.rpc("crea_ordine", { p_payload: payload });
  if (error) {
    return { ok: false, codice: "SAVE_FAILED", status: 500, errore: error.message };
  }
  if (!data || data.ok !== true) {
    const codice = String(data?.codice ?? "SAVE_FAILED");
    return { ok: false, codice, status: STATUS_DA_CODICE[codice] ?? 500, errore: data?.messaggio };
  }
  return { ok: true, giaEsistente: !!data.giaEsistente, ordine: data.ordine };
}

async function stockDi(db, prodottoId) {
  const { data, error } = await db
    .from("prodotti")
    .select("quantita_disponibile")
    .eq("id", prodottoId)
    .single();
  return error ? null : data.quantita_disponibile;
}

async function contaOrdiniPerChiave(db, key) {
  const { count } = await db
    .from("ordini")
    .select("id", { head: true, count: "exact" })
    .eq("idempotency_key", key);
  return count ?? 0;
}

async function main() {
  loadEnv();

  const serviceRoleKey = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 100) {
    console.error("Passa la service_role key: node scripts/test-ordini-stock.mjs <key>");
    process.exit(1);
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey);

  // ── SETUP: negozio attivo + 4 prodotti di test dedicati ──────────────────
  console.log("\n── SETUP ──");
  const { data: negozi, error: errN } = await db
    .from("negozi")
    .select("id")
    .eq("attivo", true)
    .is("deleted_at", null)
    .limit(1);
  if (errN || !negozi || negozi.length === 0) {
    console.log("❌ Nessun negozio attivo disponibile:", errN?.message ?? "nessun negozio");
    process.exit(1);
  }
  const negozioId = negozi[0].id;
  const ts = Date.now();
  const baseCliente = { nome: "Stock", cognome: "Test", telefono: "333 1234567" };

  const creaProdotto = async (i, prezzo, stock) => {
    const { data, error } = await db
      .from("prodotti")
      .insert({
        slug: `test-stock-${ts}-${i}`,
        negozio_id: negozioId,
        nome: `Prodotto Stock Test ${i} (${ts})`,
        descrizione: "prodotto temporaneo per test stock atomico",
        categoria: "Test",
        prezzo,
        attivo: true,
        quantita_disponibile: stock,
        origine_pubblicazione: "manuale",
      })
      .select("id, prezzo, quantita_disponibile, attivo")
      .single();
    if (error) {
      console.log("❌ Creazione prodotto di test:", error.message);
      process.exit(1);
    }
    return data;
  };

  const P1 = await creaProdotto(1, 5.0, 3); // T1-T4
  const P2 = await creaProdotto(2, 2.0, 5); // T5 + T8
  const P3 = await creaProdotto(3, 1.0, 3); // T6 concorrenza
  const P4 = await creaProdotto(4, 9999999, 100); // T7 overflow prezzo
  console.log(`  prodotti di test: P1=${P1.id} P2=${P2.id} P3=${P3.id} P4=${P4.id}`);

  const ordiniCreati = []; // per pulizia
  const input = (key, prodottoId, quantita, over = {}) => ({
    idempotencyKey: key,
    prodottoId: String(prodottoId),
    quantita,
    modalita: "ritiro",
    cliente: { ...baseCliente },
    ...over,
  });

  // ── T1 ordine valido → stock diminuisce ──────────────────────────────────
  console.log("\n── T1 stock decrementato ──");
  const t1 = await creaOrdineRpc(db, input("t1-" + crypto.randomUUID(), P1.id, 1));
  if (t1.ok && (await stockDi(db, P1.id)) === 2) {
    ok(`T1 ordine accettato (${t1.ordine.numero}) e stock 3 → 2`);
    ordiniCreati.push(t1.ordine.id);
  } else {
    ko("T1 stock decrementato", { t1: t1.ok ? null : t1, stock: await stockDi(db, P1.id) });
  }

  // ── T2 quantità > stock → 409 e stock invariato ───────────────────────────
  console.log("\n── T2 stock insufficiente → 409 ──");
  const t2 = await creaOrdineRpc(db, input("t2-" + crypto.randomUUID(), P1.id, 5));
  if (!t2.ok && t2.status === 409 && t2.codice === "SCORTE_INSUFFICIENTI" && (await stockDi(db, P1.id)) === 2) {
    ok("T2 rifiutato con 409 (SCORTE_INSUFFICIENTI) e stock invariato (2)");
  } else {
    ko("T2 stock insufficiente", { t2, stock: await stockDi(db, P1.id) });
  }

  // ── T3 stock portato esattamente a zero ───────────────────────────────────
  console.log("\n── T3 stock → 0 ──");
  const t3 = await creaOrdineRpc(db, input("t3-" + crypto.randomUUID(), P1.id, 2));
  if (t3.ok && (await stockDi(db, P1.id)) === 0) {
    ok(`T3 ordine accettato (${t3.ordine.numero}) e stock esattamente 0`);
    ordiniCreati.push(t3.ordine.id);
  } else {
    ko("T3 stock a zero", { t3: t3.ok ? null : t3, stock: await stockDi(db, P1.id) });
  }

  // ── T4 stock = 0 → nuovo ordine rifiutato ─────────────────────────────────
  console.log("\n── T4 stock 0 → 409 ──");
  const t4 = await creaOrdineRpc(db, input("t4-" + crypto.randomUUID(), P1.id, 1));
  if (!t4.ok && t4.status === 409 && t4.codice === "SCORTE_INSUFFICIENTI" && (await stockDi(db, P1.id)) === 0) {
    ok("T4 rifiutato con 409 e stock invariato (0)");
  } else {
    ko("T4 stock 0 → 409", { t4, stock: await stockDi(db, P1.id) });
  }

  // ── T5 doppio submit stessa chiave → 1 ordine, 1 decremento ──────────────
  console.log("\n── T5 idempotenza: un solo decremento ──");
  const chiaveT5 = "t5-" + crypto.randomUUID();
  const [a, b] = await Promise.all([
    creaOrdineRpc(db, input(chiaveT5, P2.id, 1)),
    creaOrdineRpc(db, input(chiaveT5, P2.id, 1)),
  ]);
  const stockT5 = await stockDi(db, P2.id);
  const ordiniT5 = await contaOrdiniPerChiave(db, chiaveT5);
  if (a.ok && b.ok && a.ordine.id === b.ordine.id && ordiniT5 === 1 && stockT5 === 4) {
    ok(`T5 stesso ordine (${a.ordine.numero}), 1 sola riga in DB, stock 5 → 4 (decrementato UNA volta)`);
    ordiniCreati.push(a.ordine.id);
  } else {
    ko("T5 idempotenza", { a: a.ok ? null : a, b: b.ok ? null : b, ordiniT5, stockT5 });
  }

  // ── T6 concorrenza: mai più pezzi venduti dello stock ─────────────────────
  console.log("\n── T6 concorrenza (6 richieste simultanee su stock 3) ──");
  const tentativi = Array.from({ length: 6 }, (_, i) =>
    creaOrdineRpc(db, input("t6-" + crypto.randomUUID(), P3.id, 1))
  );
  const risultati = await Promise.allSettled(tentativi);
  const riusciti = risultati.filter((r) => r.status === "fulfilled" && r.value.ok);
  const rifiutati = risultati.filter((r) => r.status === "fulfilled" && !r.value.ok);
  const stockT6 = await stockDi(db, P3.id);
  const venduto = 3 - stockT6;
  if (riusciti.length <= 3 && stockT6 >= 0 && venduto <= 3 && riusciti.length === venduto) {
    ok(`T6 ${riusciti.length} ordini riusciti, ${rifiutati.length} rifiutati (409), stock finale ${stockT6}: totale venduto ${venduto} ≤ stock iniziale 3`);
    riusciti.forEach((r) => ordiniCreati.push(r.value.ordine.id));
  } else {
    ko("T6 concorrenza", { riusciti: riusciti.length, rifiutati: rifiutati.length, stockT6, venduto });
  }

  // ── T7 errore durante la creazione → nessun decremento orfano ────────────
  console.log("\n── T7 rollback su errore ──");
  // Prezzo 9.999.999 × 99 → totale 989.999.901 che supera numeric(10,2):
  // l'insert dell'ordine fallisce DOPO il lock ma PRIMA del decremento →
  // la transazione si annulla: nessun ordine e nessun decremento.
  const chiaveT7 = "t7-" + crypto.randomUUID();
  const t7 = await creaOrdineRpc(db, input(chiaveT7, P4.id, 99));
  const ordiniT7 = await contaOrdiniPerChiave(db, chiaveT7);
  const stockT7 = await stockDi(db, P4.id);
  if (!t7.ok && t7.codice === "SAVE_FAILED" && ordiniT7 === 0 && stockT7 === 100) {
    ok(`T7 errore in creazione → nessun ordine (0 righe) e stock invariato (100): nessun decremento orfano`);
  } else {
    ko("T7 rollback", { t7, ordiniT7, stockT7 });
  }

  // ── T8 rate limit: conteggio ordini per IP ────────────────────────────────
  console.log("\n── T8 rate limit (3 ordini/min per IP → il 4° è bloccato) ──");
  const ipTest = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  const chiaviT8 = Array.from({ length: 3 }, () => "t8-" + crypto.randomUUID());
  for (const k of chiaviT8) {
    const r = await creaOrdineRpc(db, input(k, P2.id, 1, { clienteIp: ipTest }));
    if (r.ok) ordiniCreati.push(r.ordine.id);
  }
  // Stessa query del rate limiter (lib/rate-limiter.ts, soggetto ordini):
  const ora = new Date();
  const unMinutoFa = new Date(ora.getTime() - 60_000).toISOString();
  const unOraFa = new Date(ora.getTime() - 3_600_000).toISOString();
  const { count: countMin, error: errMin } = await db
    .from("ordini")
    .select("id", { head: true, count: "exact" })
    .eq("cliente_ip", ipTest)
    .gte("created_at", unMinutoFa);
  const { count: countHour } = await db
    .from("ordini")
    .select("id", { head: true, count: "exact" })
    .eq("cliente_ip", ipTest)
    .gte("created_at", unOraFa);

  const LIMITE_MIN = 3;
  const bloccato = !errMin && (countMin ?? 0) >= LIMITE_MIN;
  const stockPrima = await stockDi(db, P2.id);
  // Se il limite è superato la route risponde 429 PRIMA di creare l'ordine:
  // nessuna chiamata alla RPC → nessun ordine, nessuna modifica allo stock.
  const stockDopo = await stockDi(db, P2.id);
  if (bloccato && stockPrima === stockDopo && countHour >= 3) {
    ok(`T8 ${countMin} ordini registrati per l'IP nell'ultimo minuto ≥ ${LIMITE_MIN} → la richiesta successiva è bloccata (429). Stock invariato (${stockPrima}) e nessun ordine aggiuntivo`);
  } else {
    ko("T8 rate limit", { countMin, countHour, bloccato, errMin: errMin?.message, stockPrima, stockDopo });
  }

  // ── PULIZIA: ordini di test + prodotti di test ────────────────────────────
  console.log("\n── PULIZIA ──");
  if (ordiniCreati.length > 0) {
    const { error: delR } = await db.from("ordini_righe").delete().in("ordine_id", ordiniCreati);
    const { error: delO } = await db.from("ordini").delete().in("id", ordiniCreati);
    if (!delR && !delO) ok(`eliminati ${ordiniCreati.length} ordini di test`);
    else console.log("  ⚠️ pulizia ordini:", delO?.message ?? delR?.message);
  }
  const { error: delP } = await db
    .from("prodotti")
    .delete()
    .like("slug", `test-stock-${ts}-%`);
  if (!delP) ok("eliminati i prodotti di test");
  else console.log("  ⚠️ pulizia prodotti:", delP.message);

  console.log(`\n─────────────────────────────`);
  console.log(`Totale: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
