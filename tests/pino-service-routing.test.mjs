import assert from "node:assert/strict";
import test from "node:test";
import { analizzaIntentoPino, pianoIntento } from "../lib/assistente/intent.ts";

test("cinema is classified as a local service, never as a product", () => {
  const analysis = analizzaIntentoPino("Voglio andare al cinema");
  assert.equal(analysis.intent, "service");
  assert.equal(analysis.dominio, "service");
  assert.equal(analysis.usaProdotti, false);
  assert.deepEqual(pianoIntento(analysis, "cinema"), [
    { tool: "searchStores", query: "cinema" },
  ]);
});

test("English movie theater requests are classified as local services", () => {
  const analysis = analizzaIntentoPino("I want to go to the movie theater");
  assert.equal(analysis.intent, "service");
  assert.deepEqual(pianoIntento(analysis, "movie theater"), [
    { tool: "searchStores", query: "movie theater" },
  ]);
});
