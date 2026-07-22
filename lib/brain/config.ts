/**
 * LocalHub Brain — Configurazione
 *
 * Unico punto di configurazione del modulo Brain.
 * Gestisce feature flags, variabili d'ambiente e valori di default.
 *
 * Principio di sicurezza:
 * Se BRAIN_ENABLED non è esplicitamente "true", il modulo è inattivo.
 * Questo garantisce che nessuna funzionalità Brain possa attivarsi
 * accidentalmente in produzione.
 *
 * @module lib/brain/config
 */

/** Configurazione completa del modulo Brain */
export interface BrainConfig {
  /** Se il modulo Brain è attivo */
  enabled: boolean;

  /** Provider da usare per gli embeddings */
  embeddingProvider: "gemini" | "openai";

  /** Modello Gemini per i task testuali */
  geminiModelText: string;

  /** Peso del ranking semantico nel combiner (0-1) */
  rankingSemanticWeight: number;

  /** Peso del ranking lessicale nel combiner (0-1). Di default = 1 - rankingSemanticWeight */
  rankingLexicalWeight: number;

  /** Se il modulo memoria è attivo */
  memoryEnabled: boolean;
}

/**
 * Ritorna true se il modulo Brain è configurato e abilitato.
 * Usare sempre questa funzione come guard prima di qualsiasi chiamata Brain.
 */
export function isBrainEnabled(): boolean {
  return process.env.BRAIN_ENABLED === "true";
}

/**
 * Ritorna la configurazione completa di Brain con i valori di default.
 * Lancia un errore se Brain non è abilitato e viene chiamato comunque.
 */
export function getBrainConfig(): BrainConfig {
  const semanticWeight = process.env.BRAIN_RANKING_SEMANTIC_WEIGHT
    ? Number(process.env.BRAIN_RANKING_SEMANTIC_WEIGHT)
    : 0.6;

  return {
    enabled: process.env.BRAIN_ENABLED === "true",
    embeddingProvider:
      (process.env.BRAIN_EMBEDDING_PROVIDER as BrainConfig["embeddingProvider"]) ??
      "gemini",
    geminiModelText: process.env.GEMINI_MODEL_TEXT ?? "gemini-1.5-flash",
    rankingSemanticWeight: semanticWeight,
    rankingLexicalWeight: 1 - semanticWeight,
    memoryEnabled: process.env.BRAIN_MEMORY_ENABLED === "true",
  };
}
