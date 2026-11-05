import assert from "node:assert/strict";
import test from "node:test";

import {
  SELECT_PRODOTTO_RICERCA,
  mappaProdottoRicerca,
  mappaProdottoRiga,
} from "../lib/negozi.ts";
import {
  prodottoPertinente,
  prodottoRispettaBudgetPino,
} from "../lib/assistente/tools.ts";

// P1.2 — i metadati del catalogo vengono recuperati e conservati, senza
// cambiare ranking, budget, routing o contratto pubblico delle API.

const CAMPI_METADATI = [
  "sottocategoria",
  "marca",
  "parole_chiave",
  "parole_chiave_normalizzate",
  "caratteristiche",
  "descrizione_completa",
  "seo_title",
  "seo_description",
  "alt_text_immagine",
];

const rigaCompleta = {
  id: "p1",
  slug: "borsa-in-pelle",
  negozio_id: "n1",
  nome: "Borsa in pelle",
  descrizione: "Borsa artigianale con tracolla.",
  descrizione_completa:
    "Borsa in pelle conciata, realizzata a mano, con tracolla removibile e tasca interna.",
  categoria: "Accessori",
  sottocategoria: "Borse",
  marca: "Bottega locale",
  colore: "marrone",
  materiale: "pelle",
  parole_chiave: [" Borsa in pelle ", "pelle", "PELLE", "", "artigianale"],
  caratteristiche: ["Fatta a mano", " ", "Tracolla removibile"],
  seo_title: "Borsa in pelle artigianale",
  seo_description: "Borsa in pelle fatta a mano della Bottega locale.",
  alt_text_immagine: "Borsa in pelle marrone con tracolla",
  prezzo: 49.9,
  immagine_principale: "https://example.test/borsa.jpg",
  quantita_disponibile: 3,
  quantita_riservata: 1,
  ha_varianti: false,
};

const rigaMinima = {
  id: "p2",
  negozio_id: "n1",
  nome: "Prodotto essenziale",
  descrizione: null,
  categoria: null,
  prezzo: 1,
  immagine_principale: null,
};

function dbNegoziFinto(negozi) {
  const catena = {};
  for (const passo of ["from", "select", "in", "is"]) {
    catena[passo] = () => catena;
  }
  catena.then = (risolvi) => risolvi({ data: negozi, error: null });
  return catena;
}

test("P1.2 — la select condivisa contiene tutti i metadati disponibili", () => {
  for (const campo of [
    "sottocategoria",
    "marca",
    "parole_chiave",
    "caratteristiche",
    "descrizione_completa",
    "seo_title",
    "seo_description",
    "alt_text_immagine",
  ]) {
    assert.equal(
      SELECT_PRODOTTO_RICERCA.includes(campo),
      true,
      `select priva di ${campo}`,
    );
  }
});

test("P1.2 — mapping completo dei metadati disponibili", () => {
  const prodotto = mappaProdottoRiga(rigaCompleta, "Bottega locale");

  assert.equal(prodotto.sottocategoria, "Borse");
  assert.equal(prodotto.marca, "Bottega locale");
  assert.deepEqual(prodotto.parole_chiave, [
    "Borsa in pelle",
    "pelle",
    "PELLE",
    "artigianale",
  ]);
  assert.deepEqual(prodotto.parole_chiave_normalizzate, [
    "borsa in pelle",
    "pelle",
    "artigianale",
  ]);
  assert.deepEqual(prodotto.caratteristiche, [
    "Fatta a mano",
    "Tracolla removibile",
  ]);
  assert.equal(prodotto.descrizione_completa, rigaCompleta.descrizione_completa);
  assert.equal(prodotto.seo_title, rigaCompleta.seo_title);
  assert.equal(prodotto.seo_description, rigaCompleta.seo_description);
  assert.equal(prodotto.alt_text_immagine, rigaCompleta.alt_text_immagine);

  // La normalizzazione non riscrive la riga originale.
  assert.deepEqual(rigaCompleta.parole_chiave, [
    " Borsa in pelle ",
    "pelle",
    "PELLE",
    "",
    "artigianale",
  ]);
});

test("P1.2 — null, stringhe vuote e valori malformati non entrano nel DTO", () => {
  const prodotto = mappaProdottoRiga({
    ...rigaMinima,
    sottocategoria: "   ",
    marca: null,
    parole_chiave: "Pasta, , Olio",
    caratteristiche: null,
    descrizione_completa: 42,
    seo_title: "",
    seo_description: "   ",
    alt_text_immagine: undefined,
  });

  assert.equal(prodotto.sottocategoria, null);
  assert.equal(prodotto.marca, null);
  assert.deepEqual(prodotto.parole_chiave, ["Pasta", "Olio"]);
  assert.deepEqual(prodotto.parole_chiave_normalizzate, ["pasta", "olio"]);
  assert.deepEqual(prodotto.caratteristiche, []);
  assert.equal(prodotto.descrizione_completa, null);
  assert.equal(prodotto.seo_title, null);
  assert.equal(prodotto.seo_description, null);
  assert.equal(prodotto.alt_text_immagine, null);
});

test("P1.2 — i record privi dei nuovi campi restano compatibili", async () => {
  const prodotti = await mappaProdottoRicerca(
    [rigaMinima],
    undefined,
    dbNegoziFinto([{ id: "n1", nome: "Negozio" }]),
  );
  const prodotto = prodotti[0];

  assert.equal(prodotto.nome, "Prodotto essenziale");
  assert.equal(prodotto.negozio_nome, "Negozio");
  assert.equal(prodotto.sottocategoria, null);
  assert.equal(prodotto.marca, null);
  assert.deepEqual(prodotto.parole_chiave, []);
  assert.deepEqual(prodotto.caratteristiche, []);
  assert.equal(prodotto.descrizione_completa, null);
});

test("P1.2 — i campi già usati non vengono persi", () => {
  const prodotto = mappaProdottoRiga(rigaCompleta, "Bottega locale");

  assert.equal(prodotto.id, "p1");
  assert.equal(prodotto.slug, "borsa-in-pelle");
  assert.equal(prodotto.negozio_id, "n1");
  assert.equal(prodotto.nome, "Borsa in pelle");
  assert.equal(prodotto.descrizione, rigaCompleta.descrizione);
  assert.equal(prodotto.categoria, "Accessori");
  assert.equal(prodotto.colore, "marrone");
  assert.equal(prodotto.materiale, "pelle");
  assert.equal(prodotto.prezzo, 49.9);
  assert.equal(prodotto.immagine_principale, rigaCompleta.immagine_principale);
  assert.equal(prodotto.quantita_disponibile, 3);
  assert.equal(prodotto.quantita_riservata, 1);
  assert.equal(prodotto.ha_varianti, false);
  assert.equal(prodotto.negozio_nome, "Bottega locale");
});

test("P1.2 — i metadati non modificano il budget", () => {
  const prodotto = mappaProdottoRiga(rigaCompleta);

  assert.equal(prodottoRispettaBudgetPino(prodotto, { maxPrice: 50 }), true);
  assert.equal(prodottoRispettaBudgetPino(prodotto, { maxPrice: 49 }), false);
  assert.equal(prodottoRispettaBudgetPino(prodotto, { minPrice: 50 }), false);
  assert.equal(prodottoRispettaBudgetPino(prodotto, { minPrice: 49 }), true);
});

test("P1.2 — la pertinenza pasta resta invariata", () => {
  const base = (override) =>
    mappaProdottoRiga({
      ...rigaMinima,
      categoria: "Alimentari",
      ...override,
    });

  const taralli = base({
    nome: "Taralli calabresi",
    categoria: "Prodotti da forno",
    descrizione:
      "Taralli da forno, prodotto a base di farina nella selezione demo di Mani in Pasta.",
    descrizione_completa:
      "Taralli croccanti della selezione demo di Mani in Pasta.",
    parole_chiave: ["taralli", "farina", "forno"],
    caratteristiche: ["Da forno"],
  });
  const biscotti = base({
    nome: "Biscotti tradizionali calabresi",
    categoria: "Prodotti da forno",
    descrizione:
      "Biscotti da forno a base di farina, nella selezione demo di Mani in Pasta.",
    parole_chiave: ["biscotti", "farina", "dolci"],
  });
  const fileja = base({
    nome: "Fileja di Tropea",
    descrizione: "Pasta tradizionale calabrese nel formato fileja.",
    descrizione_completa:
      "La fileja è un formato di pasta tradizionale calabrese.",
    parole_chiave: ["fileja", "pasta calabrese", "pasta tipica"],
  });

  assert.equal(prodottoPertinente(taralli, ["pasta"], []), false);
  assert.equal(prodottoPertinente(biscotti, ["pasta"], []), false);
  assert.equal(prodottoPertinente(fileja, ["pasta"], []), true);
});

test("P1.2 — i metadati restano interni e non vengono serializzati", () => {
  const prodotto = mappaProdottoRiga(rigaCompleta);
  const serializzato = JSON.stringify(prodotto);

  for (const campo of CAMPI_METADATI) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(prodotto, campo),
      true,
      `metadato interno assente: ${campo}`,
    );
    assert.equal(
      Object.keys(prodotto).includes(campo),
      false,
      `metadato enumerabile: ${campo}`,
    );
    assert.equal(
      serializzato.includes(`"${campo}"`),
      false,
      `metadato serializzato: ${campo}`,
    );
  }
});
