import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePinoPlannerOutput,
  planPinoCoreRequestWithAI,
} from "../lib/assistente/core-v2/ai-request-planner.ts";

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
