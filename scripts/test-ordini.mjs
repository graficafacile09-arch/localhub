/**
 * Test concreti del flusso ordini (FASE ORDINI) contro il DB reale.
 *
 * Verifica i casi richiesti chiamando la VERA implementazione (la funzione
 * PostgreSQL atomica `public.crea_ordine`, usata da /api/cliente/ordini):
 *   T1 un ordine valido venga salvato (ordini + ordini_righe, numero LH-...)
 *   T2 un prodotto inesistente venga rifiutato (404)
 *   T3 un prodotto inattivo venga rifiutato (409)
 *   T4 quantità non valida venga rifiutata (0, -1, 1.5, 100)
 *   T5 non sia possibile ordinare un prodotto di un altro negozio
 *      (il server risolve SEMPRE il negozio dal prodotto)
 *   T6 un doppio click non generi due ordini (idempotency_key identica)
 *
 * Uso: node scripts/test-ordini.mjs <service_role_key>
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

/** HTTP status associato ai codici della RPC (stessa mappa di lib/cliente/orders.ts). */
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

/** Chiama la VERA RPC atomica crea_ordine (stessa di /api/cliente/ordini). */
async function creaOrdine(db, input) {
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
    ritiroData: input.ritiro?.data ?? null,
    ritiroFascia: input.ritiro?.fascia ?? null,
    spedizioneIndirizzo: input.spedizione?.indirizzo ?? null,
    spedizioneCap: input.spedizione?.cap ?? null,
    spedizioneCitta: input.spedizione?.citta ?? null,
    spedizioneProvincia: input.spedizione?.provincia ?? null,
    spedizioneNote: input.spedizione?.note ?? null,
    metodoSpedizione: input.spedizione?.metodoSpedizione ?? null,
    metodoPagamento: input.spedizione?.metodoPagamento ?? null,
    note: input.note ?? null,
  };

  const { data, error } = await db.rpc("crea_ordine", { p_payload: payload });
  if (error) {
    return { ok: false, codice: "SAVE_FAILED", status: 500, errore: error.message };
  }
  if (!data || data.ok !== true) {
    const codice = String(data?.codice ?? "SAVE_FAILED");
    return {
      ok: false,
      codice,
      status: STATUS_DA_CODICE[codice] ?? 500,
      errore: data?.messaggio,
    };
  }
  return { ok: true, giaEsistente: !!data.giaEsistente, ordine: data.ordine };
}

async function main() {
  loadEnv();

  // La chiave service_role è un segreto: si passa come argomento
  // (es. node scripts/test-ordini.mjs <service_role_key>) oppure via env
  // SUPABASE_SERVICE_ROLE_KEY. Il .env.local locale contiene un placeholder.
  const serviceRoleKey = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 100) {
    console.error("Passa la service_role key come argomento: node scripts/test-ordini.mjs <key>");
    process.exit(1);
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey);

  console.log("\n── SETUP: creo un prodotto di test con stock sufficiente ──");

  // Il decremento delle scorte è ora REALE (RPC atomica): i test non possono
  // riusare i prodotti demo (il loro stock si esaurirebbe). Creo un prodotto
  // di test dedicato (stock 10) su un negozio attivo reale, e lo elimino in
  // pulizia.
  const { data: negozi, error: errNegoziAttivi } = await db
    .from("negozi")
    .select("id")
    .eq("attivo", true)
    .is("deleted_at", null)
    .limit(50);
  if (errNegoziAttivi || !negozi || negozi.length === 0) {
    console.log("❌ Nessun negozio attivo nel DB:", errNegoziAttivi?.message ?? "nessun negozio");
    process.exit(1);
  }
  const ts = Date.now();
  const { data: prodotto, error: errProdotto } = await db
    .from("prodotti")
    .insert({
      slug: `test-ordini-${ts}`,
      negozio_id: negozi[0].id,
      nome: `Prodotto Test Ordini (${ts})`,
      descrizione: "prodotto temporaneo per test del flusso ordini",
      categoria: "Test",
      prezzo: 5.0,
      attivo: true,
      quantita_disponibile: 10,
      origine_pubblicazione: "manuale",
    })
    .select("id, negozio_id, nome, prezzo, quantita_disponibile, attivo")
    .single();
  if (errProdotto || !prodotto) {
    console.log("❌ Creazione prodotto di test:", errProdotto?.message);
    process.exit(1);
  }
  console.log(`  prodotto di test: id=${prodotto.id} negozio=${prodotto.negozio_id} stock=10`);

  const baseCliente = { nome: "Test", cognome: "Ordini", telefono: "333 1234567" };
  const baseInput = (idempotencyKey, over = {}) => ({
    idempotencyKey,
    prodottoId: String(prodotto.id),
    quantita: 1,
    modalita: "ritiro",
    cliente: { ...baseCliente },
    ritiro: { data: null, fascia: null },
    note: null,
    ...over,
  });

  // ── T1 ordine valido salvato ──────────────────────────────────────────────
  console.log("\n── T1 ordine valido ──");
  const t1 = await creaOrdine(db, baseInput("t1-" + crypto.randomUUID()));
  if (t1.ok && t1.ordine.id && t1.ordine.numero) {
    ok(`T1 ordine salvato: numero=${t1.ordine.numero} totale=${t1.ordine.totale} righe=${t1.ordine.righe.length}`);
    const { data: riga, error } = await db
      .from("ordini").select("numero, totale, stato, negozio_nome").eq("id", t1.ordine.id).single();
    if (!error && riga) ok(`T1 persistito in Supabase: ${riga.numero} (${riga.negozio_nome})`);
    else ko("T1 verifica persistenza", error?.message);
  } else {
    ko("T1 ordine valido", t1);
  }

  // ── T2 prodotto inesistente ───────────────────────────────────────────────
  console.log("\n── T2 prodotto inesistente ──");
  const t2 = await creaOrdine(db, baseInput("t2-" + crypto.randomUUID(), { prodottoId: "999999999999" }));
  if (!t2.ok && t2.status === 404 && t2.codice === "PRODOTTO_NON_TROVATO") ok("T2 rifiutato (404)");
  else ko("T2 prodotto inesistente", t2);

  // ── T3 prodotto inattivo ──────────────────────────────────────────────────
  console.log("\n── T3 prodotto inattivo ──");
  const { data: inattivi } = await db.from("prodotti").select("id, attivo").eq("attivo", false).limit(5);
  if (inattivi && inattivi.length > 0) {
    const t3 = await creaOrdine(db, baseInput("t3-" + crypto.randomUUID(), { prodottoId: String(inattivi[0].id) }));
    if (!t3.ok && t3.codice === "PRODOTTO_INATTIVO" && t3.status === 409) ok("T3 rifiutato (409)");
    else ko("T3 prodotto inattivo", t3);
  } else {
    console.log("  ⚠️  Nessun prodotto inattivo nel DB: T3 saltato.");
  }

  // ── T4 quantità non valida ────────────────────────────────────────────────
  console.log("\n── T4 quantità non valida ──");
  let t4Ok = true;
  for (const q of [0, -1, 1.5, 100]) {
    const r = await creaOrdine(db, baseInput("t4-" + crypto.randomUUID(), { quantita: q }));
    if (r.ok) {
      t4Ok = false;
      console.log(`     → quantità ${q} ACCETTATA (errore!)`);
    }
  }
  if (t4Ok) ok("T4 quantità 0, -1, 1.5, 100 tutte rifiutate");
  else ko("T4 quantità non valida");

  // ── T5 prodotto di un altro negozio ───────────────────────────────────────
  console.log("\n── T5 negozio risolto dal prodotto ──");
  const t5 = await creaOrdine(db, baseInput("t5-" + crypto.randomUUID()));
  if (t5.ok && String(t5.ordine.negozioId) === String(prodotto.negozio_id)) {
    ok("T5 l'ordine è agganciato al negozio del prodotto (nessun negozio estraneo)");
  } else {
    ko("T5 negozio dal prodotto", t5);
  }

  // ── T6 doppio click → un solo ordine ──────────────────────────────────────
  console.log("\n── T6 doppio click (idempotenza) ──");
  const chiaveDoppia = "t6-" + crypto.randomUUID();
  const [primo, secondo] = await Promise.all([
    creaOrdine(db, baseInput(chiaveDoppia)),
    creaOrdine(db, baseInput(chiaveDoppia)),
  ]);
  if (primo.ok && secondo.ok && primo.ordine.id === secondo.ordine.id) {
    ok(`T6 doppio click → stesso ordine ${primo.ordine.numero} (id identico)`);
    const { count } = await db
      .from("ordini").select("id", { count: "exact", head: true }).eq("idempotency_key", chiaveDoppia);
    if (count === 1) ok("T6 un solo ordine in DB per la chiave");
    else ko("T6 conteggio DB", { count });
  } else {
    ko("T6 doppio click", { primo: primo.ok, secondo: secondo.ok });
  }

  // ── PULIZIA ordini di test + prodotto di test ─────────────────────────────
  console.log("\n── PULIZIA ordini di test ──");
  const { data: righeTest } = await db
    .from("ordini")
    .select("id")
    .or(
      "idempotency_key.like.t1-%,idempotency_key.like.t2-%,idempotency_key.like.t3-%,idempotency_key.like.t4-%,idempotency_key.like.t5-%,idempotency_key.like.t6-%"
    );
  if (righeTest && righeTest.length > 0) {
    const ids = righeTest.map((r) => r.id);
    const { error: delRighe } = await db.from("ordini_righe").delete().in("ordine_id", ids);
    const { error: delOrdini } = await db.from("ordini").delete().in("id", ids);
    if (!delRighe && !delOrdini) ok(`puliti ${ids.length} ordini di test`);
    else console.log("  ⚠️  pulizia parziale:", delOrdini?.message ?? delRighe?.message);
  } else {
    console.log("  (nessun ordine residuo da pulire)");
  }
  const { error: delProdottoTest } = await db
    .from("prodotti")
    .delete()
    .like("slug", `test-ordini-${ts}-%`);
  if (!delProdottoTest) ok(`prodotto di test eliminato`);
  else console.log("  ⚠️ pulizia prodotto di test:", delProdottoTest.message);

  console.log(`\n─────────────────────────────`);
  console.log(`Totale: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
