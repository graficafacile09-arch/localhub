/**
 * Pino text generation through the Vercel AI SDK + Google Gemini provider.
 *
 * Keep the existing GEMINI_API_KEY / GEMINI_MODEL configuration and the
 * current callGeminiText contract so Pino's planner and final-answer flow
 * remain unchanged. Product Vision remains on its existing provider.
 */
import { Output, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const MODELLO_FALLBACK = "gemini-3.8-flash";
const TIMEOUT_DEFAULT_MS = 60_000;
const TENTATIVI_DEFAULT = 3;

export type GeminiMessage = {
  role: "user" | "model";
  content: string;
};

export type CallGeminiTextParams = {
  systemPrompt: string;
  userPrompt: string;
  history?: GeminiMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  retries?: number;
};

function erroreTemporaneo(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|502|503|504)\b|rate.?limit|quota|timeout|timed out|ECONNRESET|fetch failed/i.test(message);
}

export async function callGeminiText({
  systemPrompt,
  userPrompt,
  history = [],
  maxTokens = 700,
  temperature = 0.2,
  json = false,
  timeoutMs = TIMEOUT_DEFAULT_MS,
  retries = TENTATIVI_DEFAULT,
}: CallGeminiTextParams): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chiave API Gemini mancante. Aggiungi GEMINI_API_KEY al file .env.local.");
  }

  const modelId = process.env.GEMINI_MODEL?.trim() || MODELLO_FALLBACK;
  const google = createGoogleGenerativeAI({ apiKey });
  const messages = [
    ...history.map((message) => ({
      role: message.role === "model" ? ("assistant" as const) : ("user" as const),
      content: message.content,
    })),
    { role: "user" as const, content: userPrompt },
  ];

  let ultimoErrore: unknown;
  for (let tentativo = 1; tentativo <= retries; tentativo++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await generateText({
        model: google(modelId),
        instructions: systemPrompt.trim() || undefined,
        messages,
        maxOutputTokens: maxTokens,
        temperature,
        ...(json ? { output: Output.json() } : {}),
        abortSignal: controller.signal,
      });

      const text = result.text?.trim();
      if (!text) throw new Error("Gemini ha restituito una risposta vuota.");
      return text;
    } catch (error) {
      ultimoErrore = error;
      if (tentativo >= retries || !erroreTemporaneo(error)) {
        const message = error instanceof Error ? error.message : String(error);
        if (controller.signal.aborted) throw new Error(`Timeout Gemini dopo ${timeoutMs} ms.`);
        if (/\b429\b|quota|rate.?limit/i.test(message)) throw new Error("Quota Gemini superata. Riprova tra poco.");
        throw error instanceof Error ? error : new Error(message);
      }
      await new Promise((resolve) => setTimeout(resolve, tentativo * 1500));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw ultimoErrore instanceof Error ? ultimoErrore : new Error("Chiamata Gemini fallita.");
}
