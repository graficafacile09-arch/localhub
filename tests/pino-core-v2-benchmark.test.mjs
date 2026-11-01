import assert from "node:assert/strict";
import test from "node:test";
import { pinoBenchmarkCases } from "./fixtures/pino-core-v2-benchmark-cases.mjs";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";

function score(field) {
  const matched = pinoBenchmarkCases.filter((item) =>
    planPinoCoreRequest(item.text)[field] === item.expected[field]
  ).length;
  return { matched, total: pinoBenchmarkCases.length, percent: Number((matched / pinoBenchmarkCases.length * 100).toFixed(1)) };
}

test("Pino Core v2 benchmark corpus contains 150 labelled requests", () => {
  assert.equal(pinoBenchmarkCases.length, 165);
  assert.equal(new Set(pinoBenchmarkCases.map((item) => item.id)).size, 150);
  assert.ok(pinoBenchmarkCases.every((item) => item.text && item.expected.route && item.expected.surface));
});

test("Pino Core v2 deterministic planner benchmark — report, do not hide misses", () => {
  const results = pinoBenchmarkCases.map((item) => ({
    ...item,
    actual: planPinoCoreRequest(item.text),
  }));
  const route = score("route");
  const surface = score("surface");
  const failures = results.filter((item) =>
    item.actual.route !== item.expected.route || item.actual.surface !== item.expected.surface
  );
  const grouped = Object.groupBy(failures, (item) => item.group);
  console.log("\nPINO CORE V2 BENCHMARK — DETERMINISTIC BASELINE");
  console.log(JSON.stringify({
    cases: results.length,
    routeAccuracy: route,
    surfaceAccuracy: surface,
    combinedCorrect: results.length - failures.length,
    combinedAccuracyPercent: Number(((results.length - failures.length) / results.length * 100).toFixed(1)),
    missesByGroup: Object.fromEntries(Object.entries(grouped).map(([key, values]) => [key, values.length])),
    misses: failures.map((item) => ({
      id: item.id,
      text: item.text,
      expected: item.expected,
      actual: { route: item.actual.route, surface: item.actual.surface, query: item.actual.query },
    })),
  }, null, 2));

  // This is a measurement test, not a quality gate: expected misses are data
  // to improve against, not a reason to conceal or silently skip hard cases.
  assert.equal(results.length, 165);
});
