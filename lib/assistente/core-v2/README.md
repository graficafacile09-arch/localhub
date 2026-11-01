# Pino Core v2 — isolated prototype

This directory is an experimental, non-production implementation.

## Safety boundary

- Nothing in this directory is imported by the production Pino orchestrator.
- No route, page, widget, public search behavior, Supabase query, or database schema is changed.
- The planner is deterministic and side-effect free: no network calls, provider calls, or writes.
- It only returns a structured plan. It does not execute searches or produce user-facing answers.

## First milestone

`request-planner.ts` converts a message into:
- route: conversation, catalog, attractions, events, weather, pharmacies, or unknown;
- surface: products, stores, both, or none;
- language;
- normalized subject/query;
- minimum and maximum price;
- open-now constraint;
- explicit exclusions;
- confidence and clarification requirement.

## Evaluation

Run the isolated tests with:

```bash
node --experimental-strip-types --test tests/pino-core-v2.test.mjs
```

The project Pino test suite also includes these cases through `npm run test:pino`.

## Next milestones

1. Compare this planner with the current planner against a labelled set of real user requests.
2. Add an evidence-based retrieval ranker that keeps seller metadata separate from product identity.
3. Add conversation-state merging and explicit uncertainty handling.
4. Add a read-only adapter to existing public search functions.
5. Keep the entire v2 path behind an explicit experimental flag until it passes offline tests and a preview-only runtime test.

Do not connect this prototype to production or merge it into `main` until the user has reviewed the comparison results and explicitly approved the next step.
