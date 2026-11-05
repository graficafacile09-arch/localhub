import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PINO_TEST_MODE_VAR,
  modalitaTestPinoAttiva,
  valutaModalitaTestPino,
} from "../lib/assistente/modalita-test.ts";
import { recuperaMemoria, registraEsitoMemoria } from "../lib/assistente/memoria.ts";
import { checkRateLimit } from "../lib/rate-limiter.ts";
import {
  SHADOW_TIER0_ABILITATO,
  shadowTier0Attivo,
} from "../lib/assistente/shadow/tier0.ts";

// ─── Fase 3 — Modalità di collaudo locale ──────────────────────────────────
//
// `tests/support/hook-pino.mjs` sostituisce i client Supabase con un finto che
// registra le chiamate: qui si osserva il comportamento REALE dei guard, senza
// rete, senza credenziali e senza toccare Supabase.

const sorgente = (percorso) =>
  readFileSync(join(process.cwd(), percorso), "utf8").replace(/\r\n/g, "\n");

const VARIABILI_GESTITE = [
  PINO_TEST_MODE_VAR,
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_TARGET_ENV",
  "RATE_LIMIT_PER_MINUTE",
  "RATE_LIMIT_PER_HOUR",
];

const spia = () => globalThis.__pinoSpiaSupabase;

function azzeraSpia() {
  const s = spia();
  if (!s) return;
  s.clientCreati = 0;
  s.rpc.length = 0;
  s.tabelle.length = 0;
  s.selezioni.length = 0;
  s.upsert.length = 0;
  s.altri.length = 0;
}

async function conAmbiente(variabili, fn) {
  const salvate = new Map(VARIABILI_GESTITE.map((chiave) => [chiave, process.env[chiave]]));
  try {
    for (const chiave of VARIABILI_GESTITE) delete process.env[chiave];
    for (const [chiave, valore] of Object.entries(variabili)) {
      process.env[chiave] = valore;
    }
    return await fn();
  } finally {
    for (const [chiave, valore] of salvate) {
      if (valore === undefined) delete process.env[chiave];
      else process.env[chiave] = valore;
    }
  }
}

const parametriMemoria = () => ({
  query: "pasta",
  analisi: { segnali: [], terminiPrioritari: ["pasta"] },
  categorie: ["alimentari"],
  risultati: 3,
});

const limiteCondiviso = () => ({
  perMinute: 20,
  perHour: 120,
  reasonLabel: "messaggi",
  useSharedCounter: true,
});

// ─── Interruttore e protezione Production ──────────────────────────────────

test("default: modalità test spenta senza PINO_TEST_MODE", () => {
  assert.equal(valutaModalitaTestPino({}).attiva, false);
  assert.equal(valutaModalitaTestPino({}).motivo, "interruttore_assente");
  assert.equal(valutaModalitaTestPino({ PINO_TEST_MODE: "on" }).attiva, false);
  assert.equal(valutaModalitaTestPino({ PINO_TEST_MODE: "true" }).attiva, false);
  assert.equal(valutaModalitaTestPino({ PINO_TEST_MODE: "0" }).attiva, false);
  assert.equal(valutaModalitaTestPino({ PINO_TEST_MODE: "1 " }).attiva, false);
});

test("locale: attiva solo con PINO_TEST_MODE=1 e NODE_ENV locale", () => {
  const base = { [PINO_TEST_MODE_VAR]: "1", NODE_ENV: "development" };
  assert.deepEqual(valutaModalitaTestPino(base), { attiva: true, motivo: "attiva" });
  assert.equal(
    valutaModalitaTestPino({ ...base, NODE_ENV: "test" }).attiva,
    true
  );
  assert.equal(modalitaTestPinoAttiva(base), true);
});

test("Production Vercel: modalità test negata", () => {
  const base = { [PINO_TEST_MODE_VAR]: "1", NODE_ENV: "development" };
  for (const env of [
    { ...base, VERCEL_ENV: "production" },
    { ...base, VERCEL_TARGET_ENV: "production" },
    { ...base, VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production" },
    { ...base, VERCEL_ENV: " Production " },
  ]) {
    const esito = valutaModalitaTestPino(env);
    assert.equal(esito.attiva, false);
    assert.equal(esito.motivo, "produzione_vercel");
  }
});

test("runtime Vercel non-production e NODE_ENV=production: negata", () => {
  const base = { [PINO_TEST_MODE_VAR]: "1", NODE_ENV: "development" };
  const preview = valutaModalitaTestPino({ ...base, VERCEL_ENV: "preview" });
  assert.equal(preview.attiva, false);
  assert.equal(preview.motivo, "runtime_vercel");

  const senzaTarget = valutaModalitaTestPino({ ...base, VERCEL: "1" });
  assert.equal(senzaTarget.attiva, false);
  assert.equal(senzaTarget.motivo, "runtime_vercel");

  const build = valutaModalitaTestPino({ [PINO_TEST_MODE_VAR]: "1", NODE_ENV: "production" });
  assert.equal(build.attiva, false);
  assert.equal(build.motivo, "produzione_node");
});

test("ambiente non identificabile: modalità test negata (fail closed)", () => {
  for (const nodeEnv of [undefined, "", "staging", "preview", "ci"]) {
    const esito = valutaModalitaTestPino({
      [PINO_TEST_MODE_VAR]: "1",
      ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
    });
    assert.equal(esito.attiva, false, String(nodeEnv));
    assert.equal(esito.motivo, "ambiente_non_identificabile", String(nodeEnv));
  }
});

// ─── Memoria: upsert eseguito solo fuori dalla modalità test ───────────────

test("Fase 3 — comportamenti con client Supabase finto", async (t) => {
  // I test qui sotto condividono spy e process.env: vanno eseguiti in sequenza.
  await t.test("modalità test: nessun client, nessun upsert su pino_memoria", async () => {
  await conAmbiente({ PINO_TEST_MODE: "1", NODE_ENV: "development" }, async () => {
    azzeraSpia();
    const log = [];
    const infoOriginale = console.info;
    console.info = (...args) => log.push(args.join(" "));
    try {
      await registraEsitoMemoria(parametriMemoria());
    } finally {
      console.info = infoOriginale;
    }

    const s = spia();
    assert.equal(s.clientCreati, 0);
    assert.equal(s.tabelle.length, 0);
    assert.equal(s.upsert.length, 0);
    assert.equal(s.altri.length, 0);
    assert.equal(log.length, 1);
    assert.equal(/pasta|alimentari/.test(log.join(" ")), false);
  });
});

  await t.test("modalità normale: l'upsert preesistente resta invariato", async () => {
  await conAmbiente({ NODE_ENV: "development" }, async () => {
    azzeraSpia();
    await registraEsitoMemoria(parametriMemoria());

    const s = spia();
    assert.equal(s.clientCreati, 1);
    // Due accessi alla tabella: prima la SELECT degli esistenti, poi l'upsert.
    assert.deepEqual(s.tabelle, ["pino_memoria", "pino_memoria"]);
    assert.equal(s.upsert.length, 1);
    assert.equal(s.upsert[0].valori.termine, "pasta");
    assert.equal(s.upsert[0].valori.concetto, "alimentari");
    assert.equal(s.upsert[0].opzioni.onConflict, "termine,concetto");
    assert.deepEqual(s.altri, []);
  });
});

  await t.test("Production: modalità negata e scritture ordinarie ancora attive", async () => {
  await conAmbiente(
    { PINO_TEST_MODE: "1", NODE_ENV: "production", VERCEL_ENV: "production" },
    async () => {
      azzeraSpia();
      await registraEsitoMemoria(parametriMemoria());
      assert.equal(spia().upsert.length, 1);
    }
  );
});

  await t.test("le letture del catalogo restano disponibili in modalità test", async () => {
  await conAmbiente({ PINO_TEST_MODE: "1", NODE_ENV: "development" }, async () => {
    azzeraSpia();
    const voci = await recuperaMemoria("pasta");
    assert.deepEqual(voci, []);

    const s = spia();
    assert.equal(s.clientCreati, 1);
    assert.deepEqual(s.tabelle, ["pino_memoria"]);
    assert.equal(s.selezioni.length, 1);
    assert.equal(s.upsert.length, 0);
    assert.deepEqual(s.altri, []);
  });
});

// ─── Rate limiter: RPC solo fuori dalla modalità test ──────────────────────

  await t.test("modalità test: consume_rate_limit non viene mai invocata", async () => {
  await conAmbiente({ PINO_TEST_MODE: "1", NODE_ENV: "development" }, async () => {
    azzeraSpia();
    const esito = await checkRateLimit("assistente:203.0.113.7", limiteCondiviso());

    assert.deepEqual(esito, { allowed: true });
    const s = spia();
    assert.equal(s.clientCreati, 0);
    assert.equal(s.rpc.length, 0);
  });
});

  await t.test("modalità normale: la RPC consume_rate_limit resta invariata", async () => {
  await conAmbiente({ NODE_ENV: "development" }, async () => {
    azzeraSpia();
    const esito = await checkRateLimit("assistente:203.0.113.7", limiteCondiviso());

    assert.deepEqual(esito, { allowed: true });
    const s = spia();
    assert.equal(s.rpc.length, 1);
    assert.equal(s.rpc[0].nome, "consume_rate_limit");
    assert.equal(s.rpc[0].parametri.p_key, "assistente:203.0.113.7");
  });
});

  await t.test("Production o ambiente ignoto: la RPC resta attiva (nessuna esclusione)", async () => {
  for (const env of [
    { PINO_TEST_MODE: "1", NODE_ENV: "production", VERCEL_ENV: "production" },
    { PINO_TEST_MODE: "1", NODE_ENV: "staging" },
    { PINO_TEST_MODE: "1" },
  ]) {
    await conAmbiente(env, async () => {
      azzeraSpia();
      await checkRateLimit("assistente:203.0.113.7", limiteCondiviso());
      assert.equal(spia().rpc.length, 1, JSON.stringify(env));
    });
  }
});

  await t.test("il guard del rate limiter non tocca le soglie degli ordini", async () => {
  await conAmbiente({ PINO_TEST_MODE: "1", NODE_ENV: "development" }, async () => {
    azzeraSpia();
    await checkRateLimit("203.0.113.7", {
      subject: "ordini",
      useAdminClient: true,
      perMinute: 6,
      perHour: 40,
    });
    // Percorso storico: solo letture di conteggio, nessuna RPC.
    assert.equal(spia().rpc.length, 0);
    assert.equal(spia().upsert.length, 0);
  });
});

});

// ─── Shadow: OFF di default, ON solo con entrambi gli interruttori ─────────

test("Shadow: spenta di default, accesa solo con i due interruttori", () => {
  assert.equal(SHADOW_TIER0_ABILITATO, true);
  assert.equal(shadowTier0Attivo({}), false);
  assert.equal(shadowTier0Attivo({ PINO_SHADOW_MODE: "off" }), false);
  assert.equal(shadowTier0Attivo({ PINO_SHADOW_MODE: "on" }), true);
});

// ─── Nessuna scrittura nascosta nei percorsi Pino ──────────────────────────

test("nessuna scrittura DB nei percorsi Pino oltre ai due guard", () => {
  const fileSoloLettura = [
    "lib/assistente/index.ts",
    "lib/assistente/tools.ts",
    "lib/assistente/semantica.ts",
    "lib/assistente/conversazione.ts",
    "lib/assistente/shadow/tier0.ts",
    "lib/assistente/shadow/integrazione.ts",
    "app/api/assistente/route.ts",
  ];

  for (const file of fileSoloLettura) {
    const src = sorgente(file);
    for (const scrittura of [".insert(", ".update(", ".upsert(", ".rpc(", ".delete("]) {
      if (file === "lib/assistente/shadow/integrazione.ts" && scrittura === ".delete(") {
        // WeakMap.delete, non un DELETE SQL.
        assert.equal(src.includes('from("'), false, file);
        continue;
      }
      assert.equal(src.includes(scrittura), false, `${file}: ${scrittura}`);
    }
  }

  // `tools.ts` usa il client admin solo per SELECT di catalogo/orari.
  assert.equal(sorgente("lib/assistente/tools.ts").includes(".from(\"negozi\")"), true);

  const memoria = sorgente("lib/assistente/memoria.ts");
  assert.equal((memoria.match(/\.upsert\(/g) ?? []).length, 1);
  for (const scrittura of [".insert(", ".update(", ".delete(", ".rpc("]) {
    assert.equal(memoria.includes(scrittura), false, `memoria.ts: ${scrittura}`);
  }

  const limiter = sorgente("lib/rate-limiter.ts");
  assert.equal((limiter.match(/\.rpc\(/g) ?? []).length, 1);
  assert.equal(limiter.includes("consume_rate_limit"), true);
});

test("i guard precedono le rispettive scritture", () => {
  const memoria = sorgente("lib/assistente/memoria.ts");
  const inizioMemoria = memoria.indexOf("export async function registraEsitoMemoria");
  const guardiaMemoria = memoria.indexOf("modalitaTestPinoAttiva()", inizioMemoria);
  const upsert = memoria.indexOf(".upsert(", inizioMemoria);
  assert.ok(inizioMemoria >= 0);
  assert.ok(guardiaMemoria > inizioMemoria);
  assert.ok(upsert > guardiaMemoria);
  // Un solo guard: recuperaMemoria resta una lettura sempre disponibile.
  assert.equal((memoria.match(/modalitaTestPinoAttiva\(\)/g) ?? []).length, 1);

  const limiter = sorgente("lib/rate-limiter.ts");
  const guardiaLimiter = limiter.indexOf("modalitaTestPinoAttiva()");
  const rpc = limiter.indexOf('admin.rpc("consume_rate_limit"');
  assert.ok(guardiaLimiter > 0);
  assert.ok(guardiaLimiter < rpc);
});

test("la modalità test non altera la risposta né il kill switch della Shadow", () => {
  const route = sorgente("app/api/assistente/route.ts");
  assert.equal(route.includes("PINO_TEST_MODE"), false);
  assert.ok(route.includes('return NextResponse.json({\n      ...risultato,'));

  const index = sorgente("lib/assistente/index.ts");
  assert.equal(index.includes("PINO_TEST_MODE"), false);
  assert.equal(index.includes("modalitaTestPinoAttiva"), false);
});

test("le letture di catalogo usate da Pino non scrivono", () => {
  const corpo = (src, nome) => {
    const inizio = src.indexOf(`export async function ${nome}(`);
    assert.ok(inizio >= 0, nome);
    const prossimo = src.indexOf("\nexport ", inizio + 1);
    return src.slice(inizio, prossimo > 0 ? prossimo : undefined);
  };

  const negozi = sorgente("lib/negozi.ts");
  for (const nome of ["getCategorieConNegozi", "cercaNegozi", "cercaNegoziLegacy"]) {
    const body = corpo(negozi, nome);
    for (const scrittura of [".insert(", ".update(", ".upsert(", ".delete(", "assicuraSlugNegozio("]) {
      assert.equal(body.includes(scrittura), false, `${nome}: ${scrittura}`);
    }
  }

  // L'unica scrittura su `negozi` (slug mancante) resta fuori dai percorsi
  // Pino: `risolviNegozioPubblico` e `getCategoriaShowcase` non sono usati.
  assert.equal((negozi.match(/await assicuraSlugNegozio\(/g) ?? []).length, 2);

  const offerte = corpo(sorgente("lib/offerte.ts"), "getOffertePubbliche");
  const eventi = corpo(sorgente("lib/eventi.ts"), "getEventiPubblici");
  for (const [nome, body] of [
    ["getOffertePubbliche", offerte],
    ["getEventiPubblici", eventi],
  ]) {
    for (const scrittura of [".insert(", ".update(", ".upsert(", ".delete("]) {
      assert.equal(body.includes(scrittura), false, `${nome}: ${scrittura}`);
    }
  }

  for (const [file, nome] of [
    ["lib/search-service.ts", "search"],
    ["lib/farmacie-turno.ts", "getFarmacieTurnoCastrovillari"],
  ]) {
    const body = corpo(sorgente(file), nome);
    for (const scrittura of [".insert(", ".update(", ".upsert(", ".delete("]) {
      assert.equal(body.includes(scrittura), false, `${file}#${nome}: ${scrittura}`);
    }
  }
});

test("test:pino include la nuova suite e il loader dei test", () => {
  const pkg = JSON.parse(sorgente("package.json"));
  const script = pkg.scripts["test:pino"];

  assert.ok(script.includes("tests/pino-modalita-test.test.mjs"));
  assert.ok(script.includes("--import ./tests/support/hook-pino.mjs"));
  assert.ok(script.includes("tests/pino-shadow-tier0.test.mjs"));
});
