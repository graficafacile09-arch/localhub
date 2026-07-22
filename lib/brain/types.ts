/**
 * LocalHub Brain — Tipi Condivisi
 *
 * Definisce tutti i tipi TypeScript utilizzati nel modulo Brain.
 * Tutti i sottocartelle di Brain importano i tipi da questo file.
 * Il resto del progetto importa i tipi da lib/brain/index.ts.
 *
 * @module lib/brain/types
 */

// Import locale + re-export per evitare import circolari
// (l'import è necessario per usare i tipi nelle interfacce di questo file)
import type { DecisionPlan, DecisionStrategy } from "./reasoning/decision-engine";
export type { DecisionPlan, DecisionStrategy };

// ─── Contesto ─────────────────────────────────────────────────────────────────

/**
 * Contesto arricchito che il Builder assembla e gli altri moduli consumano.
 * È il tipo centrale attorno a cui ruota tutto il modulo Brain.
 */
export interface BrainContext {
  /** Query originale dell'utente, non modificata */
  query: string;

  /** Query espansa con sinonimi e termini correlati */
  queryExpanded: string;

  /** Termini estratti dalla query dopo normalizzazione */
  queryTerms: string[];

  /** Intenzione classificata della query */
  intent: QueryIntent | null;

  /** Piano di esecuzione prodotto dal Decision Engine */
  decisionPlan: DecisionPlan | null;

  /** Negozi candidati recuperati dai retriever */
  candidates: BrainCandidate[];

  /** Contesto utente opzionale (solo se autenticato o con memoria) */
  userContext: UserContext | null;

  /** Contesto temporale della richiesta */
  temporalContext: TemporalContext;
}

/**
 * Wrapper generico per ogni risposta di Brain.
 * Il campo source indica se il risultato è venuto da Brain o dal fallback.
 */
export interface BrainResult<T> {
  /** Il dato prodotto da Brain */
  data: T;

  /** Se Brain ha effettivamente contribuito o si è usato il fallback */
  source: "brain" | "fallback";

  /** Tempo di elaborazione in millisecondi */
  processingMs: number;

  /** Metadati opzionali per debug */
  debug?: Record<string, unknown>;
}

// ─── Query e Intento ──────────────────────────────────────────────────────────

/** Tipo di intenzione della query dell'utente */
export type QueryIntentType =
  | "direct_search"     // "farmacia" — cerca un tipo di negozio direttamente
  | "need_expression"   // "ho mal di testa" — esprime un bisogno
  | "comparison"        // "differenza tra A e B" — vuole comparare
  | "urgency"           // "aperto adesso" — cerca con vincolo temporale
  | "location_specific" // "vicino a piazza Roma" — vincolo geografico
  | "unknown";          // non classificabile

/** Classificazione dell'intento della query */
export interface QueryIntent {
  type: QueryIntentType;
  confidence: number; // 0-100
  extractedEntities: string[];
}

// ─── Candidati e Ranking ──────────────────────────────────────────────────────

/** Un negozio candidato con i suoi punteggi di ranking */
export interface BrainCandidate {
  /** ID del negozio */
  id: string;

  /** Punteggio lessicale dal sistema esistente (da ranking-negozi.ts) */
  lexicalScore: number;

  /** Punteggio semantico (da similarità coseno degli embeddings) */
  semanticScore: number | null;

  /** Punteggio combinato finale */
  combinedScore: number;

  /** I dati raw del negozio */
  data: Record<string, unknown>;
}

/** Punteggio combinato con spiegazione (per debug e A/B testing) */
export interface RankingScore {
  lexical: number;
  semantic: number | null;
  combined: number;
  explanation: string;
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

/** Un vettore di embedding con metadata */
export interface EmbeddingVector {
  /** Il vettore numerico */
  vector: number[];

  /** Il testo sorgente da cui è stato generato */
  sourceText: string;

  /** Timestamp di generazione */
  generatedAt: Date;

  /** ID dell'entità associata (negozio, prodotto, query) */
  entityId?: string;

  /** Tipo di entità */
  entityType?: "negozio" | "prodotto" | "query";
}

// ─── Memoria ──────────────────────────────────────────────────────────────────

/** Una voce di memoria del sistema Brain */
export interface MemoryEntry {
  id: string;

  /** ID utente Supabase (null per utenti anonimi) */
  userId: string | null;

  /** ID di sessione browser (per utenti anonimi) */
  sessionId: string;

  /** Tipo di memoria */
  type: "session" | "longterm";

  /** Contenuto della voce (query, click, preferenze) */
  content: MemoryContent;

  createdAt: Date;
}

/** Il contenuto di una voce di memoria */
export interface MemoryContent {
  type: "query" | "click" | "preference";
  value: string;
  metadata?: Record<string, unknown>;
}

// ─── Reasoning ────────────────────────────────────────────────────────────────

/** Una catena di ragionamento multi-step */
export interface ReasoningChain {
  /** ID univoco della chain */
  id: string;

  /** La query di partenza */
  inputQuery: string;

  /** I singoli step eseguiti */
  steps: ReasoningStep[];

  /** Il risultato finale della chain */
  output: string | null;
}

/** Un singolo step della catena di ragionamento */
export interface ReasoningStep {
  /** Nome dello step (classify, expand, synthesize) */
  name: string;

  /** Input dello step */
  input: unknown;

  /** Output dello step */
  output: unknown;

  /** Se lo step ha avuto successo */
  success: boolean;

  /** Messaggio di errore opzionale */
  error?: string;
}

// ─── Contesto Utente e Temporale ──────────────────────────────────────────────

/** Contesto utente opzionale arricchisce le risposte Brain */
export interface UserContext {
  userId: string | null;
  sessionId: string;
  recentQueries: string[];
  preferredCategories: string[];
}

/** Contesto temporale della richiesta */
export interface TemporalContext {
  timestamp: Date;
  dayOfWeek: number; // 0-6
  hourOfDay: number; // 0-23
  isWeekend: boolean;
}
