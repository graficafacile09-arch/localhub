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
let aiCalls = 0;
let fallbacks = 0;
let aiLatencyTotalMs = 0;

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

// Aggregazione diagnostica: si contano solo i casi che hanno davvero tentato
// la chiamata al provider per la percentuale di accettazione AI.
const diagnosticRows = results.map((r) => r.diagnostic).filter(Boolean);
const attempts = diagnosticRows.filter((d) => d.attempted);
const countOutcome = (outcome) => diagnosticRows.filter((d) => d.outcome === outcome).length;
const aiAccepted = countOutcome("ai_accepted");
const skipped = countOutcome("ai_skipped");
const providerErrors = countOutcome("provider_error");
const timeouts = countOutcome("timeout");
const invalidJson = countOutcome("invalid_json");
const invalidSchema = countOutcome("invalid_schema");
const fallbackInvalidPlan = countOutcome("fallback_invalid_plan");
const otherFallbacks = skipped + fallbackInvalidPlan;

const errorDistribution = diagnosticRows.reduce((acc, d) => {
  acc[d.outcome] = (acc[d.outcome] ?? 0) + 1;
  return acc;
}, {});
const failureReasons = diagnosticRows
  .filter((d) => d.outcome !== "ai_accepted")
  .reduce((acc, d) => {
    const chiave = `${d.outcome}: ${d.reason}`;
    acc[chiave] = (acc[chiave] ?? 0) + 1;
    return acc;
  }, {});

console.log(JSON.stringify({
  benchmark: "Pino Core v2 live Gemini planner",
  model: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash (fallback)",
  cases: results.length,
  totalRequests: results.length,
  aiAcceptedPlans: aiAccepted,
  deterministicFallbacks: fallbacks,
  providerErrors,
  timeouts,
  invalidJsonResponses: invalidJson,
  invalidSchemaResponses: invalidSchema,
  otherFallbacks,
  aiAcceptancePercent: attempts.length
    ? Number((aiAccepted / attempts.length * 100).toFixed(1))
    : null,
  aiCalls,
  aiCallSuccessRatePercent: aiCalls + fallbacks
    ? Number((aiCalls / (aiCalls + fallbacks) * 100).toFixed(1))
    : null,
  fallbackCount: fallbacks,
  averageAiLatencyMs: aiCalls ? Math.round(aiLatencyTotalMs / aiCalls) : null,
  averageAiAttemptLatencyMs: attempts.length
    ? Math.round(attempts.reduce((sum, d) => sum + (d.durationMs ?? 0), 0) / attempts.length)
    : null,
  aiAttempts: attempts.length,
  errorDistribution,
  failureReasons,
  routeAccuracyPercent: Number((routeCorrect / results.length * 100).toFixed(1)),
  surfaceAccuracyPercent: Number((surfaceCorrect / results.length * 100).toFixed(1)),
  combinedAccuracyPercent: Number((combinedCorrect / results.length * 100).toFixed(1)),
  mismatches,
  results,
  limitations: [
    "Only route and surface are hand-labelled in the current corpus; query/subject/attributes require additional labels before those metrics can be scored.",
    "aiAcceptancePercent uses only requests that actually attempted a provider call (diagnostic.attempted), so it is not comparable with route/surface accuracy.",
    "Requests handled by deterministic special routes are reported as ai_skipped and never reach the provider by design.",
    "Gemini token usage and monetary cost are not returned by the current callGeminiText wrapper.",
  ],
}, null, 2));
