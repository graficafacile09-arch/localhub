/**
 * LocalHub Brain — Ranking
 *
 * Gestisce il ranking semantico dei risultati di ricerca.
 * Affianca (non sostituisce) il ranking lessicale esistente in lib/ranking-negozi.ts.
 *
 * Due componenti principali:
 * - Semantic Ranker: classifica per similarità coseno degli embeddings
 * - Score Combiner: combina score lessicale + semantico in un punteggio finale
 *
 * Il peso del ranking semantico è configurabile tramite BRAIN_RANKING_SEMANTIC_WEIGHT.
 * Default: 60% semantico, 40% lessicale.
 *
 * Se il Semantic Ranker non è disponibile (embeddings non configurati),
 * il sistema usa solo il punteggio lessicale esistente.
 *
 * Implementazione prevista nei task successivi:
 * - semantic-ranker.ts → ranking con similarità coseno
 * - score-combiner.ts  → combina score lessicale + semantico
 *
 * @module lib/brain/ranking
 */

export {
  combineScores,
  applyCombiner,
  sortByCombinedScore,
} from "./score-combiner";
