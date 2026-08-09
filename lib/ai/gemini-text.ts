/**
 * LocalHub — Gemini: chiamata testuale/JSON (assistente + correggi-ai)
 *
 * Separata da callGeminiGeneration() (lib/product-assistant/providers/gemini.ts),
 * che resta dedicata ESCLUSIVAMENTE alla Vision (scansione prodotto) e non
 * viene toccata. Qui: richieste text-only con system prompt, cronologia,
 * generazione JSON opzionale (responseMimeType), timeout e retry su 429/5xx.
 *
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
 * Risposta: candidates[0].content.parts[].text
 *
 * Usa GEMINI_API_KEY e GEMINI_MODEL (con fallback gemini-2.0-flash),
 * le stesse variabili già usate dalla Vision.
 *
 * @module lib/ai/gemini-text
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELLO_FALLBACK = "gemini-2.0-flash";
const TIMEOUT_DEFAULT_MS = 60_000;
const TENTATIVI_DEFAULT = 3;

/** Messaggio di conversazione per Gemini: i ruoli ammessi sono user/model. */
export type GeminiMessage = {
  role: "user" | "model";
  content: string;
};

export type CallGeminiTextParams = {
  systemPrompt: string;
  userPrompt: string;
  /** Cronologia precedente (ruoli già normalizzati user/model). */
  history?: GeminiMessage[];
  maxTokens?: number;
  temperature?: number;
  /** true → generationConfig.responseMimeType "application/json". */
  json?: boolean;
  timeoutMs?: number;
  /** Retry con backoff su 429/402 (quota). Default 3. */
  retries?: number;
};

/**
 * Chiama Gemini e restituisce il testo della prima risposta (candidates[0]).
 * Lancia Error con messaggi chiari per: chiave mancante, quota (dopo i retry),
 * errore server, HTTP generico, timeout, risposta vuota.
 */
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
  const model = process.env.GEMINI_MODEL?.trim() || MODELLO_FALLBACK;

  let ultimoErrore: Error | null = null;

  for (let tentativo = 1; tentativo <= retries; tentativo++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Ruoli Gemini: user/model (niente "assistant"); l'ultima parte è sempre
      // la richiesta dell'utente.
      const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [
        ...history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
        { role: "user", parts: [{ text: userPrompt }] },
      ];

      const generationConfig: Record<string, unknown> = {
        temperature,
        maxOutputTokens: maxTokens,
      };
      if (json) generationConfig.responseMimeType = "application/json";

      const body: Record<string, unknown> = {
        contents,
        generationConfig,
      };
      if (systemPrompt.trim()) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
      }

      const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        if (response.status === 429 || response.status === 402) {
          ultimoErrore = new Error(`Quota Gemini superata (HTTP ${response.status}).`);
          if (tentativo < retries) {
            await new Promise((r) => setTimeout(r, tentativo * 1500));
            continue;
          }
          throw ultimoErrore;
        }
        if (response.status >= 500 && response.status < 600) {
          throw new Error(`Errore server Gemini (HTTP ${response.status}).`);
        }
        throw new Error(`Errore Gemini (HTTP ${response.status}): ${errorBody.slice(0, 300)}`);
      }

      const resData = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text =
        resData.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() ?? "";

      if (!text) {
        throw new Error("Risposta AI vuota.");
      }

      return text;
    } catch (caught: unknown) {
      clearTimeout(timeoutId);
      if (caught instanceof DOMException && caught.name === "AbortError") {
        throw new Error(`Timeout chiamata Gemini (${Math.round(timeoutMs / 1000)}s).`);
      }
      if (caught instanceof Error) throw caught;
      throw new Error("Errore sconosciuto chiamata Gemini.");
    }
  }

  throw ultimoErrore ?? new Error("Chiamata Gemini fallita.");
}
