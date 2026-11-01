import { performance } from "node:perf_hooks";
import { pinoBenchmarkCases } from "../tests/fixtures/pino-core-v2-benchmark-cases.mjs";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";
import { planPinoCoreRequestWithAI } from "../lib/assistente/core-v2/ai-request-planner.ts";

if (process.env.PINO_RUN_LIVE_BENCHMARK !== "1") {
  throw new Error("Live Gemini benchmark is disabled. Set PINO_RUN_LIVE_BENCHMARK=1 to confirm paid/provider calls.");
}
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing; no live calls were made.");
}

const requestedLimit = Number(process.env.PINO_BENCHMARK_LIMIT ?? 10);
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > pinoBenchmarkCases.length) {
  throw new Error(`PINO_BENCHMARK_LIMIT must be an integer from 1 to ${pinoBenchmarkCases.length}.`);
}

const cases = pinoBenchmarkCases.slice(0, requestedLimit);
const results = [];
let aiCalls = 0;
let fallbacks = 0;
let aiLatencyTotalMs = 0;

for (const item of cases) {
  const deterministic = planPinoCoreRequest(item.text);
  const shouldCallAI = Boolean(item.text.trim()) &&
    deterministic.route !== "conversation" &&
    !["weather", "pharmacies", "events", "attractions"].includes(deterministic.route);
  const started = performance.now();
  const actual = await planPinoCoreRequestWithAI(item.text);
  const elapsedMs = Math.round(performance.now() - started);
  const usedAI = typeof actual.reason === "string" && actual.reason.startsWith("ai:");
  if (usedAI) {
    aiCalls += 1;
    aiLatencyTotalMs += elapsedMs;
  } else if (shouldCallAI) {
    fallbacks += 1;
  }
  results.push({
    id: item.id,
    text: item.text,
    expected: item.expected,
    actual: { route: actual.route, surface: actual.surface, query: actual.query, subject: actual.subject, reason: actual.reason },
    elapsedMs,
    usedAI,
  });
}

const routeCorrect = results.filter((r) => r.actual.route === r.expected.route).length;
const surfaceCorrect = results.filter((r) => r.actual.surface === r.expected.surface).length;
const combinedCorrect = results.filter((r) =>
  r.actual.route === r.expected.route && r.actual.surface === r.expected.surface
).length;
const mismatches = results.filter((r) =>
  r.actual.route !== r.expected.route || r.actual.surface !== r.expected.surface
);

console.log(JSON.stringify({
  benchmark: "Pino Core v2 live Gemini planner",
  model: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash (fallback)",
  cases: results.length,
  routeAccuracyPercent: Number((routeCorrect / results.length * 100).toFixed(1)),
  surfaceAccuracyPercent: Number((surfaceCorrect / results.length * 100).toFixed(1)),
  combinedAccuracyPercent: Number((combinedCorrect / results.length * 100).toFixed(1)),
  aiCalls,
  aiCallSuccessRatePercent: aiCalls + fallbacks
    ? Number((aiCalls / (aiCalls + fallbacks) * 100).toFixed(1))
    : null,
  fallbackCount: fallbacks,
  averageAiLatencyMs: aiCalls ? Math.round(aiLatencyTotalMs / aiCalls) : null,
  mismatches,
  results,
  limitations: [
    "Only route and surface are hand-labelled in the current corpus; query/subject/attributes require additional labels before those metrics can be scored.",
    "Gemini token usage and monetary cost are not returned by the current callGeminiText wrapper.",
    "Deterministic special routes bypass Gemini by design.",
  ],
}, null, 2));
