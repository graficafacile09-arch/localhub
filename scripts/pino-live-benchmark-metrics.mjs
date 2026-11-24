export function summarizePinoLiveBenchmarkDiagnostics(diagnosticRows) {
  const rows = diagnosticRows.filter(Boolean);
  const attempts = rows.filter((diagnostic) => diagnostic.attempted);
  const countOutcome = (outcome) => rows.filter((diagnostic) => diagnostic.outcome === outcome).length;
  const aiAccepted = countOutcome("ai_accepted");
  const aiAttempts = attempts.length;
  const skipped = countOutcome("ai_skipped");
  const providerErrors = countOutcome("provider_error");
  const timeouts = countOutcome("timeout");
  const invalidJson = countOutcome("invalid_json");
  const invalidSchema = countOutcome("invalid_schema");
  const fallbackInvalidPlan = countOutcome("fallback_invalid_plan");
  const errorDistribution = rows.reduce((acc, diagnostic) => {
    acc[diagnostic.outcome] = (acc[diagnostic.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const failureReasons = rows
    .filter((diagnostic) => diagnostic.outcome !== "ai_accepted")
    .reduce((acc, diagnostic) => {
      const key = `${diagnostic.outcome}: ${diagnostic.reason}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  return {
    aiAccepted,
    aiAttempts,
    skipped,
    providerErrors,
    timeouts,
    invalidJson,
    invalidSchema,
    fallbackInvalidPlan,
    otherFallbacks: skipped + fallbackInvalidPlan,
    aiAcceptancePercent: aiAttempts
      ? Number((aiAccepted / aiAttempts * 100).toFixed(1))
      : null,
    averageAiLatencyMs: aiAttempts
      ? Math.round(attempts.reduce((sum, diagnostic) => sum + (diagnostic.durationMs ?? 0), 0) / aiAttempts)
      : null,
    errorDistribution,
    failureReasons,
  };
}
