import { performance } from "node:perf_hooks";
import { pinoBenchmarkCases } from "../tests/fixtures/pino-core-v2-benchmark-cases.mjs";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";
import { planPinoCoreRequestWithAI } from "../lib/assistente/core-v2/ai-request-planner.ts";
import { summarizePinoLiveBenchmarkDiagnostics } from "./pino-live-benchmark-metrics.mjs";

if (process.env.PINO_RUN_LIVE_BENCHMARK !== "1") {
  throw new Error("Live AI benchmark is disabled. Set PINO_RUN_LIVE_BENCHMARK=1 to confirm paid/provider calls.");
}
if (!process.env.GROQ_API_KEY?.trim()) {
  throw new Error("GROQ_API_KEY is missing; no live calls were made.");
}

// Selezione del corpus: senza PINO_BENCHMARK_GROUPS si usano i primi N casi
// dell'intero corpus, esattamente come prima. Con la variabile impostata si
// filtrano i gruppi indicati, mantenendo l'ordine originale dei casi.
const availableGroups = [...new Set(pinoBenchmarkCases.map((item) => item.group))];
const requestedGroups = [...new Set(
  (process.env.PINO_BENCHMARK_GROUPS ?? "")
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean)
)];

if (requestedGroups.length > 0) {
  const unknownGroups = requestedGroups.filter((group) => !availableGroups.includes(group));
  if (unknownGroups.length > 0) {
    throw new Error(
      `Unknown PINO_BENCHMARK_GROUPS value(s): ${unknownGroups.join(", ")}. ` +
      `Available groups: ${availableGroups.join(", ")}.`
    );
  }
}

const selectedCases = requestedGroups.length > 0
  ? pinoBenchmarkCases.filter((item) => requestedGroups.includes(item.group))
  : pinoBenchmarkCases;

if (selectedCases.length === 0) {
  throw new Error("PINO_BENCHMARK_GROUPS selected no benchmark cases; no live calls were made.");
}

const requestedLimit = Number(process.env.PINO_BENCHMARK_LIMIT ?? 10);
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > selectedCases.length) {
  throw new Error(
    `PINO_BENCHMARK_LIMIT must be an integer from 1 to ${selectedCases.length}.`
  );
}

const cases = selectedCases.slice(0, requestedLimit);
const results = [];
let fallbacks = 0;

for (const item of cases) {
  const deterministic = planPinoCoreRequest(item.text);
  const shouldCallAI = Boolean(item.text.trim()) &&
    deterministic.route !== "conversation" &&
    !["weather", "pharmacies", "events", "attractions"].includes(deterministic.route);
  const diagnostics = [];
  const started = performance.now();
  const actual = await planPinoCoreRequestWithAI(item.text, {
    requestId: item.id,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  const elapsedMs = Math.round(performance.now() - started);
  const diagnostic = diagnostics[0] ?? null;
  const usedAI = diagnostic
    ? diagnostic.outcome === "ai_accepted"
    : (typeof actual.reason === "string" && actual.reason.startsWith("ai:"));
  if (usedAI) {

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
    diagnostic: diagnostic
      ? {
          outcome: diagnostic.outcome,
          attempted: diagnostic.attempted,
          httpStatus: diagnostic.httpStatus ?? null,
          durationMs: diagnostic.durationMs,
          reason: diagnostic.reason,
        }
      : null,
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

// Aggregazione isolata e coperta da test: tentativi reali, non piani accettati.
const diagnosticRows = results.map((r) => r.diagnostic).filter(Boolean);
const metrics = summarizePinoLiveBenchmarkDiagnostics(diagnosticRows);

console.log(JSON.stringify({
  benchmark: "Pino Core v2 live Groq planner",
  model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
  cases: results.length,
  totalRequests: results.length,
  aiAcceptedPlans: metrics.aiAccepted,
  deterministicFallbacks: fallbacks,
  providerErrors: metrics.providerErrors,
  timeouts: metrics.timeouts,
  invalidJsonResponses: metrics.invalidJson,
  invalidSchemaResponses: metrics.invalidSchema,
  otherFallbacks: metrics.otherFallbacks,
  aiAcceptancePercent: metrics.aiAcceptancePercent,
  aiCalls: metrics.aiAttempts,
  aiCallSuccessRatePercent: metrics.aiAcceptancePercent,
  fallbackCount: fallbacks,
  averageAiLatencyMs: metrics.averageAiLatencyMs,
  aiAttempts: metrics.aiAttempts,
  errorDistribution: metrics.errorDistribution,
  failureReasons: metrics.failureReasons,
  routeAccuracyPercent: Number((routeCorrect / results.length * 100).toFixed(1)),
  surfaceAccuracyPercent: Number((surfaceCorrect / results.length * 100).toFixed(1)),
  combinedAccuracyPercent: Number((combinedCorrect / results.length * 100).toFixed(1)),
  mismatches,
  results,
  limitations: [
    "Only route and surface are hand-labelled in the current corpus; query/subject/attributes require additional labels before those metrics can be scored.",
    "aiAcceptancePercent uses only requests that actually attempted a provider call (diagnostic.attempted), so it is not comparable with route/surface accuracy.",
    "Requests handled by deterministic special routes are reported as ai_skipped and never reach the provider by design.",
    "Groq token usage and monetary cost are not returned by the current callGroqText wrapper.",
  ],
}, null, 2));
