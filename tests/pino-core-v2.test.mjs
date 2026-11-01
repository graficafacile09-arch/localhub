import assert from "node:assert/strict";
import test from "node:test";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";

test("Italian product request extracts subject and maximum budget", () => {
  const plan = planPinoCoreRequest("Cerco pasta sotto 5 euro");
  assert.equal(plan.route, "catalog");
  assert.equal(plan.surface, "products");
  assert.equal(plan.query, "pasta");
  assert.equal(plan.maxPrice, 5);
  assert.equal(plan.minPrice, null);
  assert.equal(plan.confidence, "high");
});

test("English product request normalizes catalog subject and budget", () => {
  const plan = planPinoCoreRequest("I'm looking for a watch under 100 euros");
  assert.equal(plan.language, "en");
  assert.equal(plan.route, "catalog");
  assert.equal(plan.query, "orologio");
  assert.equal(plan.maxPrice, 100);
});

test("price ranges are represented as inclusive structured bounds", () => {
  const plan = planPinoCoreRequest("Vorrei scarpe tra 50 e 120 euro");
  assert.equal(plan.query, "scarpe");
  assert.equal(plan.minPrice, 50);
  assert.equal(plan.maxPrice, 120);
});

test("minimum price constraints are extracted", () => {
  const plan = planPinoCoreRequest("Orologi sopra 80 euro");
  assert.equal(plan.query, "orologi");
  assert.equal(plan.minPrice, 80);
  assert.equal(plan.maxPrice, null);
});

test("store requests are routed to stores rather than product search", () => {
  const plan = planPinoCoreRequest("Cerco un parrucchiere aperto ora");
  assert.equal(plan.route, "catalog");
  assert.equal(plan.surface, "stores");
  assert.equal(plan.openNow, true);
});

test("explicit food shopping request is routed to products", () => {
  const plan = planPinoCoreRequest("Mi serve del pane");
  assert.equal(plan.route, "catalog");
  assert.equal(plan.surface, "products");
});

test("attractions requests never fall through to product search", () => {
  const plan = planPinoCoreRequest("Cosa posso visitare a Castrovillari?");
  assert.equal(plan.route, "attractions");
  assert.equal(plan.surface, "none");
});

test("events requests are routed independently from attractions", () => {
  const plan = planPinoCoreRequest("Quali concerti ci sono questo weekend?");
  assert.equal(plan.route, "events");
});

test("weather and pharmacy requests use their dedicated routes", () => {
  assert.equal(planPinoCoreRequest("Che tempo fa domani?").route, "weather");
  assert.equal(planPinoCoreRequest("Quale farmacia è di turno?").route, "pharmacies");
});

test("conversation messages do not trigger a catalog search", () => {
  const plan = planPinoCoreRequest("Ciao Pino, come stai?");
  assert.equal(plan.route, "conversation");
  assert.equal(plan.surface, "none");
});

test("unclear requests ask for clarification instead of launching a random search", () => {
  const plan = planPinoCoreRequest("Qualcosa di bello");
  assert.equal(plan.route, "unknown");
  assert.equal(plan.surface, "none");
  assert.equal(plan.needsClarification, true);
});

test("explicit exclusions are carried into the plan", () => {
  const plan = planPinoCoreRequest("Cerco pasta senza glutine sotto 8 euro");
  assert.equal(plan.maxPrice, 8);
  assert.ok(plan.exclusions.some((item) => item.includes("glutine")));
});
