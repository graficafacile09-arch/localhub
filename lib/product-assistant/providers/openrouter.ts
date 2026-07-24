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

type OpenRouterMessage = {
  role: "user" | "assistant" | "system";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
};

export class OpenRouterProvider implements VisionProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(
    images: VisionImage[],
    context?: VisionContext
  ): Promise<ProviderResult> {
    const prompt = buildVisionPrompt(context);
    const startTime = Date.now();

    const content: OpenRouterMessage["content"] = [{ type: "text", text: prompt }];

    for (const image of images) {
      const mimeType = detectMimeType(image.filename);
      const base64 = image.buffer.toString("base64");
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    }

    const messages: OpenRouterMessage[] = [{ role: "user", content }];

    let httpStatus: number | string = "unknown";
    let responseText = "";
    let tokenCount: { input?: number; output?: number; total?: number } | undefined;

    try {

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://localhub-eta.vercel.app",
          "X-Title": "LocalHub",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 2000,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      httpStatus = response.status;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");

        if (httpStatus === 429 || httpStatus === 402) {
          throw new ProviderError(
            AI_PROVIDER_QUOTA_EXCEEDED,
            `OpenRouter: HTTP ${httpStatus} — ${errorBody.slice(0, 200)}`,
            httpStatus
          );
        }

        if (httpStatus >= 500 && httpStatus < 600) {
          throw new ProviderError(
            AI_PROVIDER_UNKNOWN_ERROR,
            `OpenRouter: errore server HTTP ${httpStatus}.`,
            httpStatus
          );
        }

        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `OpenRouter: HTTP ${httpStatus} — ${errorBody.slice(0, 200)}`,
          httpStatus
        );
      }

      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      tokenCount = json.usage
        ? {
            input: json.usage.prompt_tokens,
            output: json.usage.completion_tokens,
            total: json.usage.total_tokens,
          }
        : undefined;

      responseText = json.choices?.[0]?.message?.content ?? "";

      if (!responseText.trim()) {
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          "OpenRouter: risposta vuota.",
          httpStatus
        );
      }

      const jsonStr = extractJsonFromText(responseText);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        const fallbackJson = extractJsonFallback(responseText);
        if (fallbackJson) {
          try {
            parsed = JSON.parse(fallbackJson);
          } catch {
            throw new ProviderError(
              AI_PROVIDER_UNKNOWN_ERROR,
              "OpenRouter: impossibile parsare JSON dalla risposta.",
              httpStatus
            );
          }
        } else {
          throw new ProviderError(
            AI_PROVIDER_UNKNOWN_ERROR,
            "OpenRouter: impossibile parsare JSON dalla risposta.",
            httpStatus
          );
        }
      }

      const latencyMs = Date.now() - startTime;
      const suggestion = extractSuggestion(parsed);

      return {
        suggestion,
        model: this.model,
        latencyMs,
        tokenCount,
        httpStatus,
      };
    } catch (caught: unknown) {
      const latencyMs = Date.now() - startTime;

      if (caught instanceof ProviderError) {
        throw caught;
      }

      if (caught instanceof DOMException && caught.name === "AbortError") {
        throw new ProviderError(
          AI_PROVIDER_TIMEOUT,
          "OpenRouter: timeout richiesta (60s).",
          "timeout"
        );
      }

      const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
      throw new ProviderError(
        AI_PROVIDER_NETWORK_ERROR,
        `OpenRouter: errore di rete — ${msg}`,
        "network"
      );
    }
  }
}
