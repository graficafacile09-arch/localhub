/**
 * Test della RICERCA NORMALE (DB-only) di InCittà.
 *
 * Verifica la VERA implementazione del flusso homepage:
 *   query utente → lib/search-service.search() → cercaNegozi()/cercaProdotti()
 *   → Supabase → ranking tollerante (sinonimi, accenti, fuzzy).
 *
 * 1. ricerca esatta di un prodotto presente (dal DB reale)
 * 2. ricerca con errore di battitura (refuso → trovato comunque)
 * 3. ricerca negozio (esatta)
 * 4. ricerca categoria
 * 5. query senza risultati → vuota
 * 6. query vuota → vuota
 * 7. nessuna chiamata LLM durante la ricerca normale
 *    (guardia su fetch: qualunque chiamata a Groq/Gemini/OpenAI fa fallire il test)
 * 8. link corretti: /prodotto/{slug} e /negozio/{slug}
 *
 * Esecuzione: npx tsx scripts/test-ricerca-db-only.ts <service_role_key>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { search } from "../lib/search-service";

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
function ok(messaggio: string) {
  passati++;
  console.log(`  ✅ ${messaggio}`);
}
function ko(messaggio: string, dettaglio?: unknown) {
  falliti++;
  console.log(`  ❌ ${messaggio}`);
  if (dettaglio !== undefined) console.log(`     → ${JSON.stringify(dettaglio)}`);
}

// ─── Guardia anti-LLM ─────────────────────────────────────────────────────────
// Se durante una ricerca normale venisse chiamato qualunque LLM esterno
// (Groq/Gemini/OpenAI) il test fallisce subito con errore chiaro.
const LLM_URL = /api\.groq\.com|generativeai\.googleapis\.com|api\.openai\.com/i;
function attivaGuardiaAntiLLM() {
  const fetchOriginale = globalThis.fetch;
  let chiamateLLM = 0;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (LLM_URL.test(url)) {
      chiamateLLM++;
      throw new Error(
        `[test] CHIAMATA LLM BLOCCATA durante la ricerca normale: ${url}`
      );
    }
    return fetchOriginale(input as any, init as any);
  }) as typeof fetch;
  return {
    chiamateLLM: () => chiamateLLM,
    ripristina: () => {
      globalThis.fetch = fetchOriginale;
    },
  };
}

async function main() {
  const serviceKey = process.argv[2];
  if (!serviceKey) {
    console.error("Manca la service role key: npx tsx scripts/test-ricerca-db-only.ts <key>");
    process.exit(1);
  }
  loadEnv();
  // La ricerca usa il client admin (createAdminSupabaseClient) che legge
  // SUPABASE_SERVICE_ROLE_KEY dall'ambiente: la impostiamo con la chiave
  // reale passata da riga di comando (mai stampata).
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Attiva la guardia: blocca QUALSIASI LLM durante tutta la suite.
  const guardia = attivaGuardiaAntiLLM();

  // ── Dati reali di riferimento dal DB ──────────────────────────────────────
  // Prodotto demo REALE (nome pulito, non artefatto di test).
  const { data: prodottoReale } = await db
    .from("prodotti")
    .select("id, slug, nome, negozio_id, prezzo")
    .eq("attivo", true)
    .not("slug", "is", null)
    .not("nome", "ilike", "%Test Ordini%")
    .not("nome", "ilike", "Prodotto Test%")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const { data: negozioReale } = await db
    .from("negozi")
    .select("id, slug, nome, categoria")
    .eq("attivo", true)
    .is("deleted_at", null)
    .not("slug", "is", null)
    .limit(1)
    .single();

  if (!prodottoReale || !negozioReale) {
    console.error("Nessun prodotto/negozio reale disponibile per il test.");
    process.exit(1);
  }

  // ── 1. Ricerca esatta di un prodotto ──────────────────────────────────────
  console.log("\n── 1. Ricerca esatta prodotto ──");
  const r1 = await search(String(prodottoReale.nome));
  const trovato1 = r1.prodotti.some((p) => String(p.id) === String(prodottoReale.id));
  if (r1.prodotti.length > 0 && trovato1) {
    ok(`prodotto esatto trovato: "${prodottoReale.nome}" (${r1.prodotti.length} risultati)`);
  } else {
    ko("1 prodotto esatto", { nome: prodottoReale.nome, ids: r1.prodotti.map((p) => p.id) });
  }

  // ── 2. Ricerca con errore di battitura ────────────────────────────────────
  console.log("\n── 2. Ricerca con refuso ──");
  const nome = String(prodottoReale.nome).trim();
  // Refuso a 1 errore: doppia la terza lettera (es. "Serpente" → "Serrpente").
  const refuso =
    nome.length > 4
      ? nome.slice(0, 2) + nome[2] + nome.slice(2)
      : `${nome}x`;
  const r2 = await search(refuso);
  const trovato2 = r2.prodotti.some((p) => String(p.id) === String(prodottoReale.id));
  if (trovato2) {
    ok(`refuso "${refuso}" → prodotto "${nome}" trovato`);
  } else {
    ko("2 refuso", { refuso, ids: r2.prodotti.map((p) => p.id) });
  }

  // ── 3. Ricerca negozio ────────────────────────────────────────────────────
  console.log("\n── 3. Ricerca negozio ──");
  const r3 = await search(String(negozioReale.nome));
  const trovato3 = r3.negozi.some((n) => String(n.id) === String(negozioReale.id));
  if (r3.negozi.length > 0 && trovato3) {
    ok(`negozio esatto trovato: "${negozioReale.nome}" (${r3.negozi.length} risultati)`);
  } else {
    ko("3 negozio", { nome: negozioReale.nome, ids: r3.negozi.map((n) => n.id) });
  }

  // ── 4. Ricerca categoria ──────────────────────────────────────────────────
  console.log("\n── 4. Ricerca categoria ──");
  const categoria = String(negozioReale.categoria ?? "").trim();
  if (categoria) {
    const r4 = await search(categoria);
    if (r4.negozi.length > 0) {
      ok(`categoria "${categoria}" → ${r4.negozi.length} negozi trovati`);
    } else {
      ko("4 categoria", { categoria, negozi: r4.negozi.length });
    }
  } else {
    ok("4 categoria: negozio senza categoria, test saltato");
  }

  // ── 5. Query senza risultati ──────────────────────────────────────────────
  console.log("\n── 5. Query senza risultati ──");
  const r5 = await search("zzzzqqqxxxnonesiste");
  if (r5.prodotti.length === 0 && r5.negozi.length === 0) {
    ok("query senza risultati → nessun risultato inventato");
  } else {
    ko("5 senza risultati", { prodotti: r5.prodotti.length, negozi: r5.negozi.length });
  }

  // ── 6. Query vuota ────────────────────────────────────────────────────────
  console.log("\n── 6. Query vuota ──");
  const r6 = await search("   ");
  if (r6.prodotti.length === 0 && r6.negozi.length === 0 && r6.risposta === null) {
    ok("query vuota → vuota, nessuna chiamata");
  } else {
    ko("6 query vuota", r6);
  }

  // ── 7. Nessuna chiamata LLM (guardia attiva su tutta la suite) ────────────
  console.log("\n── 7. Nessuna chiamata LLM ──");
  if (guardia.chiamateLLM() === 0) {
    ok("zero chiamate a Groq/Gemini/OpenAI durante TUTTE le ricerche normali");
  } else {
    ko("7 chiamate LLM rilevate", { chiamateLLM: guardia.chiamateLLM() });
  }

  // ── 8. Link con slug ──────────────────────────────────────────────────────
  console.log("\n── 8. Link corretti con slug ──");
  const prodottoConSlug = r1.prodotti.find((p) => String(p.id) === String(prodottoReale.id));
  const negozioConSlug = r3.negozi.find((n) => String(n.id) === String(negozioReale.id));
  const linkProdotto = prodottoConSlug?.slug ? `/prodotto/${prodottoConSlug.slug}` : null;
  const linkNegozio = negozioConSlug?.slug ? `/negozio/${negozioConSlug.slug}` : null;
  if (linkProdotto && linkNegozio) {
    ok(`link prodotto: ${linkProdotto}`);
    ok(`link negozio: ${linkNegozio}`);
  } else {
    ko("8 link", { linkProdotto, linkNegozio });
  }

  guardia.ripristina();

  console.log(`\n─────────────────────────────`);
  console.log(`Totale: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
