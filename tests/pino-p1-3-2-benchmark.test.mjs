import assert from "node:assert/strict";
import test from "node:test";

import { cercaNegoziLegacy, mappaProdottoRiga } from "../lib/negozi.ts";
import {
  CONTRATTI_STRUMENTO,
  filtraRisultatiPerVincoliNegozi,
} from "../lib/assistente/tools.ts";
import {
  calcolaMetriche,
  calcolaReport,
  gatePertinenza,
  misuraCaso,
} from "../scripts/pino-p1-3-benchmark.mjs";
import {
  casiBenchmarkP13,
  casiDiagnosticiP13,
  casiProdottoP13,
} from "./fixtures/pino-p1-3-catalog.mjs";
import {
  negoziAmbiguitaP13,
  righeCatalogoAmbiguitaP13,
} from "./fixtures/pino-p1-3-2-ambiguita.mjs";

const prodottiAmbiguita = righeCatalogoAmbiguitaP13.map((riga) =>
  mappaProdottoRiga(riga, riga.negozio_nome)
);

function nomi(prodotti) {
  return prodotti.map((prodotto) => prodotto.nome);
}

/**
 * Catena PostgREST finta: `cercaNegoziLegacy` usa solo from/select/eq/or/is.
 * Nessuna chiamata di rete: il test resta offline.
 */
function dbNegoziFinto(righe) {
  const risultato = { data: righe, error: null };
  const catena = {};
  for (const passo of ["from", "select", "eq", "or", "is", "order", "limit", "range"]) {
    catena[passo] = () => catena;
  }
  catena.then = (risolvi) => risolvi(risultato);
  return catena;
}

test("P1.3.2 — casi prodotto e diagnostici sono separati", () => {
  const report = calcolaReport();

  assert.equal(casiBenchmarkP13.length, 12);
  assert.equal(casiProdottoP13.length, 10);
  assert.equal(casiDiagnosticiP13.length, 2);
  assert.equal(report.casiTotali, 12);
  assert.equal(report.casiInclusi, 10);
  assert.equal(report.casiEsclusi, 2);
  assert.deepEqual(
    report.esclusione.map((caso) => caso.id).sort(),
    ["generica", "marca"]
  );

  for (const caso of casiProdottoP13) {
    assert.equal(caso.gruppo, "prodotto");
    assert.ok(Array.isArray(caso.expected) && caso.expected.length > 0, caso.id);
  }
  for (const caso of casiDiagnosticiP13) {
    assert.equal(caso.gruppo, "diagnostico");
    assert.equal(caso.expected, null);
    assert.ok(caso.motivoEsclusione);
  }
});

test("P1.3.2 — i diagnostici restano visibili ma fuori dalle metriche", () => {
  const report = calcolaReport();
  const perId = new Map(report.diagnostici.map((caso) => [caso.id, caso]));

  assert.deepEqual([...perId.keys()], ["marca", "generica"]);
  assert.equal(perId.get("marca").restituiti.length, 3);
  assert.equal(perId.get("marca").attesi, null);
  assert.equal(perId.get("marca").precisione, null);
  assert.equal(perId.get("marca").richiamo, null);

  assert.equal(perId.get("generica").restituiti.length, 12);
  assert.equal(perId.get("generica").attesi, null);
  assert.equal(perId.get("generica").precisione, null);
  assert.equal(perId.get("generica").richiamo, null);

  // I 12 prodotti del caso generico NON entrano nei 18 attesi prodotto.
  assert.equal(report.micro.attesi, 18);
  assert.equal(report.micro.restituiti, 18);
  assert.equal(report.micro.precisione, 1);
  assert.equal(report.micro.richiamo, 1);
  assert.equal(report.macro.precisione, 1);
  assert.equal(report.macro.richiamo, 1);
});

test("P1.3.2 — precisione e richiamo non definite sono null, non 1", () => {
  const senzaRisultati = misuraCaso(
    {
      id: "vuoto",
      gruppo: "prodotto",
      query: "Cerco fileja",
      expected: ["Fileja di Tropea"],
    },
    []
  );
  assert.equal(senzaRisultati.precisione, null);
  assert.equal(senzaRisultati.richiamo, 0);

  const senzaAttesi = misuraCaso({
    id: "senza-attesi",
    gruppo: "prodotto",
    query: "Cerco fileja",
    expected: [],
  });
  assert.equal(senzaAttesi.richiamo, null);

  const report = calcolaReport();
  for (const caso of report.risultati) {
    assert.notEqual(caso.precisione, undefined, caso.id);
    assert.notEqual(caso.richiamo, undefined, caso.id);
  }
  assert.equal(report.input.retrievalReale, false);
  assert.match(report.input.recupero, /NON eseguito/);
  assert.match(report.fasi.recupero, /fixture/);
});

test("P1.3.2 — la media macro usa solo i casi con metrica definita", () => {
  const vuoto = misuraCaso(
    {
      id: "macro-vuoto",
      gruppo: "prodotto",
      query: "Cerco fileja",
      expected: ["Fileja di Tropea"],
    },
    []
  );
  const pieno = misuraCaso({
    id: "macro-pieno",
    gruppo: "prodotto",
    query: "Cerco fileja",
    expected: ["Fileja di Tropea"],
  });
  const metriche = calcolaMetriche([vuoto, pieno]);

  assert.equal(metriche.macro.precisione, 1);
  assert.equal(metriche.macro.casiPrecisioneValidi, 1);
  assert.equal(metriche.macro.richiamo, 0.5);
  assert.equal(metriche.macro.casiRichiamoValidi, 2);
});

test("P1.3.2 — ricerca prodotto per marca, non per negozio", () => {
  const risultati = gatePertinenza(
    "Cerco Pelletteria Rossi",
    prodottiAmbiguita
  );
  const nomiMarchio = nomi(risultati);

  assert.deepEqual(nomiMarchio, [
    "Borsa artigianale",
    "Cintura artigianale",
    "Borsa da viaggio",
  ]);
  assert.equal(risultati.every((p) => p.marca === "Pelletteria Rossi"), true);
  // La marca attraversa due negozi: non è il catalogo di un singolo negozio.
  assert.equal(risultati.some((p) => p.negozio_id === "n-borgo"), true);
  assert.equal(nomiMarchio.includes("Portafoglio in pelle"), false);
});

test("P1.3.2 — ricerca di un negozio offline", async () => {
  const risultati = await cercaNegoziLegacy(
    dbNegoziFinto(negoziAmbiguitaP13),
    "Emporio del Cuoio",
    "Cerco Emporio del Cuoio"
  );

  assert.deepEqual(
    risultati.map((negozio) => negozio.nome),
    ["Emporio del Cuoio"]
  );
});

test("P1.3.2 — prodotti di un negozio tramite negozio_id", () => {
  const delNegozio = filtraRisultatiPerVincoliNegozi(
    prodottiAmbiguita,
    new Set(["n-emporio"]),
    null
  );
  const nomiNegozio = nomi(delNegozio);

  assert.deepEqual(nomiNegozio, [
    "Borsa artigianale",
    "Cintura artigianale",
    "Portafoglio in pelle",
  ]);
  assert.equal(delNegozio.every((p) => p.negozio_id === "n-emporio"), true);
  assert.equal(nomiNegozio.includes("Borsa da viaggio"), false);

  // La capacità esiste a livello di filtro, ma il tool searchProducts non
  // espone negozioId: non viene implementata in P1.3.2.
  assert.equal(CONTRATTI_STRUMENTO.searchProducts.includes("negozioId"), false);
});
