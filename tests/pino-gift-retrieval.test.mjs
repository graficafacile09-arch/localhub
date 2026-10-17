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
