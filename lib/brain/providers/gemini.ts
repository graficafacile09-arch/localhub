/**
 * LocalHub Brain — Provider Gemini (testo)
 *
 * Implementa BrainLLMProvider usando l'API Gemini per task testuali.
 * È separato da lib/product-assistant/providers/gemini.ts che gestisce
 * solo la vision (analisi immagini): questo gestisce solo chat/completion.
 *
 * Prende la chiave da GEMINI_API_KEY.
 * Modello di default: gemini-1.5-flash (configurabile via GEMINI_MODEL_TEXT).
 *
 * @module lib/brain/providers/gemini
 */

import type {
  BrainLLMProvider,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMMessage,
} from "./base";

// Endpoint Gemini generateContent
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_MODEL = "gemini-1.5-flash";

/** Struttura della risposta Gemini */
interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

/** Converte i messaggi Brain nel formato Gemini */
function toGeminiContents(
  messages: LLMMessage[]
): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  return messages
    .filter((m) => m.role !== "system") // Gemini non ha ruolo "system" nativo
    .map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));
}

/** Estrae l'eventuale system prompt dai messaggi */
function extractSystemInstruction(messages: LLMMessage[]): string | null {
  const systemMsg = messages.find((m) => m.role === "system");
  return systemMsg?.content ?? null;
}

/**
 * Provider Gemini per Brain (solo testo).
 * Usa fetch nativo — nessuna dipendenza aggiuntiva.
 */
export class GeminiTextProvider implements BrainLLMProvider {
  readonly name = "gemini";
  readonly model: string;

  private readonly apiKey: string;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GeminiTextProvider: chiave API mancante. Imposta GEMINI_API_KEY in .env.local"
      );
    }
    this.apiKey = key;
    this.model = model ?? process.env.GEMINI_MODEL_TEXT ?? DEFAULT_MODEL;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const systemInstruction = extractSystemInstruction(messages);
    const contents = toGeminiContents(messages);

    const requestBody: Record<string, unknown> = { contents };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    if (options?.temperature !== undefined || options?.maxTokens !== undefined) {
      requestBody.generationConfig = {
        ...(options.temperature !== undefined && {
          temperature: options.temperature,
        }),
        ...(options.maxTokens !== undefined && {
          maxOutputTokens: options.maxTokens,
        }),
      };
    }

    const url = `${GEMINI_API_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `GeminiTextProvider: errore API (${response.status}) — ${errorText}`
      );
    }

    const data = (await response.json()) as GeminiApiResponse;

    if (data.error?.message) {
      throw new Error(`GeminiTextProvider: ${data.error.message}`);
    }

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const tokensUsed = data.usageMetadata?.totalTokenCount;

    return {
      text,
      model: this.model,
      tokensUsed,
    };
  }
}
