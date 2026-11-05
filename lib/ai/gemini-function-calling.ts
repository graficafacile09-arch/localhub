/**
 * LocalHub — Gemini: Function Calling nativo (sperimentale).
 *
 * Usa l'SDK installato `@google/genai` 2.12.0 e l'API
 * `ai.models.generateContent` con `tools.functionDeclarations`.
 *
 * Questo modulo non esegue i tool e non decide quali siano autorizzati:
 * restituisce solo le `functionCall` del provider. La validazione e
 * l'esecuzione restano in `lib/assistente/index.ts` e `lib/assistente/tools.ts`.
 *
 * @module lib/ai/gemini-function-calling
 */
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type FunctionDeclaration,
} from "@google/genai";
import type { GeminiMessage } from "@/lib/ai/gemini-text";

export type GeminiFunctionCallingParams = {
  systemPrompt: string;
  userPrompt: string;
  history?: GeminiMessage[];
  declarations: FunctionDeclaration[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export type GeminiFunctionCallingResult = {
  /** Forma grezza del provider: il parsing resta nel livello Pino. */
  calls: unknown;
  text: string;
};

const MODELLO_FALLBACK = "gemini-3.8-flash";
const TIMEOUT_DEFAULT_MS = 45_000;

/**
 * Esegue una generateContent nativa con function declarations.
 * Non abilita l'auto-esecuzione: il modello restituisce le chiamate e Pino
 * decide, valida ed esegue.
 */
export async function chiamaGeminiFunctionCalling(
  params: GeminiFunctionCallingParams
): Promise<GeminiFunctionCallingResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Chiave API Gemini mancante. Aggiungi GEMINI_API_KEY al file .env.local.");
  }

  const model = process.env.GEMINI_MODEL?.trim() || MODELLO_FALLBACK;
  const timeoutMs = params.timeoutMs ?? TIMEOUT_DEFAULT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const contents = [
      ...(params.history ?? []).map((message) => ({
        role: message.role,
        parts: [{ text: message.content }],
      })),
      { role: "user" as const, parts: [{ text: params.userPrompt }] },
    ];

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: params.systemPrompt,
        temperature: params.temperature ?? 0.1,
        maxOutputTokens: params.maxTokens ?? 450,
        abortSignal: controller.signal,
        tools: [{ functionDeclarations: params.declarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
      },
    });

    return {
      calls: response.functionCalls,
      text: (response.text ?? "").trim(),
    };
  } catch (caught: unknown) {
    const nome = caught && typeof caught === "object"
      ? String((caught as { name?: unknown }).name ?? "")
      : "";
    if (controller.signal.aborted || nome === "AbortError") {
      throw new Error(`Timeout chiamata Gemini Function Calling (${Math.round(timeoutMs / 1000)}s).`);
    }
    if (caught instanceof Error) throw caught;
    throw new Error("Errore sconosciuto chiamata Gemini Function Calling.");
  } finally {
    clearTimeout(timeoutId);
  }
}
