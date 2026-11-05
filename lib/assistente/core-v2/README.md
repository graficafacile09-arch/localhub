# Pino Core v2 — deterministic planner and experimental modules

This directory contains the deterministic Core V2 planner and experimental
modules. The planner is not the production planner, but it is connected to the
runtime through the Shadow Tier 0 observer.

## Integration status

- `request-planner.ts` is imported by `lib/assistente/shadow/tier0.ts` and is
  executed only after the production response, through `after()` in
  `app/api/assistente/route.ts`.
- The Shadow observes route, surface, price limits and returned products. It
  cannot alter the response, call Gemini, access Supabase or execute `fetch`.
- `request-planner.ts` is not yet used to build the production response. The
  production planner in `lib/assistente/semantica.ts` remains authoritative.
- `request-planner.ts` depends on shared production helpers:
  `../understanding.ts` and `../routing-policy.ts`.
- `ai-request-planner.ts`, `product-evidence-ranker.ts` and
  `production-intent-snapshot.ts` are still experimental/test-only and are not
  imported by the runtime.
- The Shadow does not change route behavior, pages, widgets, public search
  results, Supabase queries or the database schema.
- The deterministic planner is pure. The AI planner is a separate opt-in function and only calls Gemini to obtain a structured plan.
- The AI planner performs no catalog search, database access, writes, or user-facing response generation.
- If Gemini is unavailable, times out, exceeds quota, or returns invalid JSON, the deterministic planner is used unchanged.
- Explicit deterministic routes (conversation, attractions, events, weather and pharmacies) bypass the AI call.

## Planner output

The planner converts a natural-language request into:
- route: conversation, catalog, attractions, events, weather, pharmacies, or unknown;
- surface: products, stores, both, or none;
- language and normalized search query;
- subject and requested attributes;
- minimum and maximum price;
- open-now constraint and explicit exclusions;
- confidence and clarification requirement.

`request-planner.ts` is the deterministic v2 baseline used by the Shadow Tier 0
observer. It is not connected to the production response path.
`ai-request-planner.ts` is the structured AI planner. It accepts recent
conversation context and supports an injected model function for offline tests.
It is not connected to the production Pino runtime.

## Evaluation

Run the complete Pino test and benchmark suite with:

```bash
npm run test:pino
```

The shared labelled corpus is `tests/fixtures/pino-core-v2-benchmark-cases.mjs` (165 cases), covering Italian and English product/store requests, budget and attributes, colloquial and misspelled wording, conversation, attractions, events, weather and pharmacies.

Two separate measurements are emitted:
1. `pino-core-v2-benchmark.test.mjs`: deterministic v2 planner against all 165 expected labels, including route/surface accuracy and every miss.
2. `pino-current-gates-benchmark.test.mjs`: read-only adapter over the existing production deterministic routing helpers (`local-intents.ts` and `routing-policy.ts`). It reports coverage, accuracy among handled cases, deferred categories and mismatches.

**Important comparison limit:** the current-Pino adapter measures only those pure deterministic routing gates. It does not execute the entire production pipeline (semantic Gemini planner, intent layer, conversation-state orchestration, tool selection and catalog retrieval). It must not be described as a full production Pino score. A fair full-pipeline comparison still requires a dedicated read-only adapter and controlled/mocked provider and retrieval boundaries.

The v2 AI planner's existing tests validate JSON parsing, plan validation, deterministic constraint preservation and fallback using injected model responses. They do not represent a live Gemini quality benchmark. A real 165-request model run must be explicitly opt-in, cost-controlled and report latency, provider failures and token usage; it must not run as part of ordinary preview builds.


### Live Gemini benchmark (opt-in only)

The live runner is `scripts/pino-core-v2-live-benchmark.mjs`. It is intentionally excluded from `prebuild` and the normal test suite. It loads `.env.local` when present and requires both `GEMINI_API_KEY` and an explicit `PINO_RUN_LIVE_BENCHMARK=1` opt-in. It defaults to 10 cases to avoid unexpectedly running 165 provider calls.

Example for a small smoke run:

```bash
PINO_RUN_LIVE_BENCHMARK=1 npm run benchmark:pino:live
```

Full corpus (165 requests):

```bash
PINO_RUN_LIVE_BENCHMARK=1 PINO_BENCHMARK_LIMIT=165 npm run benchmark:pino:live
```

The report measures route/surface accuracy, model-call success/fallback and latency. The current hand-labelled corpus does not yet contain gold labels for subject/query/attributes, and the Gemini wrapper does not expose token usage; do not claim those metrics or a monetary cost from this run.

## Next milestones

1. [x] Build a 165-request labelled corpus and deterministic v2 scoring runner.
2. [x] Measure the existing deterministic routing gates separately from the full production pipeline.
3. [ ] Build a read-only adapter for the full current Pino semantic/intent pipeline without editing the production orchestrator.
4. [ ] Run live AI v2 against the same corpus in a controlled environment with explicit cost limits.
5. [ ] Compare route/surface/query accuracy, constraint extraction, false-positive searches, clarification quality, latency and fallback rate.
6. [ ] Add conversation-state merging and explicit uncertainty handling.

The deterministic planner is already connected to the Shadow observer. Do not
connect it to the production response path, merge it into `main`, or deploy it
to production until the user has reviewed the comparison results and explicitly
approved the next step.
