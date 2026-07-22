/**
 * LocalHub Brain — Decision Engine
 *
 * Dopo la classificazione dell'intento, il Decision Engine decide
 * automaticamente quale strategia di ricerca usare e come configurarla.
 *
 * Funziona completamente in locale: nessuna chiamata LLM o rete.
 * Prende il QueryIntent e produce un DecisionPlan che l'Orchestrator
 * usa per configurare la pipeline di retrieval e ranking.
 */

import type { QueryIntent, QueryIntentType } from "../types";

// ─── Strategia ────────────────────────────────────────────────────────────────

/** Strategie di ricerca supportate dal Decision Engine */
export type DecisionStrategy =
  | "DIRECT_SEARCH"    // ricerca diretta per nome/categoria
  | "LOCATION_SEARCH"  // ricerca con vincolo geografico
  | "URGENT_SEARCH"    // ricerca con vincolo temporale (aperto adesso, ecc.)
  | "COMPARISON"       // confronto tra due o più entità
  | "PROBLEM_SOLVING"  // l'utente esprime un bisogno, non una ricerca diretta
  | "GENERAL_SEARCH"   // ricerca generica, nessun intento specifico
  | "UNKNOWN";         // intento non classificabile, richiede chiarimento

// ─── DecisionPlan ─────────────────────────────────────────────────────────────

/** Piano di esecuzione prodotto dal Decision Engine */
export interface DecisionPlan {
  /** Strategia di ricerca selezionata */
  strategy: DecisionStrategy;

  /**
   * Se espandere la query con sinonimi.
   * false per ricerche precise (urgency, location) dove l'espansione
   * rischierebbe di portare risultati fuori contesto.
   */
  useExpansion: boolean;

  /**
   * Se usare il ranking semantico (embeddings).
   * true quando la query esprime un bisogno o una posizione geografica,
   * dove la similarità vettoriale supera il matching lessicale.
   */
  useSemantic: boolean;

  /**
   * Se consultare la memoria dell'utente per personalizzare i risultati.
   * Attivo solo se BRAIN_MEMORY_ENABLED=true e l'utente è identificabile.
   */
  useMemory: boolean;

  /**
   * Se la query è ambigua al punto da richiedere una domanda di chiarimento.
   * Quando true, l'Orchestrator può restituire response con una domanda invece
   * di risultati.
   */
  requireClarification: boolean;

  /** Numero massimo di candidati da recuperare e processare */
  maxCandidates: number;

  /**
   * Soglia minima di confidenza per includere un candidato nei risultati finali.
   * Candidati con combinedScore < threshold vengono scartati.
   */
  confidenceThreshold: number;
}

// ─── Configurazione per strategia ────────────────────────────────────────────

/**
 * Mappa da QueryIntentType a DecisionStrategy.
 */
const INTENT_TO_STRATEGY: Record<QueryIntentType, DecisionStrategy> = {
  direct_search:     "DIRECT_SEARCH",
  location_specific: "LOCATION_SEARCH",
  urgency:           "URGENT_SEARCH",
  comparison:        "COMPARISON",
  need_expression:   "PROBLEM_SOLVING",
  unknown:           "UNKNOWN",
};

/**
 * Configurazione di base per ogni strategia.
 * I valori vengono poi raffinati in base alla confidenza dell'intento.
 */
const STRATEGY_DEFAULTS: Record<DecisionStrategy, Omit<DecisionPlan, "strategy">> = {
  DIRECT_SEARCH: {
    useExpansion:         true,
    useSemantic:          false,
    useMemory:            false,
    requireClarification: false,
    maxCandidates:        20,
    confidenceThreshold:  6,
  },
  LOCATION_SEARCH: {
    useExpansion:         false, // l'espansione disperderebbe la localizzazione
    useSemantic:          true,  // il semantico aiuta con la vicinanza concettuale
    useMemory:            false,
    requireClarification: false,
    maxCandidates:        15,
    confidenceThreshold:  8,
  },
  URGENT_SEARCH: {
    useExpansion:         false, // precisione sopra ampiezza
    useSemantic:          false,
    useMemory:            false,
    requireClarification: false,
    maxCandidates:        10,   // pochi ma precisi
    confidenceThreshold:  10,
  },
  COMPARISON: {
    useExpansion:         true,
    useSemantic:          true,  // serve capire la somiglianza tra le entità
    useMemory:            false,
    requireClarification: false,
    maxCandidates:        20,
    confidenceThreshold:  6,
  },
  PROBLEM_SOLVING: {
    useExpansion:         true,
    useSemantic:          true,  // il bisogno espresso richiede comprensione semantica
    useMemory:            true,  // la cronologia aiuta a personalizzare la risposta
    requireClarification: false,
    maxCandidates:        15,
    confidenceThreshold:  4,    // soglia bassa: meglio suggerire qualcosa che niente
  },
  GENERAL_SEARCH: {
    useExpansion:         true,
    useSemantic:          false,
    useMemory:            false,
    requireClarification: false,
    maxCandidates:        25,
    confidenceThreshold:  4,
  },
  UNKNOWN: {
    useExpansion:         false,
    useSemantic:          false,
    useMemory:            false,
    requireClarification: true, // intento sconosciuto → chiedi chiarimento
    maxCandidates:        10,
    confidenceThreshold:  0,
  },
};

// ─── Funzione principale ──────────────────────────────────────────────────────

/**
 * Produce un DecisionPlan a partire da un QueryIntent classificato.
 *
 * Se l'intento ha bassa confidenza (< 40), la strategia viene degradata
 * a GENERAL_SEARCH per evitare decisioni aggressive su intenti incerti.
 *
 * @param intent - L'intento classificato da classifyIntent()
 * @returns DecisionPlan completo per l'Orchestrator
 */
export function makeDecision(intent: QueryIntent): DecisionPlan {
  // Intento con bassa confidenza → strategia generica più sicura
  const effectiveIntentType: QueryIntentType =
    intent.confidence < 40 ? "unknown" : intent.type;

  // Deroga a GENERAL_SEARCH se la confidenza è nel range 40-55
  // (abbastanza sicuri dell'intento da non chiedere chiarimento,
  //  non abbastanza da usare la strategia specifica ottimizzata)
  const useFallbackGeneral =
    intent.confidence >= 40 &&
    intent.confidence < 55 &&
    effectiveIntentType === "unknown";

  const strategy: DecisionStrategy = useFallbackGeneral
    ? "GENERAL_SEARCH"
    : INTENT_TO_STRATEGY[effectiveIntentType];

  const defaults = STRATEGY_DEFAULTS[strategy];

  // Affina i parametri in base alla confidenza effettiva
  const plan: DecisionPlan = {
    strategy,
    ...defaults,
  };

  // Con alta confidenza (>= 80) per PROBLEM_SOLVING, abbassa ulteriormente
  // la threshold per massimizzare i suggerimenti
  if (strategy === "PROBLEM_SOLVING" && intent.confidence >= 80) {
    plan.confidenceThreshold = 2;
  }

  // Con alta confidenza per URGENT_SEARCH, riduci ulteriormente i candidati
  if (strategy === "URGENT_SEARCH" && intent.confidence >= 80) {
    plan.maxCandidates = 5;
  }

  return plan;
}
