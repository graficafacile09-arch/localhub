/**
 * Test concreti del flusso ordini (FASE ORDINI) contro il DB reale.
 *
 * Verifica i casi richiesti:
 *   T1 un ordine valido venga salvato (ordini + ordini_righe, numero LH-...)
 *   T2 un prodotto inesistente venga rifiutato (404)
 *   T3 un prodotto inattivo venga rifiutato (409)
 *   T4 quantità non valida venga rifiutata (0, -1, 1.5, 100)
 *   T5 non sia possibile ordinare un prodotto di un altro negozio
 *      (il server risolve SEMPRE il negozio dal prodotto)
 *   T6 un doppio click non generi due ordini (idempotency_key identica)
 *
 * Replica fedelmente la logica di lib/cliente/orders.ts (creaOrdine) con il
 * client service role: stesse query, stesse validazioni, stesso inserimento.
 * Uso: node scripts/test-ordini.mjs
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

const COSTI_SPEDIZIONE = { standard: 5.9, express: 12.9 };

/** Replica di creaOrdine (stessa logica di lib/cliente/orders.ts). */
async function creaOrdine(db, input) {
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key || key.length > 64) return { ok: false, codice: "VALIDATION_ERROR", status: 422 };

  const prodottoId = String(input.prodottoId ?? "");
  if (!/^\d+$/.test(prodottoId)) return { ok: false, codice: "VALIDATION_ERROR", status: 422 };

  const quantita = Number(input.quantita);
  if (!Number.isInteger(quantita) || quantita < 1 || quantita > 99) {
    return { ok: false, codice: "VALIDATION_ERROR", status: 422 };
  }
  if (input.modalita !== "ritiro" && input.modalita !== "spedizione") {
    return { ok: false, codice: "VALIDATION_ERROR", status: 422 };
  }
  const nome = String(input.cliente?.nome ?? "").trim();
  const cognome = String(input.cliente?.cognome ?? "").trim();
  if (!nome || !cognome) return { ok: false, codice: "VALIDATION_ERROR", status: 422 };

  // Idempotenza
  const { data: esistente } = await db
    .from("ordini").select("*").eq("idempotency_key", key).maybeSingle();
  if (esistente) {
    const { data: righeE } = await db
      .from("ordini_righe").select("*").eq("ordine_id", esistente.id).order("created_at");
    return { ok: true, giaEsistente: true, ordine: { ...esistente, righe: righeE ?? [] } };
  }

  // Prodotto
  const { data: prodotto, error: errP } = await db
    .from("prodotti")
    .select("id, negozio_id, nome, prezzo, quantita_disponibile, attivo, immagine_principale")
    .eq("id", Number(prodottoId)).single();
  if (errP || !prodotto) return { ok: false, codice: "PRODOTTO_NON_TROVATO", status: 404 };
  if (!prodotto.attivo) return { ok: false, codice: "PRODOTTO_INATTIVO", status: 409 };

  // Negozio (sempre dal prodotto)
  const { data: negozio, error: errN } = await db
    .from("negozi")
    .select("id, nome, attivo, deleted_at")
    .eq("id", String(prodotto.negozio_id)).single();
  if (errN || !negozio) return { ok: false, codice: "NEGOZIO_NON_TROVATO", status: 404 };
  if (!negozio.attivo || negozio.deleted_at) return { ok: false, codice: "NEGOZIO_INATTIVO", status: 409 };

  const prezzoUnitario = Number(prodotto.prezzo);
  const disponibile = prodotto.quantita_disponibile;
  if (disponibile != null && Number(disponibile) < quantita) {
    return { ok: false, codice: "SCORTE_INSUFFICIENTI", status: 409 };
  }

  const costoSpedizione = input.modalita === "spedizione"
    ? COSTI_SPEDIZIONE[input.spedizione?.metodoSpedizione ?? "standard"]
    : 0;
  const totale = Number((prezzoUnitario * quantita + costoSpedizione).toFixed(2));

  const { data: ordineRow, error: errO } = await db
    .from("ordini")
    .insert({
      idempotency_key: key,
      modalita: input.modalita,
      totale,
      negozio_id: negozio.id,
      negozio_nome: String(negozio.nome),
      cliente_nome: nome,
      cliente_cognome: cognome,
      cliente_telefono: input.cliente?.telefono ?? null,
      cliente_email: input.cliente?.email ?? null,
      ritiro_data: input.modalita === "ritiro" ? (input.ritiro?.data ?? null) : null,
      ritiro_fascia: input.modalita === "ritiro" ? (input.ritiro?.fascia ?? null) : null,
      spedizione_indirizzo: input.modalita === "spedizione" ? String(input.spedizione?.indirizzo ?? "") : null,
      spedizione_cap: input.modalita === "spedizione" ? String(input.spedizione?.cap ?? "") : null,
      spedizione_citta: input.modalita === "spedizione" ? String(input.spedizione?.citta ?? "") : null,
      spedizione_provincia: input.modalita === "spedizione" ? String(input.spedizione?.provincia ?? "") : null,
      metodo_spedizione: input.modalita === "spedizione" ? (input.spedizione?.metodoSpedizione ?? "standard") : null,
      costo_spedizione: costoSpedizione,
      metodo_pagamento: input.modalita === "spedizione" ? (input.spedizione?.metodoPagamento ?? "carta") : null,
      note: input.note ?? null,
    })
    .select("*").single();

  if (errO || !ordineRow) {
    if (String(errO?.code ?? "") === "23505") {
      const { data: giaCreato } = await db
        .from("ordini").select("*").eq("idempotency_key", key).single();
      if (giaCreato) {
        const { data: righeG } = await db
          .from("ordini_righe").select("*").eq("ordine_id", giaCreato.id).order("created_at");
        return { ok: true, giaEsistente: true, ordine: { ...giaCreato, righe: righeG ?? [] } };
      }
    }
    return { ok: false, codice: "SAVE_FAILED", status: 500 };
  }

  const { data: righeRow, error: errR } = await db
    .from("ordini_righe")
    .insert({
      ordine_id: ordineRow.id,
      prodotto_id: Number(prodotto.id),
      nome_prodotto: String(prodotto.nome),
      prezzo_unitario: prezzoUnitario,
      quantita,
      immagine_url: prodotto.immagine_principale ?? null,
    })
    .select("*").single();

  const righe = errR || !righeRow ? [] : [righeRow];
  return { ok: true, giaEsistente: false, ordine: { ...ordineRow, righe } };
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

  console.log("\n── SETUP: individuo un prodotto attivo e un altro negozio ──");

  // Seleziona un prodotto attivo il cui NEGOZIO esiste davvero: nel DB demo
  // alcuni prodotti puntano a negozi orfani. Prima prendo i negozi attivi,
  // poi un prodotto attivo di uno di essi.
  const { data: negoziAttivi, error: errNegoziAttivi } = await db
    .from("negozi")
    .select("id")
    .eq("attivo", true)
    .is("deleted_at", null)
    .limit(50);
  if (errNegoziAttivi) {
    console.log("❌ Errore query negozi:", errNegoziAttivi.message);
    process.exit(1);
  }
  const negoziAttiviIds = (negoziAttivi ?? []).map((n) => n.id);
  if (negoziAttiviIds.length === 0) {
    console.log("⚠️  Nessun negozio attivo nel DB: impossibile testare.");
    process.exit(1);
  }
  const { data: attivi, error: errAttivi } = await db
    .from("prodotti")
    .select("id, negozio_id, nome, prezzo, quantita_disponibile, attivo")
    .eq("attivo", true)
    .in("negozio_id", negoziAttiviIds)
    .limit(20);
  if (errAttivi) {
    console.log("❌ Errore query prodotti:", errAttivi.message);
    process.exit(1);
  }
  if (!attivi || attivi.length === 0) {
    console.log("⚠️  Nessun prodotto attivo con negozio esistente: impossibile testare.");
    process.exit(1);
  }
  const prodotto = attivi[0];
  console.log(`  prodotto attivo: id=${prodotto.id} negozio=${prodotto.negozio_id} prezzo=${prodotto.prezzo}`);

  const { data: negozi } = await db
    .from("negozi").select("id").eq("attivo", true).is("deleted_at", null).limit(50);
  const altroNegozio = (negozi ?? []).find((n) => String(n.id) !== String(prodotto.negozio_id)) ?? null;
  if (altroNegozio) console.log(`  altro negozio disponibile: ${altroNegozio.id}`);

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
  if (t5.ok && String(t5.ordine.negozio_id) === String(prodotto.negozio_id)) {
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

  // ── PULIZIA ordini di test ────────────────────────────────────────────────
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

  console.log(`\n─────────────────────────────`);
  console.log(`Totale: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
