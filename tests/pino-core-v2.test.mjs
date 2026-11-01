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

test("commercial and professional services are routed to stores", () => {
  for (const text of [
    "Dove trovo un commercialista",
    "Mi serve un fotografo",
    "Mi trovi un sarto",
    "Show me electricians",
    "I need a cleaning service",
  ]) {
    const plan = planPinoCoreRequest(text);
    assert.equal(plan.route, "catalog", text);
    assert.equal(plan.surface, "stores", text);
  }
});

test("explicit food shopping request is routed to products", () => {
  const plan = planPinoCoreRequest("Mi serve del pane");
  assert.equal(plan.route, "catalog");
  assert.equal(plan.surface, "products");
});

test("search framing is removed while the actual product subject is preserved", () => {
  const cases = [
    ["Mi trovi del pane", "pane"],
    ["Vorrei comprare olio extravergine", "olio extravergine"],
    ["Sto cercando formaggio", "formaggio"],
    ["Mi servono scarpe", "scarpe"],
    ["Dove compro un portafoglio", "portafoglio"],
    ["Find a pair of jeans", "jeans"],
  ];
  for (const [text, expected] of cases) {
    const plan = planPinoCoreRequest(text);
    assert.equal(plan.route, "catalog", text);
    assert.equal(plan.query, expected, text);
    assert.equal(plan.subject, expected.split(" ")[0], text);
  }
});

test("attractions requests never fall through to product search", () => {
  for (const text of [
    "Cosa posso visitare a Castrovillari?",
    "Quali luoghi interessanti ci sono?",
    "Places to visit nearby",
  ]) {
    const plan = planPinoCoreRequest(text);
    assert.equal(plan.route, "attractions", text);
    assert.equal(plan.surface, "none", text);
  }
});

test("events requests are routed independently from attractions", () => {
  for (const text of [
    "Quali concerti ci sono questo weekend?",
    "Cerca le sagre",
    "Cosa succede stasera in città?",
    "Any concerts this weekend?",
  ]) {
    assert.equal(planPinoCoreRequest(text).route, "events", text);
  }
});

test("weather and pharmacy requests use their dedicated routes", () => {
  assert.equal(planPinoCoreRequest("Che tempo fa domani?").route, "weather");
  assert.equal(planPinoCoreRequest("Pioverà oggi?").route, "weather");
  assert.equal(planPinoCoreRequest("Quale farmacia è di turno?").route, "pharmacies");
});

test("conversation messages do not trigger a catalog search", () => {
  for (const text of [
    "Ciao Pino, come stai?",
    "Buongiorno Pino",
    "Come va oggi?",
    "Grazie mille",
    "Perfetto, grazie",
    "Hey, how are you?",
    "Thanks for your help",
    "Tell me a joke",
  ]) {
    const plan = planPinoCoreRequest(text);
    assert.equal(plan.route, "conversation", text);
    assert.equal(plan.surface, "none", text);
  }
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
