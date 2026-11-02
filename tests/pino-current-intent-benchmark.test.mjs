import test from "node:test";
import assert from "node:assert/strict";
import { pinoBenchmarkCases } from "./fixtures/pino-core-v2-benchmark-cases.mjs";
import { analizzaIntentoPino, pianoIntento } from "../lib/assistente/intent.ts";

function classify(query) {
  const analysis = analizzaIntentoPino(query);
  if (analysis.intent === "generic") {
    return { route: "conversation", surface: "none" };
  }
  const plan = pianoIntento(analysis, query);
  const hasProducts = plan.some((item) => item.tool === "searchProducts");
  const hasStores = plan.some((item) => item.tool === "searchStores");
  const surface = hasProducts && hasStores ? "both"
    : hasProducts ? "products"
    : hasStores ? "stores"
    : "none";
  return { route: "catalog", surface };
}

test("read-only benchmark: current Pino intent layer against labelled corpus", () => {
  const cases = pinoBenchmarkCases.filter((item) =>
    item.expected.route === "catalog" || item.expected.route === "conversation"
  );
  const rows = cases.map((item) => {
    const actual = classify(item.text);
    return {
      id: item.id,
      text: item.text,
      expected: item.expected,
      actual,
      routeOk: actual.route === item.expected.route,
      surfaceOk: actual.surface === item.expected.surface,
    };
  });
  const routeCorrect = rows.filter((row) => row.routeOk).length;
  const surfaceCorrect = rows.filter((row) => row.surfaceOk).length;
  const combinedCorrect = rows.filter((row) => row.routeOk && row.surfaceOk).length;
  const pct = (n) => Number((n / rows.length * 100).toFixed(1));

  console.log("\nCURRENT PINO INTENT LAYER — READ-ONLY BENCHMARK");
  console.log(JSON.stringify({
    scope: "current analizzaIntentoPino + pianoIntento; excludes Gemini semantic planning, conversation orchestration and live catalog retrieval",
    cases: rows.length,
    route: { correct: routeCorrect, accuracyPct: pct(routeCorrect) },
    surface: { correct: surfaceCorrect, accuracyPct: pct(surfaceCorrect) },
    combined: { correct: combinedCorrect, accuracyPct: pct(combinedCorrect) },
    mismatches: rows.filter((row) => !row.routeOk || !row.surfaceOk),
  }, null, 2));

  assert.equal(rows.length, 120, "Expected 120 catalog/conversation benchmark cases");
});
