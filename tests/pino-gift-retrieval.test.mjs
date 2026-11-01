import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIE_REGALO, isGenericGiftRequest, prodottoCorrispondeCategoriaRegalo } from "../lib/assistente/gift-retrieval.ts";

test("a generic gift request expands to catalog categories without requiring a budget", () => {
  assert.equal(isGenericGiftRequest("Vorrei un regalo per mia moglie"), true);
  assert.ok(CATEGORIE_REGALO.includes("orologio"));
  assert.ok(CATEGORIE_REGALO.includes("gioielli"));
  assert.ok(CATEGORIE_REGALO.length >= 10);
});

test("a specific product request is not replaced by generic gift expansion", () => {
  assert.equal(isGenericGiftRequest("Vorrei regalare un orologio a mia moglie"), false);
  assert.equal(isGenericGiftRequest("Cerco un regalo, magari un profumo"), false);
});

test("gift fan-out rejects products unrelated to the searched category", () => {
  assert.equal(prodottoCorrispondeCategoriaRegalo(
    { nome: "Mani in pasta", categoria: "Libri" }, "orologio"
  ), false);
  assert.equal(prodottoCorrispondeCategoriaRegalo(
    { nome: "Anello con pietra", categoria: "Gioielli" }, "anello"
  ), true);
  assert.equal(prodottoCorrispondeCategoriaRegalo(
    { nome: "Orologio da polso", categoria: "Orologi" }, "orologio"
  ), true);
});

test("gift wording in English is supported", () => {
  assert.equal(isGenericGiftRequest("I need a gift for my wife"), true);
  assert.equal(isGenericGiftRequest("I need a watch as a gift"), false);
});

import { prodottoIdentificatoDaSoggetto } from "../lib/assistente/product-relevance.ts";

test("Pino keeps pasta products and rejects unrelated products whose seller attribution contains 'pasta'", () => {
  const fileja = {
    nome: "Fileja di Tropea",
    categoria: "Alimentari",
    descrizione: "Pasta tradizionale calabrese nel formato fileja, confezione da 500 g.",
    descrizione_completa: "La fileja è un formato di pasta tradizionale calabrese, adatto a sughi corposi e condimenti della cucina mediterranea. Confezione da 500 g.",
    parole_chiave: ["fileja", "Tropea", "pasta calabrese", "pasta tipica"],
  };
  const maccheroni = {
    nome: "Maccheroni al ferretto",
    categoria: "Alimentari",
    descrizione: "Pasta tradizionale calabrese, proposta nella selezione demo di Mani in Pasta.",
    parole_chiave: ["pasta", "maccheroni", "ferretto", "farina", "eccellenze calabresi"],
  };
  const taralli = {
    nome: "Taralli calabresi",
    categoria: "Prodotti da forno",
    descrizione: "Taralli da forno, prodotto a base di farina nella selezione demo di Mani in Pasta.",
    parole_chiave: ["taralli", "farina", "forno", "eccellenze calabresi"],
  };
  const biscotti = {
    nome: "Biscotti tradizionali calabresi",
    categoria: "Prodotti da forno",
    descrizione: "Biscotti da forno a base di farina, nella selezione demo di Mani in Pasta.",
    parole_chiave: ["biscotti", "farina", "dolci", "eccellenze calabresi"],
  };

  assert.equal(prodottoIdentificatoDaSoggetto(fileja, "pasta"), true);
  assert.equal(prodottoIdentificatoDaSoggetto(maccheroni, "pasta"), true);
  assert.equal(prodottoIdentificatoDaSoggetto(taralli, "pasta"), false);
  assert.equal(prodottoIdentificatoDaSoggetto(biscotti, "pasta"), false);
  assert.equal(prodottoIdentificatoDaSoggetto(
    { nome: "Anello", categoria: "Gioielli" }, "pasta"
  ), false);
});
