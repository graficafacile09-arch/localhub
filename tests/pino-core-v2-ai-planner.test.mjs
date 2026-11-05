import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePinoPlannerOutput,
  planPinoCoreRequestWithAI,
} from "../lib/assistente/core-v2/ai-request-planner.ts";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";

const catalogPlan = {
  route: "catalog",
  surface: "products",
  language: "it",
  query: "pasta",
  subject: "pasta",
  attributes: ["integrale"],
  exclusions: [],
  confidence: "high",
  needsClarification: false,
  reason: "product_request",
};

/** Esegue il planner raccogliendo le diagnostiche emesse. */
async function esegui(input, plannerCall, extra = {}) {
  const diagnostiche = [];
  const plan = await planPinoCoreRequestWithAI(input, {
    plannerCall,
    onDiagnostic: (d) => diagnostiche.push(d),
    ...extra,
  });
  return { plan, diagnostiche, diagnostica: diagnostiche[0] ?? null };
}

test("AI planner accepts a valid structured JSON response", () => {
  const parsed = parsePinoPlannerOutput(JSON.stringify(catalogPlan));
  assert.equal(parsed?.route, "catalog");
  assert.equal(parsed?.subject, "pasta");
  assert.deepEqual(parsed?.attributes, ["integrale"]);
});

test("AI planner rejects malformed or unsafe route/surface combinations", () => {
  assert.equal(parsePinoPlannerOutput("non è JSON"), null);
  assert.equal(parsePinoPlannerOutput(JSON.stringify({
    ...catalogPlan,
    route: "catalog",
    surface: "none",
  })), null);
  assert.equal(parsePinoPlannerOutput(JSON.stringify({
    ...catalogPlan,
    route: "weather",
    surface: "products",
  })), null);
});

test("AI planner handles colloquial phrasing and keeps deterministic budget constraints", async () => {
  const plan = await planPinoCoreRequestWithAI("Mi trovi della pasta sotto 5 euro?", {
    plannerCall: async () => JSON.stringify(catalogPlan),
  });
  assert.equal(plan.route, "catalog");
  assert.equal(plan.query, "pasta");
  assert.equal(plan.maxPrice, 5);
  assert.equal(plan.minPrice, null);
});

test("AI planner falls back without failing when model output is invalid", async () => {
  const plan = await planPinoCoreRequestWithAI("Cerco pasta sotto 5 euro", {
    plannerCall: async () => "risposta non valida",
  });
  assert.equal(plan.route, "catalog");
  assert.equal(plan.query, "pasta");
  assert.equal(plan.maxPrice, 5);
});

test("AI planner preserves deterministic high-confidence conversational routes", async () => {
  let called = false;
  const plan = await planPinoCoreRequestWithAI("Ciao Pino, come stai?", {
    plannerCall: async () => {
      called = true;
      return JSON.stringify(catalogPlan);
    },
  });
  assert.equal(plan.route, "conversation");
  assert.equal(called, false);
});

// --- Diagnostica opzionale -------------------------------------------------

test("diagnostic: valid JSON emits ai_accepted with id, duration and no secrets", async () => {
  const { plan, diagnostica } = await esegui(
    "Mi trovi della pasta sotto 5 euro?",
    async () => JSON.stringify(catalogPlan),
    { requestId: "case-01" },
  );
  assert.equal(diagnostica.outcome, "ai_accepted");
  assert.equal(diagnostica.attempted, true);
  assert.equal(diagnostica.requestId, "case-01");
  assert.equal(diagnostica.httpStatus, undefined);
  assert.equal(typeof diagnostica.durationMs, "number");
  assert.ok(diagnostica.durationMs >= 0);
  assert.equal(plan.maxPrice, 5);
});

test("diagnostic: non-JSON response emits invalid_json, not invalid_schema", async () => {
  const { plan, diagnostica } = await esegui("Cerco pasta sotto 5 euro", async () => "risposta non valida");
  assert.equal(diagnostica.outcome, "invalid_json");
  assert.equal(diagnostica.attempted, true);
  assert.equal(diagnostica.reason, "no_json_object");
  assert.equal(plan.reason.startsWith("ai:"), false);
  assert.equal(plan.maxPrice, 5);
});

test("diagnostic: JSON parse failure is invalid_json", async () => {
  const { diagnostica } = await esegui("Cerco pasta", async () => '{"route": "catalog", "surface": "products",}');
  assert.equal(diagnostica.outcome, "invalid_json");
  assert.equal(diagnostica.reason, "json_parse_error");
});

test("diagnostic: valid JSON with disallowed route/surface emits invalid_schema", async () => {
  const surfaceNone = await esegui(
    "Cerco pasta",
    async () => JSON.stringify({ ...catalogPlan, surface: "none" }),
  );
  assert.equal(surfaceNone.diagnostica.outcome, "invalid_schema");
  assert.equal(surfaceNone.diagnostica.reason, "catalog_requires_query_subject_surface");

  const weatherProducts = await esegui(
    "Cerco pasta",
    async () => JSON.stringify({ ...catalogPlan, route: "weather", surface: "products" }),
  );
  assert.equal(weatherProducts.diagnostica.outcome, "invalid_schema");
  assert.equal(weatherProducts.diagnostica.reason, "non_catalog_requires_surface_none");
});

test("diagnostic: simulated HTTP 503 emits provider_error with the status code", async () => {
  const { plan, diagnostica } = await esegui("Cerco pasta sotto 5 euro", async () => {
    throw Object.assign(new Error("Errore server Gemini (HTTP 503, UNAVAILABLE)."), { status: 503 });
  });
  assert.equal(diagnostica.outcome, "provider_error");
  assert.equal(diagnostica.attempted, true);
  assert.equal(diagnostica.httpStatus, 503);
  assert.match(diagnostica.reason, /gemini_provider_error/);
  assert.equal(plan.maxPrice, 5);
  assert.equal(plan.reason.startsWith("ai:"), false);
});

test("diagnostic: simulated timeout is reported separately from provider errors", async () => {
  const timeoutError = new Error("Timeout chiamata Gemini (12s).");
  timeoutError.name = "TimeoutError";
  const { plan, diagnostica } = await esegui("Cerco pasta", async () => { throw timeoutError; });
  assert.equal(diagnostica.outcome, "timeout");
  assert.equal(diagnostica.attempted, true);
  assert.equal(diagnostica.httpStatus, undefined);
  assert.match(diagnostica.reason, /gemini_timeout/);
  assert.equal(plan.reason.startsWith("ai:"), false);

  const abortError = new DOMException("The operation was aborted.", "AbortError");
  const aborted = await esegui("Cerco pasta", async () => { throw abortError; });
  assert.equal(aborted.diagnostica.outcome, "timeout");
});

test("diagnostic: missing callback keeps the planner behaviour unchanged", async () => {
  const conCallback = await planPinoCoreRequestWithAI("Cerco pasta sotto 5 euro", {
    plannerCall: async () => JSON.stringify(catalogPlan),
    onDiagnostic: () => {},
  });
  const senzaCallback = await planPinoCoreRequestWithAI("Cerco pasta sotto 5 euro", {
    plannerCall: async () => JSON.stringify(catalogPlan),
  });
  assert.deepEqual(senzaCallback, conCallback);
});

test("diagnostic: a throwing callback never breaks the planner", async () => {
  const plan = await planPinoCoreRequestWithAI("Cerco pasta sotto 5 euro", {
    plannerCall: async () => JSON.stringify(catalogPlan),
    onDiagnostic: () => { throw new Error("callback rotta"); },
  });
  assert.equal(plan.route, "catalog");
  assert.equal(plan.query, "pasta");
  assert.equal(plan.reason.startsWith("ai:"), true);
});

test("diagnostic: deterministic fallback stays identical to the offline planner", async () => {
  const atteso = planPinoCoreRequest("Cerco pasta sotto 5 euro");
  const { plan, diagnostica } = await esegui("Cerco pasta sotto 5 euro", async () => "non json");
  assert.deepEqual(plan, atteso);
  assert.equal(diagnostica.attempted, true);
});

test("diagnostic: deterministic price filters survive both accepted and fallback plans", async () => {
  const accettato = await esegui("Cerco pasta sotto 5 euro", async () => JSON.stringify(catalogPlan));
  assert.equal(accettato.plan.maxPrice, 5);
  assert.equal(accettato.plan.minPrice, null);

  const fallback = await esegui("Cerco pasta sotto 5 euro", async () => { throw new Error("HTTP 500"); });
  assert.equal(fallback.plan.maxPrice, 5);
  assert.equal(fallback.plan.minPrice, null);
  assert.equal(fallback.diagnostica.httpStatus, 500);
});

test("diagnostic: early deterministic routes emit ai_skipped and never call the provider", async () => {
  let chiamato = false;
  const { plan, diagnostica } = await esegui("Ciao Pino, come stai?", async () => {
    chiamato = true;
    return JSON.stringify(catalogPlan);
  });
  assert.equal(chiamato, false);
  assert.equal(plan.route, "conversation");
  assert.equal(diagnostica.outcome, "ai_skipped");
  assert.equal(diagnostica.attempted, false);
});

test("diagnostic: public PinoCorePlan contract is unchanged", async () => {
  const plan = await planPinoCoreRequestWithAI("Cerco pasta sotto 5 euro", {
    plannerCall: async () => JSON.stringify(catalogPlan),
  });
  assert.deepEqual(Object.keys(plan).sort(), [
    "attributes",
    "confidence",
    "exclusions",
    "language",
    "maxPrice",
    "minPrice",
    "needsClarification",
    "openNow",
    "original",
    "query",
    "reason",
    "route",
    "subject",
    "surface",
  ]);
});

// --- Vincoli di prezzo nel piano AI ---------------------------------------

/** Risposta modello "pulita": nessun campo prezzo, che il modello non possiede. */
function rispostaCatalogue(over = {}) {
  return JSON.stringify({
    route: "catalog",
    surface: "products",
    language: "it",
    query: "pasta",
    subject: "pasta",
    attributes: [],
    exclusions: [],
    confidence: "high",
    needsClarification: false,
    reason: "product_request",
    ...over,
  });
}

// Casi obbligatori: [testo, query attesa, minPrice, maxPrice].
const CASI_VINCOLI = [
  ["Cerco pasta sotto 5 euro", "pasta", null, 5],
  ["Vorrei scarpe tra 50 e 120 euro", "scarpe", 50, 120],
  ["Mi serve una giacca sopra 40 euro", "giacca", 40, null],
  ["Cerco olio entro 15 euro", "olio", null, 15],
  ["Mi trovi cuffie non oltre 50 euro", "cuffie", null, 50],
];

test("accepted AI plan keeps deterministic price bounds with the model query and subject", async () => {
  for (const [testo, query, minPrice, maxPrice] of CASI_VINCOLI) {
    const plan = await planPinoCoreRequestWithAI(testo, {
      plannerCall: async () => rispostaCatalogue({ query, subject: query }),
    });
    assert.equal(plan.route, "catalog", testo);
    assert.equal(plan.query, query, testo);
    assert.equal(plan.subject, query, testo);
    assert.equal(plan.minPrice, minPrice, testo);
    assert.equal(plan.maxPrice, maxPrice, testo);
    assert.ok(plan.reason.startsWith("ai:"), testo);
  }
});

test("Gemini cannot overwrite, clear or invert deterministic price bounds", async () => {
  const tentativi = [
    ["Cerco pasta sotto 5 euro", "pasta", { minPrice: 0, maxPrice: 9999 }, null, 5],
    ["Vorrei scarpe tra 50 e 120 euro", "scarpe", { minPrice: 120, maxPrice: 50 }, 50, 120],
    ["Vorrei scarpe tra 50 e 120 euro", "scarpe", { minPrice: null, maxPrice: null }, 50, 120],
    ["Mi serve una giacca sopra 40 euro", "giacca", { minPrice: 1, maxPrice: 1 }, 40, null],
  ];
  for (const [testo, query, extra, minPrice, maxPrice] of tentativi) {
    const plan = await planPinoCoreRequestWithAI(testo, {
      plannerCall: async () => rispostaCatalogue({ query, subject: query, ...extra }),
    });
    assert.ok(plan.reason.startsWith("ai:"), testo);
    assert.equal(plan.minPrice, minPrice, testo);
    assert.equal(plan.maxPrice, maxPrice, testo);
  }
});

test("the parser drops any price key invented by the model", () => {
  const parsed = parsePinoPlannerOutput(JSON.stringify({
    ...catalogPlan,
    minPrice: 1,
    maxPrice: 2,
  }));
  assert.ok(parsed);
  assert.equal("minPrice" in parsed, false);
  assert.equal("maxPrice" in parsed, false);
});

test("price bounds survive when the model downgrades the route to unknown", async () => {
  const plan = await planPinoCoreRequestWithAI("Cerco pasta sotto 5 euro", {
    plannerCall: async () => rispostaCatalogue({
      route: "unknown",
      surface: "none",
      query: "",
      subject: null,
    }),
  });
  assert.equal(plan.route, "unknown");
  assert.equal(plan.query, "");
  assert.equal(plan.subject, null);
  assert.equal(plan.minPrice, null);
  assert.equal(plan.maxPrice, 5);
});

test("the five mandatory cases match the offline planner when the model output is invalid", async () => {
  for (const [testo] of CASI_VINCOLI) {
    const plan = await planPinoCoreRequestWithAI(testo, {
      plannerCall: async () => "risposta non valida",
    });
    assert.deepEqual(plan, planPinoCoreRequest(testo), testo);
  }
});
