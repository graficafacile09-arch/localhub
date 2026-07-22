/**
 * LocalHub Brain — Entry Point
 *
 * Modulo di intelligenza artificiale trasversale per LocalHub.
 * Fornisce capacità avanzate di ricerca semantica, ranking intelligente,
 * memoria contestuale e ragionamento multi-step.
 *
 * Questo è l'unico punto di accesso pubblico al modulo Brain.
 * Tutto il resto del codice deve importare solo da questo file.
 *
 * @module lib/brain
 */

import { isBrainEnabled } from "./config";
import { BrainOrchestratorImpl } from "./orchestrator/brain-orchestrator";
import type { BrainResult } from "./types";
import type { OrchestratorSearchResult } from "./orchestrator/brain-orchestrator";

export const BRAIN_VERSION = "1.0.0-alpha";

// Istanza singleton dell'orchestratore
let orchestratorInstance: BrainOrchestratorImpl | null = null;

function getOrchestrator(): BrainOrchestratorImpl {
  if (!orchestratorInstance) {
    orchestratorInstance = new BrainOrchestratorImpl();
  }
  return orchestratorInstance;
}

/**
 * Esegue una ricerca completa con Brain.
 * Ritorna null se Brain non è abilitato.
 */
export async function brainSearch(
  query: string,
  options?: {
    userId?: string;
    sessionId?: string;
    useMemory?: boolean;
  }
): Promise<BrainResult<OrchestratorSearchResult> | null> {
  if (!isBrainEnabled()) {
    return null;
  }

  const orchestrator = getOrchestrator();
  return orchestrator.search(query, options);
}

/**
 * Esegue solo il ranking semantico su una lista di candidati esistenti.
 * Ritorna null se Brain non è abilitato.
 */
export async function brainRank<T extends { id: string }>(
  items: T[],
  query: string
): Promise<T[] | null> {
  if (!isBrainEnabled()) {
    return null;
  }

  const orchestrator = getOrchestrator();
  const result = await orchestrator.rank(items, query);

  return result?.data ?? null;
}

/**
 * Arricchisce un contesto esistente con dati Brain.
 * Al momento ritorna null (verrà implementato nei task successivi).
 */
export async function brainEnrich(context: unknown): Promise<unknown | null> {
  if (!isBrainEnabled()) {
    return null;
  }

  // TODO: implementare nei task successivi
  return null;
}

// Re-export dei tipi pubblici
export type { BrainResult, BrainContext, BrainCandidate } from "./types";
export type { OrchestratorSearchResult } from "./orchestrator/brain-orchestrator";
export type { DecisionPlan, DecisionStrategy } from "./reasoning/decision-engine";
export { isBrainEnabled, getBrainConfig } from "./config";
export { makeDecision } from "./reasoning/decision-engine";
export { classifyIntent } from "./reasoning/steps/classify";
