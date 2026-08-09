/**
 * Test concreti della ricerca tollerante homepage (prodotti e negozi).
 *
 * Copre i casi richiesti:
 *   T1 query corretta
 *   T2 errore di una lettera
 *   T3 errore di più lettere
 *   T4 singolare/plurale
 *   T5 maiuscole/minuscole
 *   T6 accenti
 *   T7 query con più parole
 *
 * Due livelli:
 *   - unit: funzioni pure di lib/search-tollerante.ts (nessuna rete)
 *   - e2e: cercaProdotti / cercaNegozi contro Supabase (se raggiungibile)
 *
 * Uso:
 *   node scripts/test-ricerca-tollerante.mjs
 *   (usa NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Carica .env.local senza dipendenze extra ────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* .env.local assente: usiamo le env già presenti */
  }
}

// ── Contatori ────────────────────────────────────────────────────────────────
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

// ── Import dinamico del modulo TS (Node 22.6+ con strip-types) ──────────────
async function importaModulo() {
  const path = join(__dirname, "..", "lib", "search-tollerante.ts");
  return import(`file://${path}?t=${Date.now()}`);
}

// ── Test unit ────────────────────────────────────────────────────────────────
async function testUnit(mod) {
  console.log("\n── UNIT: lib/search-tollerante.ts ──");

  // T5 maiuscole/minuscole + punteggiatura/spazi
  const t5 = mod.pulisciTermine("  PizZeria,   d'Italia  ");
  if (t5 === "pizzeria d italia") ok("T5 pulisciTermine: maiuscole/punteggiatura/spazi normalizzati");
  else ko("T5 pulisciTermine", t5);

  // T6 accenti
  const acc = mod.variantiAccento("caffe");
  if (acc.includes("caffe") && acc.includes("caffè")) ok("T6 variantiAccento: caffe → caffè incluso");
  else ko("T6 variantiAccento", acc);

  const t6 = mod.similaritaLevenshtein("caffe", "caffè");
  if (t6 >= 0.8) ok(`T6 similarità accenti ("caffe" vs "caffè") = ${t6.toFixed(2)}`);
  else ko("T6 similarità accenti", t6);

  // T2 errore di una lettera
  const d2 = mod.distanzaLevenshtein("pizeria", "pizzeria");
  if (d2 === 1) ok(`T2 distanzaLevenshtein una lettera ("pizeria" vs "pizzeria") = ${d2}`);
  else ko("T2 distanzaLevenshtein una lettera", d2);

  const pat2 = mod.patternIlikeTolleranti("pizeria");
  if (pat2.includes("%piz_eria%")) ok("T2 pattern tollerante: %piz_eria% generato");
  else ko("T2 pattern tollerante", pat2);

  // T3 errore di più lettere
  const d3 = mod.distanzaLevenshtein("pizerie", "pizzeria");
  if (d3 === 2) ok(`T3 distanzaLevenshtein due lettere ("pizerie" vs "pizzeria") = ${d3}`);
  else ko("T3 distanzaLevenshtein due lettere", d3);

  // T4 singolare/plurale (radice condivisa → distanza bassa)
  const d4 = mod.distanzaLevenshtein("panini", "panino");
  if (d4 === 1) ok(`T4 singolare/plurale ("panini" vs "panino") = ${d4}`);
  else ko("T4 singolare/plurale", d4);

  // T7 query con più parole → termini significativi (senza stopword)
  const t7 = mod.terminiSignificativi("cerco una pizzeria economica", 3);
  if (t7.length >= 1 && t7.includes("pizzeria") && !t7.includes("una") && !t7.includes("cerco")) {
    ok(`T7 termini significativi multi-parola (stopword escluse): ${JSON.stringify(t7)}`);
  } else {
    ko("T7 termini significativi multi-parola", t7);
  }

  // T7b il trattino basso non diventa wildcard ilike
  const t7b = mod.pulisciTermine("panificio_rossi");
  if (!t7b.includes("_")) ok("T7b pulisciTermine neutralizza '_' (wildcard ilike)");
  else ko("T7b pulisciTermine '_'", t7b);
}

// ── Test e2e ─────────────────────────────────────────────────────────────────
async function testE2e(mod) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log("\n⚠️  E2E saltati: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY non presenti.");
    return;
  }

  const supabase = createClient(url, key);

  // Import di lib/negozi.ts: usa createAdminSupabaseClient che richiede
  // SUPABASE_SERVICE_ROLE_KEY; se assente, replico la logica qui sotto.
  // Per semplicità e per non dipendere dal client admin, eseguo qui le
  // stesse query con il client anon (lettura pubblica).
  console.log("\n── E2E: Supabase (prodotti) ──");

  const q = (pat) => `nome.ilike.${pat},descrizione.ilike.${pat},categoria.ilike.${pat}`;

  // Helper: ricerca tollerante sui negozi (replica di cercaNegoziTolleranti)
  async function cercaNegoziTest(ricerca, mod) {
    const termini = mod.terminiSignificativi(ricerca, 3);
    if (termini.length === 0) return [];

    const pattern = new Set();
    for (const t of termini) {
      for (const p of mod.patternIlikeTolleranti(t).slice(0, 14)) pattern.add(p);
      if (pattern.size >= 42) break;
    }
    const patternList = Array.from(pattern).slice(0, 42);
    if (patternList.length === 0) return [];

    const filtri = patternList.map((pat) => q(pat)).join(",");
    const { data, error } = await supabase
      .from("negozi")
      .select("id, nome, categoria, descrizione")
      .eq("attivo", true)
      .or(filtri)
      .is("deleted_at", null)
      .limit(30);

    if (error) {
      console.log(`  ⚠️  query negozi e2e fallita (${error.message})`);
      return [];
    }

    return (data ?? [])
      .map((r) => ({ r, s: mod.punteggioFuzzy([r.nome, r.categoria, r.descrizione], termini) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map((x) => x.r);
  }

  // Helper: ricerca esatta + fallback fuzzy replicati fedelmente
  async function cercaProdottiTest(ricerca, mod) {
    const termini = mod.terminiSignificativi(ricerca, 3);
    if (termini.length === 0) return [];

    const pattern = new Set();
    for (const t of termini) for (const p of mod.patternIlikeTolleranti(t)) pattern.add(p);
    const patternList = Array.from(pattern).slice(0, 40);
    if (patternList.length === 0) return [];

    const filtri = patternList.map((pat) => q(pat)).join(",");
    const { data, error } = await supabase
      .from("prodotti")
      .select("id, nome, negozio_id")
      .eq("attivo", true)
      .or(filtri)
      .limit(50);

    if (error) {
      console.log(`  ⚠️  query e2e fallita (${error.message})`);
      return [];
    }

    return (data ?? [])
      .map((r) => ({ r, s: mod.punteggioFuzzy([r.nome], termini) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map((x) => x.r);
  }

  // T1 query corretta
  const t1 = await cercaProdottiTest("cornetto", mod);
  if (t1.length > 0) ok(`T1 e2e query corretta "cornetto" → ${t1.length} risultati`);
  else ko("T1 e2e query corretta", "nessun risultato");

  // T1b query corretta negozi (panificio)
  const t1b = await cercaNegoziTest("panificio", mod);
  if (t1b.length > 0) ok(`T1b e2e negozio corretto "panificio" → ${t1b.length} risultati`);
  else ko("T1b e2e negozio corretto", "nessun risultato");

  // T2b refuso una lettera su negozio (panifcio → panificio)
  const t2b = await cercaNegoziTest("panifcio", mod);
  if (t2b.length > 0) ok(`T2b e2e negozio refuso 1 lettera "panifcio" → ${t2b.length} risultati`);
  else ko("T2b e2e negozio refuso 1 lettera", "nessun risultato");

  // T2 errore di una lettera
  const t2 = await cercaProdottiTest("corneto", mod);
  if (t2.length > 0) ok(`T2 e2e una lettera "corneto" → ${t2.length} risultati`);
  else ko("T2 e2e una lettera", "nessun risultato");

  // T3 errore di più lettere
  const t3 = await cercaProdottiTest("cornett", mod);
  if (t3.length > 0) ok(`T3 e2e più lettere "cornett" → ${t3.length} risultati`);
  else ko("T3 e2e più lettere", "nessun risultato");

  // T4 singolare/plurale
  const t4 = await cercaProdottiTest("cornetti", mod);
  if (t4.length > 0) ok(`T4 e2e plurale "cornetti" → ${t4.length} risultati`);
  else ko("T4 e2e plurale", "nessun risultato");

  // T5 maiuscole/minuscole
  const t5 = await cercaProdottiTest("CORN ETT O", mod);
  if (t5.length > 0) ok(`T5 e2e maiuscole "CORN ETT O" → ${t5.length} risultati`);
  else ko("T5 e2e maiuscole", "nessun risultato");

  // T6 accenti
  const t6 = await cercaProdottiTest("cornettò", mod);
  if (t6.length > 0) ok(`T6 e2e accento "cornettò" → ${t6.length} risultati`);
  else ko("T6 e2e accento", "nessun risultato");

  // T7 query con più parole
  const t7 = await cercaProdottiTest("cornetto crema", mod);
  if (t7.length > 0) ok(`T7 e2e multi-parola "cornetto crema" → ${t7.length} risultati`);
  else ko("T7 e2e multi-parola", "nessun risultato");
}

async function main() {
  loadEnv();

  let mod;
  try {
    mod = await importaModulo();
  } catch (e) {
    console.error("Impossibile importare lib/search-tollerante.ts:", e.message);
    console.error("Node >= 22.6 richiesto (type stripping).");
    process.exit(1);
  }

  await testUnit(mod);
  await testE2e(mod);

  console.log(`\n─────────────────────────────`);
  console.log(`Totale: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
