/**
 * LocalHub Brain — Reasoning
 *
 * Gestisce il ragionamento multi-step sulle query degli utenti.
 * Prima di passare la query all'LLM, il reasoning classifica l'intento,
 * espande i termini in modo intelligente e sintetizza la risposta finale.
 *
 * Step della chain di ragionamento:
 * 1. Classify  → classifica l'intenzione (ricerca diretta, bisogno espresso, urgenza...)
 * 2. Expand    → espande la query con sinonimi e termini correlati (via LLM)
 * 3. Synthesize → assembla la risposta finale combinando i risultati
 *
 * La chain è configurabile: ogni step può essere abilitato o saltato.
 * Se un step fallisce, la chain continua con l'output dello step precedente.
 *
 * Implementazione prevista nei task successivi:
 * - chain.ts              → orchestratore degli step
 * - steps/classify.ts     → classificazione intento
 * - steps/expand.ts       → espansione semantica query
 * - steps/synthesize.ts   → sintesi risposta finale
 *
 * @module lib/brain/reasoning
 */

export { classifyIntent } from "./steps/classify";
export { expandQuery } from "./steps/expand";
export { synthesizeResponse } from "./steps/synthesize";
export { makeDecision } from "./decision-engine";
export type { DecisionPlan, DecisionStrategy } from "./decision-engine";
