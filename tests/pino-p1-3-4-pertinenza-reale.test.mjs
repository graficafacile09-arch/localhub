import assert from "node:assert/strict";
import test from "node:test";

import {
  calcolaReportP134,
  gatePertinenzaP134,
  prodottiFixtureAmbiguita,
  prodottiFixtureP13,
  prodottiSnapshot,
  SHA256_SNAPSHOT,
} from "../scripts/pino-p1-3-4-benchmark.mjs";

const report = calcolaReportP134();
const perId = new Map(report.casi.map((caso) => [caso.id, caso]));

function ids(prodotti) {
  return prodotti.map((prodotto) => String(prodotto.id));
}

function esito(query, catalogo = prodottiSnapshot) {
  return ids(gatePertinenzaP134(query, catalogo));
}

test("P1.3.4 — lo snapshot P1.3.3 è presente e con hash verificato", () => {
  assert.equal(report.snapshot.sha256, SHA256_SNAPSHOT);
  assert.equal(report.snapshot.prodottiAttivi, 37);
  assert.equal(prodottiSnapshot.length, 37);
});

test("P1.3.4 — le caratteristiche alimentari esplicite non ammettono prodotti senza prova", () => {
  assert.deepEqual(esito("Cerco olio in bottiglia da 1 litro"), ["1507"]);
  assert.equal(esito("Cerco olio in bottiglia da 1 litro").includes("1376"), false);  assert.equal(
    perId.get("caratteristica-bottiglia-litro").dopo.precisione,
    1
  );

  // Una quantità non documentata non può essere presentata come certa.
  assert.deepEqual(esito("Cerco olio in bottiglia da 2 litri"), []);
});

test("P1.3.4 — la sottocategoria pasta tipica non restituisce tutta la pasta", () => {
  assert.deepEqual(esito("Cerco pasta tipica"), ["1513"]);
  assert.equal(esito("Cerco pasta tipica").includes("1490"), false);
  assert.equal(esito("Cerco pasta tipica").includes("1491"), false);
  assert.equal(esito("Cerco pasta tipica").includes("1517"), false);

  // La ricerca generica conserva tutti i formati già corretti.
  assert.deepEqual(esito("Cerco pasta"), ["1490", "1491", "1513", "1517"]);
});

test("P1.3.4 — Amarelli viene riconosciuta come keyword-marca distintiva", () => {
  assert.deepEqual(esito("Cerco Amarelli"), ["1511"]);
  assert.deepEqual(esito("Cerco Liquirizia di Calabria DOP"), ["1511"]);
});

test("P1.3.4 — i casi alimentari già corretti restano corretti", () => {
  assert.deepEqual(esito("Cerco Fileja di Tropea"), ["1513"]);
  assert.deepEqual(esito("Cerco Pecorino del Monte Poro"), ["1508"]);
  assert.deepEqual(esito("Cerco formaggio"), ["1508"]);
  assert.deepEqual(esito("Cerco Maserati"), ["218"]);
  assert.deepEqual(esito("Cerco pane con lievito madre"), ["1488"]);

  const miele = perId.get("budget-miele-sotto-10").dopo;
  assert.deepEqual(miele.restituiti, ["1520", "1521", "1374"]);
  assert.equal(miele.precisione, 1);
  assert.equal(miele.richiamo, 1);
});

test("P1.3.4 — il nome del negozio non diventa identità del prodotto", () => {
  assert.deepEqual(esito("Cerco Barone Gioielli"), []);
  // "Mani in Pasta" resta un caso diagnostico: il termine Pasta attiva il
  // ramo alimentare, ma il nome del negozio non viene usato come identità.
  assert.deepEqual(esito("Cerco Mani in Pasta"), [
    "1490",
    "1491",
    "1513",
    "1517",
  ]);
});

test("P1.3.4 — regressioni non alimentari: borsa, caratteristiche, marca", () => {
  assert.deepEqual(
    esito("Cerco una borsa in pelle", prodottiFixtureP13),
    ["p13-borsa", "p13-tracolla", "p13-borsa-vintage"]
  );
  assert.deepEqual(
    esito("Cerco una borsa fatta a mano", prodottiFixtureP13),
    ["p13-borsa"]
  );
  assert.deepEqual(
    esito("Cerco Pelletteria Rossi", prodottiFixtureAmbiguita),
    ["a-borsa", "a-cintura", "a-borsa-borgo"]
  );
  assert.deepEqual(
    esito("Cerco Emporio del Cuoio", prodottiFixtureAmbiguita),
    []
  );
  assert.deepEqual(esito("Cerco Maserati"), ["218"]);
});

test("P1.3.4 — metriche prima/dopo e nessuna regressione aggregata", () => {
  const alimentari = report.metriche.alimentari;
  assert.equal(alimentari.prima.micro.precisione, 0.7895);
  assert.equal(alimentari.prima.micro.richiamo, 0.9375);
  assert.equal(alimentari.dopo.micro.precisione, 1);
  assert.equal(alimentari.dopo.micro.richiamo, 1);
  assert.equal(alimentari.dopo.micro.falsiPositivi, 0);
  assert.equal(alimentari.dopo.micro.falsiNegativi, 0);

  const nonAlimentari = report.metriche.nonAlimentari;
  assert.equal(nonAlimentari.prima.micro.precisione, 1);
  assert.equal(nonAlimentari.prima.micro.richiamo, 1);
  assert.equal(nonAlimentari.dopo.micro.precisione, 1);
  assert.equal(nonAlimentari.dopo.micro.richiamo, 1);

  assert.deepEqual(report.casiPeggiorati, []);
  assert.deepEqual(report.casiMigliorati.sort(), [
    "caratteristica-bottiglia-litro",
    "parole-chiave-amarelli",
    "sottocategoria-pasta-tipica",
  ]);
});

test("P1.3.4 — i casi diagnostici restano fuori dalle metriche", () => {
  const diagnostici = report.casi.filter((caso) => caso.gruppo === "diagnostico");
  assert.equal(diagnostici.length, 5);
  assert.equal(diagnostici.every((caso) => caso.dopo.incluso === false), true);
  assert.equal(report.diagnostici.length, 5);
});
