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

// Parole che appartengono al vincolo di prezzo: non devono mai restare in query.
const PAROLE_VINCOLO =
  /\b(?:sotto|sopra|entro|oltre|massimo|minimo|meno|almeno|tra|euro|euros|eur|non|under|below|over|above|between|up to|no more than|not over|at most|less than|more than|max)\b/i;

// I 15 enunciati del gruppo `budget` del corpus benchmark Core v2, con i valori
// attesi già verificati: [testo, query, minPrice, maxPrice].
const CASI_BUDGET = [
  ["Cerco pasta sotto 5 euro", "pasta", null, 5],
  ["Mi trovi un orologio sotto 100 euro", "orologio", null, 100],
  ["Scarpe tra 50 e 120 euro", "scarpe", 50, 120],
  ["Vorrei una borsa al massimo 80 euro", "borsa", null, 80],
  ["Cerco un regalo meno di 30 euro", "regalo", null, 30],
  ["Mi serve una giacca sopra 40 euro", "giacca", 40, null],
  ["Find a watch under 100 euros", "orologio", null, 100],
  ["Shoes between 40 and 90 euros", "scarpe", 40, 90],
  ["A wallet below 25 euros", "portafoglio", null, 25],
  ["Show me bags up to 60 euros", "borsa", null, 60],
  ["Cerco olio entro 15 euro", "olio", null, 15],
  ["Vorrei biscotti massimo 8 euro", "biscotti", null, 8],
  ["Mi trovi cuffie non oltre 50 euro", "cuffie", null, 50],
  ["Looking for a laptop over 300 euros", "computer portatile", 300, null],
  ["Find perfume at least 20 euros", "profumo", 20, null],
];

test("all 15 benchmark budget cases keep bounds and a constraint-free query", () => {
  for (const [text, query, minPrice, maxPrice] of CASI_BUDGET) {
    const plan = planPinoCoreRequest(text);
    assert.equal(plan.route, "catalog", text);
    assert.equal(plan.surface, "products", text);
    assert.equal(plan.query, query, text);
    assert.equal(plan.minPrice, minPrice, text);
    assert.equal(plan.maxPrice, maxPrice, text);
    assert.equal(plan.subject, query.split(" ")[0], text);
    assert.doesNotMatch(plan.query, PAROLE_VINCOLO, text);
  }
});

test("entro is a maximum bound and never a minimum", () => {
  const plan = planPinoCoreRequest("Cerco olio entro 15 euro");
  assert.equal(plan.query, "olio");
  assert.equal(plan.minPrice, null);
  assert.equal(plan.maxPrice, 15);
  assert.equal(plan.confidence, "high");
  assert.doesNotMatch(plan.query, PAROLE_VINCOLO);
});

test("non oltre is a composed maximum bound and is never read as oltre", () => {
  for (const text of [
    "Mi trovi cuffie non oltre 50 euro",
    "Mi trovi cuffie NON OLTRE 50 euro",
    "Mi trovi cuffie non oltre 50",
  ]) {
    const plan = planPinoCoreRequest(text);
    assert.equal(plan.query, "cuffie", text);
    assert.equal(plan.minPrice, null, text);
    assert.equal(plan.maxPrice, 50, text);
    assert.doesNotMatch(plan.query, PAROLE_VINCOLO, text);
    assert.doesNotMatch(plan.query, /\bnon\b/i, text);
  }
});

test("oltre alone still means a minimum bound", () => {
  const plan = planPinoCoreRequest("Cerco cuffie oltre 50 euro");
  assert.equal(plan.query, "cuffie");
  assert.equal(plan.minPrice, 50);
  assert.equal(plan.maxPrice, null);
  assert.doesNotMatch(plan.query, PAROLE_VINCOLO);
});

test("decimal amounts and decimal ranges are parsed without query residue", () => {
  const cases = [
    ["Cerco pasta sotto 5,50 euro", "pasta", null, 5.5],
    ["Cerco olio entro 12,90 euro", "olio", null, 12.9],
    ["Mi trovi cuffie non oltre 49,90 euro", "cuffie", null, 49.9],
    ["Vorrei scarpe tra 49,90 e 129,90 euro", "scarpe", 49.9, 129.9],
    ["Show me bags between 19.90 and 59.90 euros", "borsa", 19.9, 59.9],
  ];
  for (const [text, query, minPrice, maxPrice] of cases) {
    const plan = planPinoCoreRequest(text);
    assert.equal(plan.query, query, text);
    assert.equal(plan.minPrice, minPrice, text);
    assert.equal(plan.maxPrice, maxPrice, text);
    assert.doesNotMatch(plan.query, PAROLE_VINCOLO, text);
  }
});
