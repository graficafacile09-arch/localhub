/**
 * LocalHub Brain — Score Combiner
 *
 * Combina punteggi lessicali e semantici in un unico score finale.
 */

import type { BrainCandidate, RankingScore } from "../types";
import { getBrainConfig } from "../config";

/**
 * Combina i punteggi lessicale e semantico di un candidato.
 * Formula: combined = lexical * (1 - weight) + semantic * weight
 * Se semantic è null, ritorna solo lexical.
 *
 * @param lexical - Punteggio lessicale (da ranking-negozi.ts)
 * @param semantic - Punteggio semantico (da similarità coseno) o null
 * @param weight - Peso del semantic (0-1, default da config)
 */
export function combineScores(
  lexical: number,
  semantic: number | null,
  weight?: number
): RankingScore {
  const actualWeight = weight ?? getBrainConfig().rankingSemanticWeight;

  if (semantic === null) {
    return {
      lexical,
      semantic: null,
      combined: lexical,
      explanation: "Solo ranking lessicale (semantic non disponibile)",
    };
  }

  const combined = lexical * (1 - actualWeight) + semantic * actualWeight;

  return {
    lexical,
    semantic,
    combined,
    explanation: `Combinato: ${(actualWeight * 100).toFixed(0)}% semantico + ${((1 - actualWeight) * 100).toFixed(0)}% lessicale`,
  };
}

/**
 * Applica il combiner a una lista di candidati e aggiorna il combinedScore.
 */
export function applyCombiner(
  candidates: BrainCandidate[],
  weight?: number
): BrainCandidate[] {
  return candidates.map((candidate) => {
    const score = combineScores(
      candidate.lexicalScore,
      candidate.semanticScore,
      weight
    );

    return {
      ...candidate,
      combinedScore: score.combined,
    };
  });
}

/**
 * Ordina i candidati per combined score decrescente.
 */
export function sortByCombinedScore(
  candidates: BrainCandidate[]
): BrainCandidate[] {
  return [...candidates].sort((a, b) => b.combinedScore - a.combinedScore);
}
