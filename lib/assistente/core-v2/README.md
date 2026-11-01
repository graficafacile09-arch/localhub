# Pino Core v2 — isolated prototype

This directory is an experimental, non-production implementation.

## Safety boundary

- Nothing in this directory is imported by the production Pino orchestrator.
- No route, page, widget, public search behavior, Supabase query, or database schema is changed.
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

`request-planner.ts` is the offline deterministic baseline.
`ai-request-planner.ts` is the new structured AI planner. It accepts recent conversation context and supports an injected model function for offline tests. It is not connected to Pino.

## Evaluation

Run the isolated planner tests with:

```bash
node --experimental-strip-types --test tests/pino-core-v2.test.mjs tests/pino-core-v2-ai-planner.test.mjs
```

The project Pino test suite also includes these cases through `npm run test:pino`.

## Next milestones

1. Build a labelled corpus of at least 165 realistic requests, including typos, colloquial language, elliptical follow-ups, mixed intents and explicit constraints.
2. Compare the current planner, deterministic v2 and AI v2 against the same expected structured plans.
3. Report route accuracy, subject/query accuracy, constraint extraction, false-positive searches, clarification quality, latency and provider fallback rate.
4. Add conversation-state merging and explicit uncertainty handling.
5. Only after offline comparison, consider a read-only adapter to existing public search functions behind an explicit experimental flag.

Do not connect this prototype to the assistant, merge it into `main`, or deploy it to production until the user has reviewed the comparison results and explicitly approved the next step.
