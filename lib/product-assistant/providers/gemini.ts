import { GoogleGenAI, type Part } from "@google/genai";
import { buildVisionPrompt } from "../prompts";
import type { VisionContext, VisionImage } from "../types";
import type { VisionProvider } from "./base";
import {
  AI_PROVIDER_NETWORK_ERROR,
  AI_PROVIDER_QUOTA_EXCEEDED,
  AI_PROVIDER_TIMEOUT,
  AI_PROVIDER_UNKNOWN_ERROR,
  ProviderError,
  type ProviderResult,
  detectMimeType,
  extractJsonFallback,
  extractJsonFromText,
  extractSuggestion,
} from "./utils";

function log(...args: unknown[]) {
  console.log("[GeminiProvider]", ...args);
}

export class GeminiProvider implements VisionProvider {
  private readonly client: GoogleGenAI;
  private readonly modelName: string;

  constructor(apiKey: string, model = "gemini-1.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = model;
  }

  async analyze(
    images: VisionImage[],
    context?: VisionContext
  ): Promise<ProviderResult> {
    const prompt = buildVisionPrompt(context);
    const startTime = Date.now();

    log(`Modello: ${this.modelName}, immagini: ${images.length}`);
    log(`Prompt (primi 300): "${prompt.slice(0, 300)}..."`);
    log(`GEMINI_API_KEY presente: ${Boolean(this.client)}`);

    const parts: Part[] = [{ text: prompt }];

    for (const image of images) {
      const mimeType = detectMimeType(image.filename);
      const base64 = image.buffer.toString("base64");
      log(`Immagine: ${image.filename} (${mimeType}, ${base64.length} bytes base64)`);
      parts.push({
        inlineData: { mimeType, data: base64 },
      });
    }

    let httpStatus: number | string = "unknown";
    let rawText = "";

    try {
      log("Chiamata Gemini generateContent in corso...");

      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ role: "user", parts }],
        config: {
          maxOutputTokens: 2000,
          temperature: 0.1,
        },
      });

      httpStatus = "200";
      log("Risposta Gemini ricevuta (HTTP 200)");

      rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      log(`Risposta raw text length: ${rawText.length}`);
      log(`Risposta raw text (primi 500): "${rawText.slice(0, 500)}"`);

      if (!rawText.trim()) {
        const finishReason = response.candidates?.[0]?.finishReason ?? "unknown";
        log(`Finish reason: ${finishReason}`);
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Gemini: risposta vuota (finishReason: ${finishReason}).`,
          httpStatus
        );
      }

      const jsonStr = extractJsonFromText(rawText);
      log(`JSON extracted length: ${jsonStr.length}`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
        log("JSON parsato con successo");
      } catch (parseErr) {
        log(`ERRORE parsing JSON: ${parseErr}`);
        log(`JSON estratto: "${jsonStr.slice(0, 800)}"`);
        const fallbackJson = extractJsonFallback(rawText);
        if (fallbackJson) {
          try {
            parsed = JSON.parse(fallbackJson);
            log("JSON recuperato con fallback");
          } catch {
            throw new ProviderError(
              AI_PROVIDER_UNKNOWN_ERROR,
              "Gemini: impossibile parsare JSON dalla risposta.",
              httpStatus
            );
          }
        } else {
          throw new ProviderError(
            AI_PROVIDER_UNKNOWN_ERROR,
            "Gemini: impossibile parsare JSON dalla risposta.",
            httpStatus
          );
        }
      }

      const latencyMs = Date.now() - startTime;
      const suggestion = extractSuggestion(parsed);

      log(`Analisi completata in ${latencyMs}ms: "${suggestion.nome}"`);

      return {
        suggestion,
        model: this.modelName,
        latencyMs,
        httpStatus,
      };
    } catch (caught: unknown) {
      const latencyMs = Date.now() - startTime;

      if (caught instanceof ProviderError) {
        log(`ERRORE Gemini: [${caught.code}] ${caught.message}`);
        throw caught;
      }

      if (caught instanceof DOMException && caught.name === "AbortError") {
        log(`ERRORE Gemini: timeout (60s)`);
        throw new ProviderError(
          AI_PROVIDER_TIMEOUT,
          "Gemini: timeout richiesta (60s).",
          "timeout"
        );
      }

      const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
      const status = caught && typeof caught === "object" && "status" in caught
        ? String((caught as { status: unknown }).status)
        : "unknown";

      log(`ERRORE chiamata Gemini (HTTP ${status}): ${msg}`);

      if (status === "429") {
        throw new ProviderError(
          AI_PROVIDER_QUOTA_EXCEEDED,
          `Gemini: quota esaurita (HTTP 429).`,
          status
        );
      }

      throw new ProviderError(
        status === "unknown" ? AI_PROVIDER_NETWORK_ERROR : AI_PROVIDER_UNKNOWN_ERROR,
        `Gemini: ${msg}`,
        status
      );
    }
  }
}
