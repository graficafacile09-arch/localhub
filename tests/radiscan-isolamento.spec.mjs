/**
 * RADICISCAN — ISOLAMENTO E COMPATIBILITÀ CON LA MIGRATION 2A
 *
 * Verifica che il nucleo RadiciScan:
 *  - non importi né dipenda dal percorso venditori;
 *  - non apra rete fuori dal proprio provider né tocchi il filesystem;
 *  - non contenga segreti;
 *  - rispetti i vincoli della migration 20261118 (livelli, limiti, chiavi,
 *    cache, snapshot, allineamento fonte).
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-isolamento.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const radice = (percorso) => fileURLToPath(new URL(`../${percorso}`, import.meta.url));
const CARTELLA = radice("lib/radiscan");
const SQL = readFileSync(radice("supabase/migrations/20261118_radiscan_core.sql"), "utf8");
const sqlNorm = SQL.replace(/\s+/g, " ");
const SQL_QUOTE = readFileSync(
  radice("supabase/migrations/20261125_radiscan_quote_collaudo.sql"),
  "utf8"
);
const sqlQuoteNorm = SQL_QUOTE.replace(/\s+/g, " ");

const radiscan = await import("@/lib/radiscan");
const { LIVELLI, LIMITI_QUOTA, TTL_CACHE_GIORNI, VERSIONE_PROMPT } = radiscan;

const FILES = readdirSync(CARTELLA)
  .filter((nome) => nome.endsWith(".ts"))
  .sort();

test("isolamento: elenco dei moduli RadiciScan", () => {
  assert.deepEqual(FILES, [
    "analisi.ts",
    "cache.ts",
    "errori.ts",
    "fonti.ts",
    "gemini.ts",
    "handler.ts",
    "identita.ts",
    "immagine.ts",
    "index.ts",
    "livelli.ts",
    "prompt.ts",
    "quote.ts",
    "repository.ts",
    "ricerca.ts",
    "richiesta.ts",
    "schema.ts",
    "tipi.ts",
    "verifica.ts",
  ]);
});

test("isolamento: nessun import dal percorso venditori o da infrastrutture condivise", () => {
  const vietati = [
    [/from\s+["'][^"']*product-assistant/, "product-assistant"],
    [/from\s+["'][^"']*(^|\/)scan-log/, "scan-log"],
    [/from\s+["'][^"']*rate-limiter/, "rate-limiter"],
    [/from\s+["'][^"']*components\/merchant/, "components/merchant"],
    [/from\s+["'][^"']*vision-core/, "vision-core"],
    [/from\s+["'][^"']*supabase/, "supabase"],
    [/from\s+["']next\//, "next/*"],
    [/from\s+["']node:(fs|child_process|http|https|net)["']/, "moduli di sistema sensibili"],
    [/from\s+["']sharp["']/, "sharp"],
  ];

  for (const nome of FILES) {
    const sorgente = readFileSync(`${CARTELLA}/${nome}`, "utf8");
    for (const [regola, etichetta] of vietati) {
      assert.ok(!regola.test(sorgente), `${nome} importa ${etichetta}`);
    }
    assert.ok(!/\brequire\s*\(/.test(sorgente), `${nome} usa require`);
    assert.ok(!/scritturaFile|writeFile|appendFile/.test(sorgente), `${nome} scrive su disco`);
    assert.ok(!/localStorage|sessionStorage/.test(sorgente), `${nome} usa storage`);
    assert.ok(!/AIza[0-9A-Za-z_-]{10,}/.test(sorgente), `${nome} contiene una chiave hardcoded`);
    assert.ok(!/\bconsole\./.test(sorgente), `${nome} scrive su console`);

    if (nome !== "gemini.ts" && nome !== "ricerca.ts") {
      assert.ok(!/\bfetch\s*\(/.test(sorgente), `${nome} apre una connessione di rete`);
    }
  }
});

test("isolamento: nessuna dipendenza dal parser Vision", () => {
  const schema = readFileSync(`${CARTELLA}/schema.ts`, "utf8");
  assert.ok(!schema.includes("parseVisionJson"), "schema.ts usa parseVisionJson");
  assert.ok(
    !/from\s+["'][^"']*vision-core/.test(schema),
    "schema.ts importa vision-core"
  );
});

test("isolamento: prompt dedicato, diverso da quello venditori", () => {
  assert.match(VERSIONE_PROMPT, /^radiscan-\d+\.\d+\.\d+$/);

  assert.ok(!/e-commerce|prezzo_suggerito|Negozio:|descrizioneCompleta/.test(radiscan.buildPromptRadiciScan()));
  assert.match(radiscan.buildPromptRadiciScan(), /non dichiarare mai/i);
  assert.match(radiscan.buildPromptRadiciScan(), /possibili incongruenze/i);
  assert.match(radiscan.buildPromptRadiciScan(), /denominazione_proposta/);
});

test("compatibilità 2A: livelli identici al vincolo del database", () => {
  const blocco = SQL.slice(
    SQL.indexOf("constraint radiscan_analisi_livello"),
    SQL.indexOf("constraint radiscan_analisi_esito_tecnico")
  );
  const livelliSql = [...blocco.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(livelliSql, [...LIVELLI].sort());
});

test("compatibilità 2A: RPC quota, modalità e limiti", () => {
  assert.ok(
    sqlQuoteNorm.includes(
      "create or replace function public.radiscan_consume_usage( p_chiave text, p_modalita text, p_etichetta text default 'analisi' )"
    ),
    "firma RPC (text, text, text) attesa"
  );
  assert.ok(
    sqlQuoteNorm.includes(
      "if v_modalita = 'anonimo' then v_limite_minuto := 10; v_limite_giorno := 100;"
    )
  );
  assert.ok(
    sqlQuoteNorm.includes(
      "elsif v_modalita = 'autenticato' then v_limite_minuto := 30; v_limite_giorno := 300;"
    )
  );

  assert.equal(LIMITI_QUOTA.anonimo.minuto, 10);
  assert.equal(LIMITI_QUOTA.anonimo.giorno, 100);
  assert.equal(LIMITI_QUOTA.autenticato.minuto, 30);
  assert.equal(LIMITI_QUOTA.autenticato.giorno, 300);
});

test("compatibilità 2A: chiave di quota tra 16 e 128 caratteri", () => {
  assert.ok(
    sqlNorm.includes("check (length(chiave) between 16 and 128)"),
    "vincolo di lunghezza chiave atteso"
  );
});

test("compatibilità 2A: cache 30 giorni con versione prompt nella chiave", () => {
  assert.equal(TTL_CACHE_GIORNI, 30);
  assert.ok(sqlNorm.includes("interval '30 days'"));
  assert.ok(sqlNorm.includes("primary key (impronta_immagine, versione_prompt)"));
  assert.ok(!sqlNorm.includes("interval '180 days'"));
});

test("compatibilità 2A: snapshot e allineamento fonte_id / esito.fonteId", () => {
  assert.ok(sqlNorm.includes("denominazione_verificata text"));
  assert.match(
    sqlNorm,
    /check \(\s*coalesce\(esito ->> 'fonteId', ''\) = coalesce\(fonte_id::text, ''\)\s*\)/,
    "allineamento esito.fonteId / fonte_id atteso"
  );
  assert.ok(sqlNorm.includes("on delete restrict"));

  const { componiEsito, verificaDenominazione } = radiscan;
  const fonte = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "demo",
    denominazione: "Pecorino Crotonese DOP",
    tipoAtto: "denominazione",
    schemaQualita: "DOP",
    territorio: "Provincia di Crotone",
    ente: "MASAF",
    urlUfficiale: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453",
    riferimentoNormativo: "Reg. (UE) 2024/1143",
    consultataIl: "2026-11-18",
    attiva: true,
  };
  const riconoscimento = {
    prodotto: "Pecorino",
    categoria: null,
    denominazioneProposta: "Pecorino Crotonese DOP",
    territorioProposto: "Provincia di Crotone",
    schemaProposto: "DOP",
    indicatoriEtichetta: [],
    confidenza: 80,
    note: null,
    incongruenzeRilevate: [],
  };
  const esito = componiEsito({
    riconoscimento,
    verifica: verificaDenominazione(riconoscimento, [fonte]),
    versionePrompt: VERSIONE_PROMPT,
  });

  assert.equal(esito.livello, "verificato");
  assert.equal(esito.fonteId, fonte.id, "fonteId è l'uuid, non lo slug");
  assert.equal(esito.denominazioneVerificata, fonte.denominazione);
  const json = JSON.parse(JSON.stringify(esito));
  assert.equal(json.fonteId, fonte.id, "esito.fonteId uguale alla colonna fonte_id");
});

test("compatibilità 2A: il predicato di documentabilità replica i controlli SQL", () => {
  for (const frammento of [
    "f.tipo_atto = 'denominazione'",
    "and f.attiva",
    "length(btrim(f.territorio)) > 0",
    "f.schema_qualita is not null",
    "f.url_ufficiale ~ '^https://",
    "length(btrim(f.riferimento_normativo)) > 3",
    "and f.consultata_il is not null",
  ]) {
    assert.ok(
      SQL.replace(/\s+/g, " ").includes(frammento.replace(/\s+/g, " ")),
      `controllo mancante nel database: ${frammento}`
    );
  }
});

test("compatibilità 2A: nessun riferimento a oggetti venditori nella migration", () => {
  const codice = SQL.split(/\r?\n/)
    .filter((riga) => !riga.trimStart().startsWith("--"))
    .join("\n");
  for (const vietato of [
    "scan_log",
    "product_vision_cache",
    "consume_rate_limit",
    "consume_merchant_monthly_scan",
  ]) {
    assert.ok(!codice.includes(vietato), `la migration 2A cita ${vietato}`);
  }
});
