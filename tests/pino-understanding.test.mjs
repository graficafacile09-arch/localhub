import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizzaQueryCatalogo,
  rilevaLinguaPino,
} from "../lib/assistente/understanding.ts";

test("English budget and alternative wording reduce to the catalog subject", () => {
  const request = "I want a watch under 100 euros, or something similar";
  assert.equal(rilevaLinguaPino(request), "en");
  assert.equal(normalizzaQueryCatalogo(request), "watch");
});

test("Colloquial English budget wording does not pollute the query", () => {
  assert.equal(
    normalizzaQueryCatalogo("I have 100 euros and want a watch"),
    "watch",
  );
});

test("English product attributes are preserved", () => {
  assert.equal(
    normalizzaQueryCatalogo("I want a watch with a leather strap under 100 euros"),
    "watch with leather strap",
  );
});

test("Italian product attributes are preserved", () => {
  assert.equal(
    normalizzaQueryCatalogo("scarpe da uomo eleganti sotto 100 euro"),
    "scarpe da uomo eleganti",
  );
  assert.equal(rilevaLinguaPino("Ho 100 euro e voglio un orologio"), "it");
});
