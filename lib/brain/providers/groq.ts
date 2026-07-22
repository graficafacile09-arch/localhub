/**
 * LocalHub Brain — Provider Groq
 *
 * Implementa BrainLLMProvider usando l'API Groq (OpenAI-compatible).
 * Riusa la stessa logica di fetch di lib/ricerca-ai.ts, senza duplicare
 * la configurazione: prende la chiave da GROQ_API_KEY.
 *
 * Modello di default: llama-3.3-70b-versatile (lo stesso già usato in produzione).
 *
 * @module lib/brain/providers/groq
 */

import type {
  BrainLLMProvider,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMMessage,
} from "./base";

// Endpoint Groq compatibile con l'API OpenAI
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Modello di default — lo stesso già in uso in lib/ricerca-ai.ts
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/** Struttura della risposta Groq */
interface GroqApiResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    total_tokens?: number;
  };
  model?: string;
  error?: { message?: string };
}

/**
 * Provider Groq per Brain.
 * Usa fetch nativo (nessuna dipendenza aggiuntiva).
 */
export class GroqProvider implements BrainLLMProvider {
  readonly name = "groq";
  readonly model: string;

  private readonly apiKey: string;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey ?? process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error(
        "GroqProvider: chiave API mancante. Imposta GROQ_API_KEY in .env.local"
      );
    }
    this.apiKey = key;
    this.model = model ?? DEFAULT_MODEL;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const body = {
      model: this.model,
      messages,
      ...(options?.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options?.maxTokens !== undefined && {
        max_tokens: options.maxTokens,
      }),
    };

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GroqProvider: errore API (${response.status}) — ${errorText}`);
    }

    const data = (await response.json()) as GroqApiResponse;

    if (data.error?.message) {
      throw new Error(`GroqProvider: ${data.error.message}`);
    }

    const text = data.choices?.[0]?.message?.content ?? "";
    const tokensUsed = data.usage?.total_tokens;

    return {
      text,
      model: this.model,
      tokensUsed,
    };
  }
}
