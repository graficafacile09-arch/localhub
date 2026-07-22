/**
 * LocalHub Brain — Provider Base
 *
 * Interfaccia comune per tutti i provider LLM usati dal modulo Brain.
 * I provider Brain gestiscono task testuali (chat completion, espansione query).
 * Sono separati dai provider vision in lib/product-assistant/providers/.
 *
 * @module lib/brain/providers/base
 */

// ─── Tipi ─────────────────────────────────────────────────────────────────────

/** Un singolo messaggio nella conversazione */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Opzioni per una singola chiamata di completamento */
export interface LLMCompletionOptions {
  /** Temperatura (0-2). Più alta = più creativo, più bassa = più deterministico */
  temperature?: number;

  /** Numero massimo di token da generare */
  maxTokens?: number;
}

/** Risposta di una chiamata di completamento */
export interface LLMCompletionResult {
  /** Il testo generato dal modello */
  text: string;

  /** Modello usato per generare la risposta */
  model: string;

  /** Token usati (prompt + completion), se disponibili */
  tokensUsed?: number;
}

// ─── Interfaccia provider ────────────────────────────────────────────────────

/**
 * Contratto comune per tutti i provider LLM di Brain.
 *
 * Per aggiungere un nuovo provider:
 * 1. Crea un file in lib/brain/providers/ che implementa questa interfaccia
 * 2. Aggiungi il case nella factory getBrainLLMProvider()
 * Zero modifiche al codice chiamante.
 */
export interface BrainLLMProvider {
  /** Nome identificativo del provider (groq, gemini, …) */
  readonly name: string;

  /** Modello in uso */
  readonly model: string;

  /**
   * Genera una risposta testuale da un array di messaggi.
   *
   * @param messages - Storico della conversazione
   * @param options  - Opzioni di generazione
   * @throws Error se la chiamata API fallisce
   */
  complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult>;
}
