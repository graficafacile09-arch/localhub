import assert from "node:assert/strict";
import test from "node:test";
import {
  isExplicitFoodProductRequest,
  isBroadAttractionsRequest,
} from "../lib/assistente/routing-policy.ts";

test("Italian and English concrete food product requests use the catalog route", () => {
  assert.equal(isExplicitFoodProductRequest("I'm looking for pasta under 5 euros"), true);
  assert.equal(isExplicitFoodProductRequest("Cerco pasta sotto 5 euro"), true);
  assert.equal(isExplicitFoodProductRequest("I need some bread"), false);
});

test("broad attractions questions are recognized in both languages", () => {
  assert.equal(isBroadAttractionsRequest("What attractions can I visit in Castrovillari?"), true);
  assert.equal(isBroadAttractionsRequest("Quali attrazioni posso visitare a Castrovillari?"), true);
  assert.equal(isBroadAttractionsRequest("I'm looking for pasta"), false);
});
