import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_MS_TIER0,
  SHADOW_TIER0_ABILITATO,
  eseguiTier0Shadow,
  serializzaReportTier0,
  shadowTier0Attivo,
  valutaTier0Shadow,
} from "../lib/assistente/shadow/tier0.ts";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";
import {
  creaOsservazioneTier0,
  prendiOsservazioneTier0,
} from "../lib/assistente/shadow/integrazione.ts";

// ─── Shadow Adapter Tier 0 — modulo isolato ────────────────────────────────
//
// Il modulo non è collegato al runtime: questi test verificano i confini di
// sicurezza e la logica di osservazione, senza Gemini, Supabase o rete.

const sorgente = (percorso) =>
  readFileSync(join(process.cwd(), percorso), "utf8").replace(/\r\n/g, "\n");

/**
 * Dipendenze di produzione simulate: la logica di prezzo NON è duplicata qui.
 * `estraiPrezzo` restituisce i limiti dichiarati dal test e `rispettaBudget`
 * legge un esito esplicito per prodotto, così si verifica il cablaggio e la
 * classificazione del modulo, non una seconda implementazione del budget.
 */
const dipendenze = (limitiProduzione = { minPrice: null, maxPrice: null }) => ({
  estraiPrezzo: () => limitiProduzione,
  rispettaBudget: (prodotto) => prodotto?.conforme === true,
  prezzoNumerico: (valore) =>
    typeof valore === "number" && Number.isFinite(valore) ? valore : null,
  pianifica: planPinoCoreRequest,
});

const attivo = { PINO_SHADOW_MODE: "on" };

test("il modulo importa solo il planner deterministico", () => {
  const src = sorgente("lib/assistente/shadow/tier0.ts");
  const specificatori = [...src.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(specificatori, ["../core-v2/request-planner.ts"]);

  for (const vietato of [
    /@google\/genai/,
    /\bcallGeminiText\s*\(/,
    /\bcreateClient\s*\(/,
    /\bfetch\s*\(/,
    /\baxios\b/,
    /node:fs/,
    /node:http/,
    /node:https/,
    /\bscoreProductEvidence\s*\(/,
    /\brankProductEvidence\s*\(/,
    /product-evidence-ranker/,
  ]) {
    assert.equal(vietato.test(src), false, String(vietato));
  }
});

test("il modulo è sincrono: nessuna promise, timer o retry", () => {
  // Il controllo vale sul codice, non sui commenti che descrivono i divieti.
  const codice = sorgente("lib/assistente/shadow/tier0.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const vietato of [/\basync\b/, /\bawait\b/, /\bPromise\b/, /\bsetTimeout\s*\(/, /\bsetInterval\s*\(/, /\bretry\b/i]) {
    assert.equal(vietato.test(codice), false, String(vietato));
  }
});

test("le dipendenze transitive del planner non toccano rete o provider", () => {
  for (const file of [
    "lib/assistente/core-v2/request-planner.ts",
    "lib/assistente/understanding.ts",
    "lib/assistente/routing-policy.ts",
  ]) {
    const src = sorgente(file);
    for (const vietato of ["callGeminiText(", "createClient(", "supabase", "fetch(", "@google/genai"]) {
      assert.equal(src.includes(vietato), false, `${file}: ${vietato}`);
    }
  }
});

test("kill switch: default OFF e nessuna elaborazione", () => {
  assert.equal(SHADOW_TIER0_ABILITATO, true);
  assert.equal(shadowTier0Attivo({}), false);
  assert.equal(shadowTier0Attivo({ PINO_SHADOW_MODE: "off" }), false);
  assert.equal(shadowTier0Attivo({ PINO_SHADOW_MODE: "1" }), false);
  assert.equal(shadowTier0Attivo({ PINO_SHADOW_MODE: "on" }), true);

  let chiamatePlanner = 0;
  const deps = {
    ...dipendenze(),
    pianifica: (testo) => {
      chiamatePlanner += 1;
      return planPinoCoreRequest(testo);
    },
  };
  const esito = eseguiTier0Shadow(
    { messaggio: "Cerco pasta sotto 5 euro" },
    deps,
    {}
  );
  assert.equal(esito, null);
  assert.equal(chiamatePlanner, 0);
});

test("piano Core V2 e limiti nativi sono registrati senza correzioni", () => {
  const report = eseguiTier0Shadow(
    {
      messaggio: "Cerco pasta sotto 5 euro",
      prodotti: [],
      negoziRestituiti: 0,
      motivoUscita: "ricerca_completa",
      invocazioni: ["searchProducts"],
      limitiProduzione: { minPrice: null, maxPrice: 5 },
      origineLimitiProduzione: "traccia",
    },
    dipendenze({ minPrice: null, maxPrice: 5 }),
    attivo
  );

  assert.ok(report);
  assert.equal(report.piano.route, "catalog");
  assert.equal(report.piano.surface, "products");
  assert.equal(report.piano.limitiNativi.maxPrice, 5);
  assert.equal(report.produzione.limiti.maxPrice, 5);
  assert.equal(report.produzione.origine, "traccia");
  assert.equal(report.divergenza.presente, false);
  assert.equal(report.uscita.motivo, "ricerca_completa");
  assert.deepEqual(report.uscita.invocazioni, ["searchProducts"]);
  assert.equal(report.budget.applicabile, true);
});

test("divergenza: 'fino a 30' è assente in Core V2 ma presente in produzione", () => {
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta fino a 30 euro",
      limitiProduzione: { minPrice: null, maxPrice: 30 },
    },
    dipendenze({ minPrice: null, maxPrice: 30 })
  );

  assert.equal(report.piano.limitiNativi.maxPrice, null);
  assert.equal(report.produzione.limiti.maxPrice, 30);
  assert.equal(report.divergenza.presente, true);
  assert.ok(report.divergenza.tipi.includes("solo_produzione"));
  assert.ok(report.divergenza.tipi.includes("max_diverso"));
});

test("divergenza: '€50' resta fuori dal planner Core V2", () => {
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta €50",
      limitiProduzione: { minPrice: null, maxPrice: 50 },
    },
    dipendenze({ minPrice: null, maxPrice: 50 })
  );

  assert.equal(report.piano.limitiNativi.maxPrice, null);
  assert.ok(report.divergenza.tipi.includes("solo_produzione"));
});

test("divergenza: 'sotto 0 euro' produce maxPrice 0 solo in Core V2", () => {
  const report = valutaTier0Shadow(
    { messaggio: "Cerco pasta sotto 0 euro", limitiProduzione: null },
    dipendenze()
  );

  assert.equal(report.piano.limitiNativi.maxPrice, 0);
  assert.equal(report.produzione.limiti, null);
  assert.ok(report.divergenza.tipi.includes("zero_nativo"));
  assert.ok(report.divergenza.tipi.includes("solo_core_v2"));
});

test("divergenza: limiti nativi presenti e produzione assente", () => {
  const report = valutaTier0Shadow(
    { messaggio: "Cerco pasta sotto 5 euro", limitiProduzione: null },
    dipendenze()
  );

  assert.equal(report.piano.limitiNativi.maxPrice, 5);
  assert.ok(report.divergenza.tipi.includes("solo_core_v2"));
  assert.equal(report.divergenza.tipi.includes("max_diverso"), false);
});

test("classificazione dei prezzi realmente restituiti", () => {
  const prodotti = [
    { id: "p1", prezzo: 49.99, conforme: true },
    { id: "p2", prezzo: 50, conforme: true },
    { id: "p3", prezzo: 50.01, conforme: false },
    { id: "p4", prezzo: null },
    { id: "p5", prezzo: 0 },
    { id: "p6", prezzo: -5 },
  ];
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta sotto 50 euro",
      prodotti,
      negoziRestituiti: 2,
      limitiProduzione: { minPrice: null, maxPrice: 50 },
    },
    dipendenze({ minPrice: null, maxPrice: 50 })
  );

  assert.equal(report.budget.applicabile, true);
  assert.equal(report.budget.prodottiValutati, 6);
  assert.equal(report.budget.conformi, 2);
  assert.equal(report.budget.fuoriBudget, 1);
  assert.equal(report.budget.senzaPrezzo, 1);
  assert.equal(report.budget.prezzoNonPositivo, 2);
  assert.equal(report.budget.nonVerificabili, 0);
  assert.deepEqual(report.budget.idFuoriBudget, ["p3"]);
  assert.deepEqual(report.budget.idSenzaPrezzo, ["p4"]);
});

test("senza limiti di produzione i prezzi validi non sono dichiarati conformi", () => {
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta",
      prodotti: [{ id: "p1", prezzo: 10, conforme: true }],
      limitiProduzione: null,
    },
    dipendenze()
  );

  assert.equal(report.budget.applicabile, false);
  assert.equal(report.budget.conformi, 0);
  assert.equal(report.budget.nonVerificabili, 1);
});

test(`tetto di lavoro: oltre ${MAX_MS_TIER0} ms si registra skip senza retry`, () => {
  let chiamate = 0;
  const ora = () => (chiamate++ === 0 ? 0 : 100);
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta sotto 5 euro",
      prodotti: [{ id: "p1", prezzo: 1, conforme: true }],
      limitiProduzione: { minPrice: null, maxPrice: 5 },
    },
    { ...dipendenze({ minPrice: null, maxPrice: 5 }), ora }
  );

  assert.equal(report.skip, "tempo_massimo");
  assert.equal(report.budget.prodottiValutati, 0);
  assert.ok(report.durataMs >= MAX_MS_TIER0);
});

test("nessuna chiamata di rete durante la valutazione", () => {
  const originale = globalThis.fetch;
  let chiamateRete = 0;
  globalThis.fetch = () => {
    chiamateRete += 1;
    throw new Error("rete vietata nella Shadow");
  };

  try {
    const report = eseguiTier0Shadow(
      {
        messaggio: "Cerco pasta sotto 5 euro",
        prodotti: [{ id: "p1", prezzo: 3, conforme: true }],
        limitiProduzione: { minPrice: null, maxPrice: 5 },
      },
      dipendenze({ minPrice: null, maxPrice: 5 }),
      attivo
    );
    assert.ok(report);
  } finally {
    globalThis.fetch = originale;
  }

  assert.equal(chiamateRete, 0);
});

test("sanificazione: nessun testo utente o campo vietato nel log", () => {
  const report = eseguiTier0Shadow(
    {
      messaggio: "Cerco un regalo segreto per Mario",
      richiestaId: "../../segreto",
      prodotti: [{ id: "p1", prezzo: 10, conforme: true }],
      negoziRestituiti: 1,
      motivoUscita: "ricerca_completa",
      invocazioni: ["searchProducts", "../segreto"],
      limitiProduzione: { minPrice: null, maxPrice: 50 },
    },
    dipendenze({ minPrice: null, maxPrice: 50 }),
    attivo
  );

  const json = serializzaReportTier0(report);
  assert.equal(/segreto|mario|regalo/i.test(json), false);
  for (const chiave of [
    "original",
    "query",
    "subject",
    "attributes",
    "exclusions",
    "risposta",
    "cookie",
    "sessionId",
    "header",
    "ip",
  ]) {
    assert.equal(json.includes(`"${chiave}"`), false, chiave);
  }
});

test("il serializzatore applica una allowlist e ignora campi aggiunti", () => {
  const base = valutaTier0Shadow(
    { messaggio: "Cerco pasta sotto 5 euro", limitiProduzione: { minPrice: null, maxPrice: 5 } },
    dipendenze({ minPrice: null, maxPrice: 5 })
  );
  const json = serializzaReportTier0({
    ...base,
    messaggio: "TESTO_UTENTE",
    risposta: "RISPOSTA",
    cookie: "COOKIE",
  });

  assert.equal(/TESTO_UTENTE|RISPOSTA|COOKIE/.test(json), false);
  assert.deepEqual(Object.keys(JSON.parse(json)), [
    "v",
    "richiestaId",
    "timestamp",
    "durataMs",
    "eseguito",
    "skip",
    "piano",
    "produzione",
    "divergenza",
    "uscita",
    "confronto",
    "budget",
  ]);
});

test("il limite nativo 0 non viene perso nella serializzazione", () => {
  const report = valutaTier0Shadow(
    { messaggio: "Cerco pasta sotto 0 euro", limitiProduzione: null },
    dipendenze()
  );
  const json = JSON.parse(serializzaReportTier0(report));

  assert.equal(json.piano.limitiNativi.maxPrice, 0);
  assert.ok(json.divergenza.tipi.includes("zero_nativo"));
});

test("il planner Core V2 non importa la Shadow (nessun ciclo)", () => {
  const src = sorgente("lib/assistente/core-v2/request-planner.ts");
  assert.equal(src.includes("shadow"), false);
});

// ─── B1 — contratto dei limiti di produzione ───────────────────────────────

test("B1: limitiProduzione undefined usa l'estrattore di produzione", () => {
  const chiamate = [];
  const report = valutaTier0Shadow(
    { messaggio: "Cerco pasta fino a 30 euro" },
    {
      ...dipendenze(),
      estraiPrezzo: (testo) => {
        chiamate.push(testo);
        return { minPrice: null, maxPrice: 30 };
      },
    }
  );

  assert.deepEqual(chiamate, ["Cerco pasta fino a 30 euro"]);
  assert.equal(report.produzione.limiti.maxPrice, 30);
  assert.equal(report.produzione.origine, "testo");
  assert.equal(report.budget.applicabile, true);
  assert.ok(report.divergenza.tipi.includes("solo_produzione"));
});

test("B1: limitiProduzione null significa produzione senza limiti", () => {
  let chiamate = 0;
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta",
      prodotti: [{ id: "p1", prezzo: 10, conforme: true }],
      limitiProduzione: null,
    },
    {
      ...dipendenze(),
      estraiPrezzo: () => {
        chiamate += 1;
        return { minPrice: null, maxPrice: 5 };
      },
    }
  );

  assert.equal(chiamate, 0);
  assert.equal(report.produzione.limiti, null);
  assert.equal(report.produzione.origine, "assente");
  assert.equal(report.budget.applicabile, false);
  assert.equal(report.budget.nonVerificabili, 1);
});

test("B1: limitiProduzione espliciti non interrogano l'estrattore", () => {
  let chiamate = 0;
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta",
      limitiProduzione: { minPrice: 5, maxPrice: 12 },
      origineLimitiProduzione: "traccia",
    },
    {
      ...dipendenze(),
      estraiPrezzo: () => {
        chiamate += 1;
        return { minPrice: null, maxPrice: 30 };
      },
    }
  );

  assert.equal(chiamate, 0);
  assert.deepEqual(report.produzione.limiti, { minPrice: 5, maxPrice: 12 });
  assert.equal(report.produzione.origine, "traccia");
});

// ─── B2 — isolamento delle eccezioni nel futuro wrapper ────────────────────

test("B2: il modulo non simula la protezione, il wrapper la garantisce", () => {
  const rispostaServita = { risposta: "ok", prodotti: [] };
  const base = dipendenze({ minPrice: null, maxPrice: 5 });
  const input = {
    messaggio: "Cerco pasta sotto 5 euro",
    prodotti: [{ id: "p1", prezzo: 1, conforme: true }],
    limitiProduzione: { minPrice: null, maxPrice: 5 },
  };

  // Simula il wrapper di Fase 2: la Shadow non può degradare la risposta.
  const osserva = (deps, valore = input) => {
    try {
      const report = eseguiTier0Shadow(valore, deps, attivo);
      if (report) serializzaReportTier0(report);
    } catch {
      // atteso: l'errore resta confinato all'osservazione
    }
    return rispostaServita;
  };

  const casi = [
    { ...base, pianifica: () => { throw new Error("planner"); } },
    { ...base, rispettaBudget: () => { throw new Error("budget"); } },
    { ...base, prezzoNumerico: () => { throw new Error("prezzo"); } },
  ];

  for (const deps of casi) {
    assert.throws(() => eseguiTier0Shadow(input, deps, attivo));
    assert.deepEqual(osserva(deps), rispostaServita);
  }

  const senzaLimiti = { messaggio: "Cerco pasta sotto 5 euro" };
  const depsEstrattore = {
    ...base,
    estraiPrezzo: () => { throw new Error("estraiPrezzo"); },
  };
  assert.throws(() => eseguiTier0Shadow(senzaLimiti, depsEstrattore, attivo));
  assert.deepEqual(osserva(depsEstrattore, senzaLimiti), rispostaServita);
});

// ─── N2/N3 — etichette e origine validate ──────────────────────────────────

test("N2/N3: route, surface, confidence e origine non ammettono testo libero", () => {
  const piano = planPinoCoreRequest("Cerco pasta");
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta",
      limitiProduzione: { minPrice: null, maxPrice: 9 },
      origineLimitiProduzione: "Mario segreto",
    },
    {
      ...dipendenze({ minPrice: null, maxPrice: 9 }),
      pianifica: () => ({ ...piano, route: "Mario segreto", surface: "x".repeat(40), confidence: "High" }),
    }
  );

  assert.equal(report.piano.route, "unknown");
  assert.equal(report.piano.surface, "none");
  assert.equal(report.piano.confidence, "low");
  assert.equal(report.produzione.origine, "non_dichiarata");

  const json = serializzaReportTier0({
    ...report,
    piano: { ...report.piano, route: "TESTO UTENTE", surface: "y".repeat(80), confidence: "ALTA" },
    produzione: { ...report.produzione, origine: "Mario segreto" },
  });
  assert.equal(/Mario|segreto|TESTO UTENTE|yyyy/.test(json), false);
  assert.equal(JSON.parse(json).piano.route, "unknown");
  assert.equal(JSON.parse(json).produzione.origine, "non_dichiarata");
});

// ─── N4 — tetto dei prodotti e id pubblici ─────────────────────────────────

test("N4: massimo 50 prodotti valutati e id con . : - _ preservati", () => {
  const prodotti = Array.from({ length: 60 }, (_, indice) => ({
    id: `sku.${indice}:a-b_c`,
    prezzo: 100,
    conforme: false,
  }));
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta sotto 50 euro",
      prodotti,
      limitiProduzione: { minPrice: null, maxPrice: 50 },
    },
    dipendenze({ minPrice: null, maxPrice: 50 })
  );

  assert.equal(report.budget.prodottiValutati, 50);
  assert.equal(report.uscita.prodottiRestituiti, 50);
  assert.equal(report.budget.idFuoriBudget.length, 10);
  assert.equal(report.budget.idFuoriBudget[0], "sku.0:a-b_c");
  assert.ok(report.budget.idFuoriBudget.every((id) => /^[A-Za-z0-9._:-]+$/.test(id)));
});

// ─── N7 — clock non finito ─────────────────────────────────────────────────

test("N7: un clock non finito non genera eccezioni né date invalide", () => {
  for (const valore of [NaN, Infinity, -Infinity]) {
    const report = valutaTier0Shadow(
      {
        messaggio: "Cerco pasta sotto 5 euro",
        prodotti: [{ id: "p1", prezzo: 1, conforme: true }],
        limitiProduzione: { minPrice: null, maxPrice: 5 },
      },
      { ...dipendenze({ minPrice: null, maxPrice: 5 }), ora: () => valore }
    );

    assert.ok(Number.isFinite(report.durataMs));
    assert.equal(report.durataMs, 0);
    assert.equal(Number.isNaN(Date.parse(report.timestamp)), false);
    assert.ok(JSON.parse(serializzaReportTier0(report)));
  }
});

// ─── Fase 2 — integrazione runtime (adattatore, 14 uscite, route) ───────────
//
// L'adattatore si importa direttamente (unico import: tier0), senza rete.
// `index.ts` usa gli alias "@/" non risolvibili da node: il cablaggio delle 14
// uscite e la route sono verificati sul sorgente, l'invarianza a runtime.

const shadowRispostaBase = () => ({
  risposta: "ok",
  negozi: [],
  prodotti: [{ id: "p1", prezzo: 4, conforme: true }],
  processingMs: 3,
  source: "assistente",
});

test("F2: Shadow spenta non registra osservazioni e non chiama il planner", () => {
  let chiamate = 0;
  const risposta = shadowRispostaBase();
  const deps = {
    ...dipendenze(),
    pianifica: () => {
      chiamate += 1;
      throw new Error("planner");
    },
  };

  creaOsservazioneTier0(risposta, { messaggio: "Cerco pasta" }, deps, {});
  assert.equal(prendiOsservazioneTier0(risposta), null);
  assert.equal(chiamate, 0);
  assert.deepEqual(risposta, shadowRispostaBase());
});

test("F2: l'osservazione è registrata, consumata e non altera la risposta", () => {
  const risposta = shadowRispostaBase();
  const prima = JSON.stringify(risposta);

  creaOsservazioneTier0(
    risposta,
    {
      messaggio: "Cerco pasta sotto 5 euro",
      prodotti: risposta.prodotti,
      limitiProduzione: { minPrice: null, maxPrice: 5 },
    },
    dipendenze({ minPrice: null, maxPrice: 5 }),
    attivo
  );

  assert.equal(JSON.stringify(risposta), prima);
  const osservazione = prendiOsservazioneTier0(risposta);
  assert.equal(typeof osservazione, "function");
  assert.equal(prendiOsservazioneTier0(risposta), null);

  const log = [];
  const infoOriginale = console.info;
  console.info = (...args) => log.push(args.join(" "));
  try {
    osservazione();
  } finally {
    console.info = infoOriginale;
  }

  assert.equal(log.length, 1);
  const report = JSON.parse(log[0].replace("[pino-shadow-tier0] ", ""));
  assert.equal(report.v, 1);
  assert.equal(report.produzione.limiti.maxPrice, 5);
  assert.equal(report.uscita.prodottiRestituiti, 1);
  assert.equal(report.budget.conformi, 1);
});

test("F2 B2: planner, dipendenze e log che lanciano non escono dal callback", () => {
  const esplode = () => {
    throw new Error("shadow");
  };
  const input = {
    messaggio: "Cerco pasta sotto 5 euro",
    prodotti: [{ id: "p1", prezzo: 4 }],
    limitiProduzione: { minPrice: null, maxPrice: 5 },
  };
  const base = () => dipendenze({ minPrice: null, maxPrice: 5 });

  for (const deps of [
    { ...base(), pianifica: esplode },
    { ...base(), prezzoNumerico: esplode },
    { ...base(), rispettaBudget: esplode },
  ]) {
    const risposta = shadowRispostaBase();
    creaOsservazioneTier0(risposta, input, deps, attivo);
    const osservazione = prendiOsservazioneTier0(risposta);
    assert.doesNotThrow(() => osservazione());
  }

  // Contratto `undefined`: l'estrattore di produzione è una dipendenza.
  const senzaLimiti = shadowRispostaBase();
  creaOsservazioneTier0(
    senzaLimiti,
    { messaggio: "Cerco pasta" },
    { ...dipendenze(), estraiPrezzo: esplode },
    attivo
  );
  assert.doesNotThrow(() => prendiOsservazioneTier0(senzaLimiti)());

  // Serializzazione/log che lancia: resta dentro il try/catch reale.
  const logRotto = shadowRispostaBase();
  creaOsservazioneTier0(logRotto, input, base(), attivo);
  const infoOriginale = console.info;
  console.info = esplode;
  try {
    assert.doesNotThrow(() => prendiOsservazioneTier0(logRotto)());
  } finally {
    console.info = infoOriginale;
  }
});

test("F2: nei log non finisce il testo della conversazione", () => {
  const risposta = shadowRispostaBase();
  const messaggio = "Cerco un regalo segreto per Mario sotto 5 euro";
  creaOsservazioneTier0(
    risposta,
    {
      messaggio,
      prodotti: risposta.prodotti,
      limitiProduzione: { minPrice: null, maxPrice: 5 },
    },
    dipendenze({ minPrice: null, maxPrice: 5 }),
    attivo
  );

  const log = [];
  const infoOriginale = console.info;
  console.info = (...args) => log.push(args.join(" "));
  try {
    prendiOsservazioneTier0(risposta)();
  } finally {
    console.info = infoOriginale;
  }

  assert.equal(/Mario|segreto|regalo|Cerco/.test(log.join(" ")), false);
});

test("F2: tutte le 25 uscite di index.ts passano dall'osservatore", () => {
  const src = sorgente("lib/assistente/index.ts");
  const motivi = [...src.matchAll(/return esci\(\s*"([a-z_]+)"/g)].map((match) => match[1]);

  assert.equal(motivi.length, 25, motivi.join(","));
  assert.deepEqual(
    new Set(motivi),
    new Set([
      "conversazione",
      "sicurezza_alimentare",
      "istruzioni_interne",
      "azione_non_disponibile",
      "servizio_non_coperto",
      "refuso_attivita",
      "faq",
      "preferenza_lingua",
      "capacita_lingua",
      "prezzo_contesto",
      "prezzo_senza_soggetto",
      "saluto",
      "cinema",
      "attrazioni",
      "attrazioni_assenti",
      "aggregata",
      "conteggio_attivita",
      "fonti_non_disponibili",
      "risposta_diretta",
      "info_attivita",
      "meteo",
      "farmacie",
      "selezione_vuota",
      "follow_up",
      "finale",
    ])
  );

  const corpo = src.slice(
    src.indexOf("const esci ="),
    src.indexOf("// S4.1 — Una sola comprensione strutturata per richiesta.")
  );
  assert.ok(corpo.includes("return risposta;"));
  assert.equal(/structuredClone|\.\.\.risposta|JSON\.(parse|stringify)/.test(corpo), false);
  assert.ok(corpo.indexOf("shadowTier0Attivo()") < corpo.indexOf("creaOsservazioneTier0("));
  assert.equal(src.includes("return rispostaFollowUp("), false);

  // La valutazione non sta nel percorso della risposta: solo nell'adattatore.
  assert.equal(src.includes("valutaTier0Shadow"), false);
  assert.equal(src.includes("eseguiTier0Shadow"), false);
  assert.equal(src.includes("serializzaReportTier0"), false);
});

test("F2 B2: l'adattatore racchiude valutazione e serializzazione nel try/catch", () => {
  const src = sorgente("lib/assistente/shadow/integrazione.ts");
  const corpo = src.slice(
    src.indexOf("osservazioniTier0.set"),
    src.indexOf("export function prendiOsservazioneTier0")
  );

  assert.ok(corpo.includes("try {"));
  assert.ok(corpo.indexOf("try {") < corpo.indexOf("eseguiTier0Shadow("));
  assert.ok(corpo.indexOf("eseguiTier0Shadow(") < corpo.indexOf("serializzaReportTier0("));
  assert.ok(corpo.includes("catch"));
  assert.equal(/\bretry\b|setTimeout|Promise|\basync\b|\bawait\b/.test(corpo), false);
  assert.equal(/fetch\(|@google\/genai|createClient\(|axios|supabase/.test(src), false);
});

test("F2: la route schedula l'osservazione con after() senza cambiare il JSON", () => {
  const src = sorgente("app/api/assistente/route.ts");

  assert.ok(src.includes('import { NextResponse, after } from "next/server";'));
  assert.ok(src.includes("prendiOsservazioneTier0(risultato)"));
  assert.ok(src.includes("after(() => {"));
  assert.ok(
    src.indexOf("const osservazione = prendiOsservazioneTier0(risultato);") <
      src.indexOf("lingua: rilevaLinguaConversazionePino(messaggi)")
  );
  assert.equal(
    /return NextResponse\.json\(\{\s*\.\.\.risultato,\s*lingua: rilevaLinguaConversazionePino\(messaggi\),\s*\}\);/m.test(
      src
    ),
    true
  );

  const blocco = src.slice(
    src.indexOf("if (osservazione) {"),
    src.indexOf("// La lingua dell'ultimo messaggio")
  );
  assert.equal((blocco.match(/catch/g) ?? []).length, 2);
  assert.equal(/\bawait\b|Promise|setTimeout/.test(blocco), false);
});

test("F2: test:pino include la suite Shadow e conserva le esistenti", () => {
  const pkg = JSON.parse(sorgente("package.json"));
  const script = pkg.scripts["test:pino"];

  assert.ok(script.includes("tests/pino-shadow-tier0.test.mjs"));
  for (const file of [
    "tests/pino-understanding.test.mjs",
    "tests/pino-gift-retrieval.test.mjs",
    "tests/pino-greetings.test.mjs",
    "tests/pino-core-v2.test.mjs",
    "tests/pino-core-v2-ranker.test.mjs",
    "tests/pino-core-v2-ai-planner.test.mjs",
    "tests/pino-core-v2-benchmark.test.mjs",
    "tests/pino-current-gates-benchmark.test.mjs",
    "tests/pino-production-intent-benchmark.test.mjs",
  ]) {
    assert.ok(script.includes(file), file);
  }
});

test("D: un limite di produzione pari a zero resta zero", () => {
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta entro 0 euro",
      prodotti: [],
      limitiProduzione: { minPrice: null, maxPrice: 0 },
      origineLimitiProduzione: "traccia",
    },
    dipendenze({ minPrice: null, maxPrice: 0 })
  );

  assert.equal(report.produzione.limiti.maxPrice, 0);
  assert.equal(report.divergenza.tipi.includes("max_diverso"), false);

  const json = JSON.parse(serializzaReportTier0(report));
  assert.equal(json.produzione.limiti.maxPrice, 0);
  assert.equal(json.confronto.risultati.stato, "zero_risultati");
});

// ─── E — confronto diagnostico route/surface/risultati ─────────────────────

test("E: la route di produzione è derivata dal motivo di uscita", () => {
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco scarpe a Castrovillari",
      prodotti: [],
      negoziRestituiti: 0,
      motivoUscita: "attrazioni_assenti",
      invocazioni: [],
    },
    dipendenze()
  );

  assert.equal(report.confronto.route.piano, "catalog");
  assert.equal(report.confronto.route.produzione, "attractions");
  assert.equal(report.confronto.route.divergente, true);
  assert.equal(report.confronto.surface.divergente, true);
  assert.equal(report.confronto.risultati.stato, "uscita");
  assert.ok(report.confronto.tipi.includes("route_diversa"));
  assert.ok(report.confronto.tipi.includes("surface_diversa"));
});

test("E: la surface di produzione è derivata dalle invocazioni registrate", () => {
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco pasta sotto 5 euro",
      prodotti: [],
      negoziRestituiti: 0,
      motivoUscita: "finale",
      invocazioni: ["searchProducts"],
      limitiProduzione: { minPrice: null, maxPrice: 5 },
    },
    dipendenze({ minPrice: null, maxPrice: 5 })
  );

  assert.equal(report.confronto.route.produzione, "catalog");
  assert.equal(report.confronto.surface.produzione, "products");
  assert.equal(report.confronto.surface.divergente, false);
  assert.equal(report.confronto.risultati.stato, "zero_risultati");
  assert.equal(report.confronto.risultati.prodottiRestituiti, 0);
  assert.ok(report.confronto.tipi.includes("zero_risultati_prodotti"));
  assert.equal(report.confronto.tipi.includes("limiti_diversi"), false);
});

test("E: il confronto è additivo, sanificato e non altera la risposta", () => {
  const report = valutaTier0Shadow(
    {
      messaggio: "Cerco un regalo segreto per Mario",
      prodotti: [{ id: "p1", prezzo: 10, conforme: true }],
      negoziRestituiti: 1,
      motivoUscita: "Mario segreto",
      invocazioni: ["searchProducts", "../../segreto"],
      limitiProduzione: { minPrice: null, maxPrice: 50 },
    },
    dipendenze({ minPrice: null, maxPrice: 50 })
  );

  assert.equal(report.confronto.route.produzione, "catalog");
  assert.equal(report.confronto.surface.produzione, "products");
  assert.equal(report.confronto.risultati.prodottiRestituiti, 1);

  const json = serializzaReportTier0(report);
  assert.equal(/Mario|segreto/i.test(json), false);
  const serializzato = JSON.parse(json);
  assert.equal(serializzato.confronto.route.produzione, "catalog");
  assert.equal(serializzato.confronto.risultati.stato, "risultati");
});

test("F2: nessuna nuova dipendenza esterna", () => {
  const pkg = JSON.parse(sorgente("package.json"));
  assert.deepEqual(
    Object.keys(pkg.dependencies).sort(),
    [
      "@google/genai",
      "@supabase/ssr",
      "fast-xml-parser",
      "lucide-react",
      "next",
      "react",
      "react-dom",
      "react-markdown",
      "remark-gfm",
      "resend",
      "stripe",
    ].sort()
  );
});
