import assert from "node:assert/strict";
import test from "node:test";
import { summarizePinoLiveBenchmarkDiagnostics } from "../scripts/pino-live-benchmark-metrics.mjs";

test("live benchmark metrics count only real provider attempts", () => {
  const metrics = summarizePinoLiveBenchmarkDiagnostics([
    { outcome: "ai_accepted", attempted: true, durationMs: 120, reason: "accepted" },
    { outcome: "provider_error", attempted: true, durationMs: 300, reason: "http_503" },
    { outcome: "timeout", attempted: true, durationMs: 500, reason: "timeout" },
    { outcome: "ai_skipped", attempted: false, durationMs: 0, reason: "deterministic_route" },
    { outcome: "fallback_invalid_plan", attempted: true, durationMs: 200, reason: "invalid_plan" },
  ]);

  assert.equal(metrics.aiAttempts, 4);
  assert.equal(metrics.aiAccepted, 1);
  assert.equal(metrics.aiAcceptancePercent, 25);
  assert.equal(metrics.averageAiLatencyMs, 280);
  assert.equal(metrics.skipped, 1);
  assert.equal(metrics.providerErrors, 1);
  assert.equal(metrics.timeouts, 1);
  assert.equal(metrics.fallbackInvalidPlan, 1);
  assert.equal(metrics.otherFallbacks, 2);
  assert.deepEqual(metrics.errorDistribution, {
    ai_accepted: 1,
    provider_error: 1,
    timeout: 1,
    ai_skipped: 1,
    fallback_invalid_plan: 1,
  });
  assert.equal(metrics.failureReasons["provider_error: http_503"], 1);
});

test("live benchmark metrics return null rates and latency when no provider call was attempted", () => {
  const metrics = summarizePinoLiveBenchmarkDiagnostics([
    { outcome: "ai_skipped", attempted: false, durationMs: 0, reason: "deterministic_route" },
  ]);

  assert.equal(metrics.aiAttempts, 0);
  assert.equal(metrics.aiAccepted, 0);
  assert.equal(metrics.aiAcceptancePercent, null);
  assert.equal(metrics.averageAiLatencyMs, null);
});
