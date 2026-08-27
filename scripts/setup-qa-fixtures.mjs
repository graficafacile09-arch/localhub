/**
 * FASE 13A — Fixture QA funzionali (SOLO dati di test, mai produzione).
 *
 * Opera ESCLUSIVAMENTE su record chiaramente marcati QA/Fixture:
 *   - negozi  "Negozio QA Commerciante A/B/C/D" (untrash da deleted_at)
 *   - prodotti "Prodotto QA Fixture …" (creati se mancanti)
 *   - ordine   con idempotency_key "qa-fixture-ordine-*" per customer-a
 *   - payout   con idempotency_key "qa-fixture-payout"
 *
 * Idempotente: rieseguibile infinite volte. Prima di ogni modifica salva uno
 * snapshot in scripts/__qa-fixtures-snapshot.json.
 *
 * Uso:
 *   node scripts/setup-qa-fixtures.mjs          → crea/ripara le fixture
 *   node scripts/setup-qa-fixtures.mjs --restore → ripristina dallo snapshot
 *
 * Legge NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY da .env.local
 * (DB di SVILUPPO, lo stesso usato da tutti i test locali).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SNAPSHOT_FILE = "scripts/__qa-fixtures-snapshot.json";
const RESTORE = process.argv.includes("--restore");

function loadEnv() {
  const env = {};
  const content = readFileSync(".env.local", "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return env;
}

const env = loadEnv();
const { createClient } = await import("@supabase/supabase-js");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

const NOMI_QA = ["Negozio QA Commerciante A", "Negozio QA Commerciante B", "Negozio QA Commerciante C", "Negozio QA Commerciante D"];
const PREFIX_PRODOTTO = "Prodotto QA Fixture";
const KEY_ORDINE = "qa-fixture-ordine";
const KEY_PAYOUT = "qa-fixture-payout";

async function trovaUtente(email) {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function snapshot() {
  const { data: qa } = await db.from("negozi").select("id, nome, deleted_at").in("nome", NOMI_QA);
  const { data: payouts } = await db.from("payout").select("id, idempotency_key").ilike("idempotency_key", "qa-fixture%");
  const { data: ordini } = await db.from("ordini").select("id, idempotency_key").ilike("idempotency_key", "qa-fixture%");
  const { data: prodotti } = await db.from("prodotti").select("id, nome").ilike("nome", `${PREFIX_PRODOTTO}%`);
  return { negozi: qa ?? [], payout: payouts ?? [], ordini: ordini ?? [], prodotti: prodotti ?? [] };
}

async function restore() {
  if (!existsSync(SNAPSHOT_FILE)) {
    console.error(`Nessuno snapshot trovato (${SNAPSHOT_FILE}).`);
    process.exit(1);
  }
  const snap = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
  // Negozi: ripristina deleted_at originale
  for (const n of snap.negozi ?? []) {
    const { error } = await db.from("negozi").update({ deleted_at: n.deleted_at }).eq("id", n.id);
    if (error) console.error(`ERRORE restore negozio ${n.nome}:`, error.message);
    else console.log(`  Negozio ripristinato: ${n.nome} (deleted_at=${n.deleted_at ?? "null"})`);
  }
  // Payout QA
  for (const p of snap.payout ?? []) {
    const { error } = await db.from("payout").delete().eq("id", p.id);
    if (error) console.error(`ERRORE restore payout ${p.id}:`, error.message);
    else console.log(`  Payout QA rimosso: ${p.id}`);
  }
  // Ordini QA
  for (const o of snap.ordini ?? []) {
    const { error } = await db.from("ordini").delete().eq("id", o.id);
    if (error) console.error(`ERRORE restore ordine ${o.id}:`, error.message);
    else console.log(`  Ordine QA rimosso: ${o.id}`);
  }
  // Prodotti QA
  for (const p of snap.prodotti ?? []) {
    const { error } = await db.from("prodotti").delete().eq("id", p.id);
    if (error) console.error(`ERRORE restore prodotto ${p.nome}:`, error.message);
    else console.log(`  Prodotto QA rimosso: ${p.nome}`);
  }
  console.log("Ripristino completato.");
}

async function main() {
  if (RESTORE) { await restore(); process.exit(0); }

  // ── Snapshot pre-modifica ──────────────────────────────────────────────
  const snap = await snapshot();
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2));
  console.log(`Snapshot salvato (${SNAPSHOT_FILE}).`);

  // ── 1. Untrash negozi QA ───────────────────────────────────────────────
  for (const nome of NOMI_QA) {
    const { data: n } = await db.from("negozi").select("id, deleted_at").eq("nome", nome).maybeSingle();
    if (!n) { console.log(`  Negozio "${nome}" non trovato — skip.`); continue; }
    if (n.deleted_at === null) { console.log(`  Negozio "${nome}" già attivo.`); continue; }
    const { error } = await db.from("negozi").update({ deleted_at: null }).eq("id", n.id);
    if (error) console.error(`  ERRORE untrash "${nome}":`, error.message);
    else console.log(`  Negozio "${nome}" riattivato (${n.id}).`);
  }

  // ── 2. Prodotti QA (nel negozio A; uno anche nel B per lo switch) ─────
  const { data: negoziQA } = await db.from("negozi").select("id, nome").in("nome", NOMI_QA);
  const idA = negoziQA?.find((x) => x.nome === NOMI_QA[0])?.id;
  const idB = negoziQA?.find((x) => x.nome === NOMI_QA[1])?.id;
  const prodottiDaCreare = [];
  if (idA) {
    prodottiDaCreare.push(
      { slug: "prodotto-qa-fixture-1", negozio_id: idA, nome: "Prodotto QA Fixture 1", descrizione: "Fixture QA per test funzionali (Fase 13A).", categoria: "Varie", prezzo: 12.5, quantita_disponibile: 100 },
      { slug: "prodotto-qa-fixture-2", negozio_id: idA, nome: "Prodotto QA Fixture 2", descrizione: "Fixture QA per test funzionali (Fase 13A).", categoria: "Varie", prezzo: 8.0, quantita_disponibile: 50 },
    );
  }
  if (idB) {
    prodottiDaCreare.push(
      { slug: "prodotto-qa-fixture-b-1", negozio_id: idB, nome: "Prodotto QA Fixture B1", descrizione: "Fixture QA per test switch (Fase 13A).", categoria: "Varie", prezzo: 5.0, quantita_disponibile: 30 },
    );
  }
  for (const p of prodottiDaCreare) {
    const { data: esiste } = await db.from("prodotti").select("id").eq("slug", p.slug).maybeSingle();
    if (esiste) { console.log(`  Prodotto "${p.nome}" già presente.`); continue; }
    const { error } = await db.from("prodotti").insert({ ...p, attivo: true, origine_pubblicazione: "merchant" });
    if (error) console.error(`  ERRORE creazione "${p.nome}":`, error.message);
    else console.log(`  Prodotto creato: "${p.nome}" (${p.slug}).`);
  }

  // ── 3. Ordine QA per customer-a ────────────────────────────────────────
  const cust = await trovaUtente("customer-a.test@localhub.it");
  const adminUser = await trovaUtente("admin.test@localhub.it");
  const { data: ordEsistente } = await db.from("ordini").select("id, numero").eq("idempotency_key", KEY_ORDINE).maybeSingle();
  if (!cust) {
    console.log("  customer-a non trovato — ordine QA saltato.");
  } else if (ordEsistente) {
    console.log(`  Ordine QA già presente: ${ordEsistente.numero}.`);
  } else if (!idA) {
    console.log("  Negozio QA A non trovato — ordine QA saltato.");
  } else {
    const { data: prodQA } = await db.from("prodotti").select("id, nome, prezzo").eq("slug", "prodotto-qa-fixture-1").maybeSingle();
    if (!prodQA) {
      console.log("  Prodotto QA 1 non trovato — ordine QA saltato.");
    } else {
      const { data: ord, error } = await db.from("ordini").insert({
        idempotency_key: KEY_ORDINE,
        stato: "in_preparazione",
        modalita: "ritiro",
        totale: prodQA.prezzo,
        negozio_id: idA,
        negozio_nome: NOMI_QA[0],
        cliente_user_id: cust.id,
        cliente_nome: "Cliente",
        cliente_cognome: "QA Fixture",
        cliente_email: cust.email,
        ritiro_data: null,
        ritiro_fascia: null,
      }).select("id, numero").single();
      if (error) {
        console.error("  ERRORE creazione ordine QA:", error.message);
      } else {
        const { error: errRiga } = await db.from("ordini_righe").insert({
          ordine_id: ord.id,
          prodotto_id: prodQA.id,
          nome_prodotto: prodQA.nome,
          prezzo_unitario: prodQA.prezzo,
          quantita: 1,
        });
        if (errRiga) console.error("  ERRORE riga ordine QA:", errRiga.message);
        else console.log(`  Ordine QA creato: ${ord.numero} (${ord.id}).`);
      }
    }
  }

  // ── 4. Payout QA (per il negozio A, stato pagato, importi coerenti) ────
  const { data: payEsistente } = await db.from("payout").select("id, stato").eq("idempotency_key", KEY_PAYOUT).maybeSingle();
  if (payEsistente) {
    console.log(`  Payout QA già presente (stato=${payEsistente.stato}).`);
  } else if (!idA) {
    console.log("  Negozio QA A non trovato — payout QA saltato.");
  } else if (!adminUser) {
    console.log("  admin non trovato — payout QA saltato.");
  } else {
    const lordo = 150.0, commissione = 22.5, netto = 127.5;
    const { data: pay, error } = await db.from("payout").insert({
      negozio_id: idA,
      periodo_da: "2026-08-01",
      periodo_a: "2026-08-31",
      importo_lordo: lordo,
      commissione_importo: commissione,
      importo_netto: netto,
      n_ordini: 1,
      stato: "pagato",
      idempotency_key: KEY_PAYOUT,
      creato_da: adminUser.id,
      stripe_payout_status: "paid",
    }).select("id").single();
    if (error) {
      console.error("  ERRORE creazione payout QA:", error.message);
    } else {
      console.log(`  Payout QA creato (${pay.id}).`);
      // Timbra l'ordine QA (anti doppio payout) per coerenza col dettaglio
      const { data: ordQa } = await db.from("ordini").select("id").eq("idempotency_key", KEY_ORDINE).maybeSingle();
      if (ordQa) {
        await db.from("ordini").update({ payout_id: pay.id }).eq("id", ordQa.id);
        console.log("  Ordine QA timbrato con payout_id.");
      }
    }
  }

  // ── Riepilogo ─────────────────────────────────────────────────────────
  const dopo = await snapshot();
  console.log("\nRIEPILOGO:");
  console.log(`  Negozi QA attivi: ${dopo.negozi.filter((n) => n.deleted_at === null).length}/${dopo.negozi.length}`);
  console.log(`  Prodotti QA: ${dopo.prodotti.length}`);
  console.log(`  Ordini QA: ${dopo.ordini.length} · Payout QA: ${dopo.payout.length}`);
  console.log("Fixture pronte. DB di sviluppo intatto per i dati reali.");
}

main().catch((e) => { console.error(e); process.exit(1); });
