import assert from "node:assert/strict";
import test from "node:test";
import { pinoBenchmarkCases } from "./fixtures/pino-core-v2-benchmark-cases.mjs";
import { pianoIntentoLocale } from "../lib/assistente/local-intents.ts";
import { isBroadAttractionsRequest, isExplicitFoodProductRequest } from "../lib/assistente/routing-policy.ts";

/**
 * Read-only adapter over production's existing deterministic routing gates.
 * It deliberately does NOT pretend to execute the full production pipeline:
 * semantic Gemini planning, conversation state and retrieval are not invoked.
 */
function classifyExistingDeterministicGates(text) {
  const local = pianoIntentoLocale(text);
  if (local?.tool === "getWeather") return { route: "weather", surface: "none", source: "local-intents" };
  if (local?.tool === "searchPharmacies") return { route: "pharmacies", surface: "stores", source: "local-intents" };
  if (isBroadAttractionsRequest(text)) return { route: "attractions", surface: "none", source: "routing-policy" };
  if (isExplicitFoodProductRequest(text)) return { route: "catalog", surface: "products", source: "routing-policy" };
  return { route: "deferred", surface: "none", source: "semantic-planner-or-other-layer" };
}

test("Existing Pino deterministic gates — read-only benchmark on the same 165 cases", () => {
  assert.equal(pinoBenchmarkCases.length, 165);
  const rows = pinoBenchmarkCases.map((item) => ({
    ...item,
    actual: classifyExistingDeterministicGates(item.text),
  }));
  const handled = rows.filter((row) => row.actual.route !== "deferred");
  const correct = handled.filter((row) =>
    row.actual.route === row.expected.route && row.actual.surface === row.expected.surface
  );
  const wrong = handled.filter((row) =>
    row.actual.route !== row.expected.route || row.actual.surface !== row.expected.surface
  );
  const deferredByGroup = Object.groupBy(rows.filter((row) => row.actual.route === "deferred"), (row) => row.group);
  const errors = wrong.map((row) => ({
    id: row.id, text: row.text, expected: row.expected, actual: row.actual,
  }));
  console.log("\nCURRENT PINO — DETERMINISTIC GATES ONLY (NOT FULL PIPELINE)");
  console.log(JSON.stringify({
    cases: rows.length,
    deterministicCoverage: { handled: handled.length, total: rows.length, percent: Number((handled.length / rows.length * 100).toFixed(1)) },
    accuracyWhenHandled: { correct: correct.length, handled: handled.length, percent: handled.length ? Number((correct.length / handled.length * 100).toFixed(1)) : 0 },
    correctOfAllCases: { correct: correct.length, total: rows.length, percent: Number((correct.length / rows.length * 100).toFixed(1)) },
    deferredByGroup: Object.fromEntries(Object.entries(deferredByGroup).map(([key, values]) => [key, values.length])),
    mismatches: errors,
    scope: "Pure production routing helpers only; Gemini semantic planner, intent layer, conversation orchestration and catalog retrieval are intentionally not simulated.",
  }, null, 2));
  assert.equal(rows.length, 165);
});
