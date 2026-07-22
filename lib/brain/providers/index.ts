/**
 * LocalHub Brain — Providers
 *
 * Provider LLM condivisi da tutti i moduli Brain.
 * Centralizza la gestione delle chiamate ai modelli AI per evitare
 * duplicazioni e semplificare la sostituzione futura dei provider.
 *
 * Provider disponibili:
 * - Groq    → llama-3.3-70b-versatile (stessa chiave di lib/ricerca-ai.ts)
 * - Gemini  → gemini-1.5-flash per testo (stessa chiave del product-assistant)
 *
 * Differenza dai provider esistenti:
 * - lib/product-assistant/providers/ gestisce solo la vision (immagini)
 * - lib/brain/providers/ gestisce i task testuali (chat, completion)
 *
 * @module lib/brain/providers
 */

import type { BrainLLMProvider } from "./base";
import { GroqProvider } from "./groq";
import { GeminiTextProvider } from "./gemini";

export type { BrainLLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult } from "./base";
export { GroqProvider } from "./groq";
export { GeminiTextProvider } from "./gemini";

/** Provider disponibili */
export type BrainProviderName = "groq" | "gemini";

/**
 * Factory: ritorna il provider LLM configurato per il task.
 *
 * Di default usa Groq (più veloce per task di espansione query).
 * Usa Gemini se specificato o se GROQ_API_KEY non è disponibile.
 *
 * @param preferred - Provider preferito (default: "groq")
 */
export function getBrainLLMProvider(
  preferred: BrainProviderName = "groq"
): BrainLLMProvider {
  if (preferred === "gemini") {
    return new GeminiTextProvider();
  }

  // Groq con fallback a Gemini se la chiave manca
  try {
    return new GroqProvider();
  } catch {
    return new GeminiTextProvider();
  }
}
