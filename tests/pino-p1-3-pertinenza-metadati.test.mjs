import assert from "node:assert/strict";
import test from "node:test";

import { mappaProdottoRiga } from "../lib/negozi.ts";
import {
  filtraProdottiPerSoggettoUnico,
  ordinaProdottiPerBudget,
  prodottoPertinente,
  prodottoRispettaBudgetPino,
} from "../lib/assistente/tools.ts";
import { normalizzaQueryCatalogo } from "../lib/assistente/understanding.ts";
import {
  casiBenchmarkP13,
  casiDiagnosticiP13,
  casiProdottoP13,
  righeCatalogoP13,
} from "./fixtures/pino-p1-3-catalog.mjs";

const prodotti = righeCatalogoP13.map((riga) =>
  mappaProdottoRiga(riga, riga.negozio_nome)
);
const perNome = new Map(prodotti.map((prodotto) => [prodotto.nome, prodotto]));

// Stesso gate usato dal benchmark locale e da `searchProducts` per la parte
// alimentare/non alimentare. Il budget è applicato dopo, come nel percorso reale.
const RE_ALIMENTO = /\b(pasta|pane|pizza|dolci?|gelato|torte?|biscotti|formaggio|salumi|prosciutto|carne|pesce|verdura|frutta|olio|miele|conserve|farina|riso|nutella|cipolla|pomodoro|bread|noodles|cake|cookies|cheese|meat|fish|vegetables|fruit|honey|flour|rice|onion|tomato)\b/;

function gate(query) {
  const alimento = query.toLowerCase().match(RE_ALIMENTO)?.[1];
  if (alimento) {
    return prodotti.filter((prodotto) =>
      prodottoPertinente(prodotto, [alimento], [])
    );
  }
  return filtraProdottiPerSoggettoUnico(
    prodotti,
    normalizzaQueryCatalogo(query),
    query
  );
}

function nomi(risultati) {
  return risultati.map((prodotto) => prodotto.nome);
}

test("P1.3 — pasta distingue i formati dai prodotti da forno", () => {
  assert.deepEqual(nomi(gate("Cerco pasta")), [
    "Fileja di Tropea",
    "Maccheroni al ferretto",
    "Tagliatelle all'uovo",
  ]);
  assert.equal(gate("Cerco pasta").some((p) => p.nome === "Taralli calabresi"), false);
  assert.equal(
    gate("Cerco pasta").some((p) => p.nome === "Biscotti tradizionali calabresi"),
    false
  );
  assert.equal(gate("Cerco pasta").some((p) => p.nome === "T-shirt con stampa"), false);
});

test("P1.3 — taralli e biscotti restano ricerche specifiche", () => {
  assert.deepEqual(nomi(gate("Cerco taralli")), ["Taralli calabresi"]);
  assert.deepEqual(nomi(gate("Cerco biscotti")), [
    "Biscotti tradizionali calabresi",
  ]);
  assert.equal(gate("Cerco taralli").some((p) => p.nome.includes("Biscotti")), false);
  assert.equal(gate("Cerco biscotti").some((p) => p.nome.includes("Taralli")), false);
});

test("P1.3 — fileja e maccheroni sono identificati dal nome", () => {
  assert.deepEqual(nomi(gate("Cerco fileja")), ["Fileja di Tropea"]);
  assert.deepEqual(nomi(gate("Cerco maccheroni al ferretto")), [
    "Maccheroni al ferretto",
  ]);
});

test("P1.3 — i metadati completi alimentano marca, sottocategoria e caratteristiche", () => {
  const borsa = perNome.get("Borsa in pelle");
  assert.equal(borsa.sottocategoria, "Borse");
  assert.equal(borsa.marca, "Bottega locale");
  assert.deepEqual(borsa.caratteristiche, ["Fatta a mano", "Tracolla removibile"]);
  assert.deepEqual(nomi(gate("Cerco Bottega locale")), [
    "Borsa in pelle",
    "Tracolla in pelle",
    "Cintura artigianale",
  ]);
  assert.deepEqual(nomi(gate("Cerco borse")), [
    "Borsa in pelle",
    "Tracolla in pelle",
    "Borsa vintage",
  ]);
  assert.deepEqual(nomi(gate("Cerco una borsa fatta a mano")), ["Borsa in pelle"]);
});

test("P1.3 — metadati nulli e record vecchi non provocano errori", () => {
  const minimo = mappaProdottoRiga({
    id: "minimo",
    negozio_id: "n-min",
    nome: "Borsa essenziale",
    descrizione: null,
    categoria: null,
    prezzo: 10,
    immagine_principale: null,
  });
  assert.doesNotThrow(() => prodottoPertinente(minimo, ["pasta"], []));
  assert.doesNotThrow(() =>
    filtraProdottiPerSoggettoUnico([minimo], "borsa", "borsa")
  );
  assert.equal(minimo.sottocategoria, null);
  assert.deepEqual(minimo.caratteristiche, []);

  const vintage = perNome.get("Borsa vintage");
  assert.deepEqual(nomi(gate("Cerco una borsa")), [
    "Borsa in pelle",
    "Tracolla in pelle",
    "Borsa vintage",
  ]);
  assert.equal(vintage.marca, null);
  assert.deepEqual(vintage.caratteristiche, []);
});

test("P1.3 — una descrizione o un campo SEO non bastano da soli", () => {
  const orologio = perNome.get("Orologio classico");
  assert.match(orologio.seo_title ?? "", /Borsa/);
  assert.match(orologio.alt_text_immagine ?? "", /Borsa/);
  assert.equal(gate("Cerco una borsa").some((p) => p.nome === "Orologio classico"), false);

  const taralli = perNome.get("Taralli calabresi");
  assert.match(taralli.descrizione_completa ?? "", /Mani in Pasta/);
  assert.equal(prodottoPertinente(taralli, ["pasta"], []), false);
  assert.equal(prodottoPertinente(perNome.get("T-shirt con stampa"), ["pasta"], []), false);
});

test("P1.3 — il nome del negozio non è una prova di pertinenza", () => {
  const taralli = perNome.get("Taralli calabresi");
  assert.equal(taralli.negozio_nome, "Mani in Pasta");
  assert.equal(prodottoPertinente(taralli, ["pasta"], []), false);
  assert.equal(taralli.marca, "Forno Locale");
  assert.equal(gate("Cerco Mani in Pasta").some((p) => p.nome === "Taralli calabresi"), false);
});

test("P1.3 — budget zero, positivo e assente", () => {
  const pasta = gate("Cerco pasta");
  assert.equal(pasta.length, 3);
  for (const prodotto of pasta) {
    assert.equal(prodottoRispettaBudgetPino(prodotto, { maxPrice: 0 }), false);
  }

  const entroCinque = ordinaProdottiPerBudget(pasta, { maxPrice: 5 }).filter(
    (prodotto) => prodottoRispettaBudgetPino(prodotto, { maxPrice: 5 })
  );
  assert.deepEqual(nomi(entroCinque), [
    "Fileja di Tropea",
    "Maccheroni al ferretto",
    "Tagliatelle all'uovo",
  ]);

  // Senza budget il prezzo non elimina prodotti pertinenti.
  assert.equal(pasta.length, 3);
});

test("P1.3 — il contratto pubblico e i metadati interni restano invariati", () => {
  const borsa = perNome.get("Borsa in pelle");
  const serializzato = JSON.stringify(borsa);
  for (const campo of [
    "sottocategoria",
    "marca",
    "parole_chiave",
    "parole_chiave_normalizzate",
    "caratteristiche",
    "descrizione_completa",
    "seo_title",
    "seo_description",
    "alt_text_immagine",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(borsa, campo), true);
    assert.equal(Object.keys(borsa).includes(campo), false);
    assert.equal(serializzato.includes(`"${campo}"`), false);
  }
});

test("P1.3 — il benchmark locale resta coerente con le etichette prodotto", () => {
  for (const caso of casiProdottoP13) {
    let risultati = gate(caso.query);
    if (caso.maxPrice != null || caso.minPrice != null) {
      risultati = ordinaProdottiPerBudget(risultati, {
        maxPrice: caso.maxPrice ?? null,
        minPrice: caso.minPrice ?? null,
      });
      if (caso.budgetRigido) {
        risultati = risultati.filter((prodotto) =>
          prodottoRispettaBudgetPino(prodotto, {
            maxPrice: caso.maxPrice ?? null,
            minPrice: caso.minPrice ?? null,
          })
        );
      }
    }
    assert.deepEqual(nomi(risultati), caso.expected, caso.id);
  }
});

test("P1.3 — i casi diagnostici restano visibili ma fuori dalle metriche", () => {
  assert.equal(casiBenchmarkP13.length, 12);
  assert.equal(casiProdottoP13.length, 10);
  assert.equal(casiDiagnosticiP13.length, 2);

  const marca = casiDiagnosticiP13.find((caso) => caso.id === "marca");
  assert.equal(marca.expected, null);
  assert.equal(marca.diagnostica, "ambiguita_marca_negozio");
  assert.deepEqual(nomi(gate(marca.query)), [
    "Borsa in pelle",
    "Tracolla in pelle",
    "Cintura artigianale",
  ]);

  const generica = casiDiagnosticiP13.find((caso) => caso.id === "generica");
  assert.equal(generica.expected, null);
  assert.equal(generica.diagnostica, "richiesta_generica");
  assert.equal(gate(generica.query).length, prodotti.length);
});
