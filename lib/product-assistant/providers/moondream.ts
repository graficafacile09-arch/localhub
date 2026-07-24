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

const MOONDREAM_MODEL = "@cf/moondream/moondream3.1-9B-A2B";

export class MoondreamProvider implements VisionProvider {
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor(accountId: string, apiToken: string) {
    this.accountId = accountId;
    this.apiToken = apiToken;
  }

  get model(): string {
    return MOONDREAM_MODEL;
  }

  async analyze(
    images: VisionImage[],
    context?: VisionContext
  ): Promise<ProviderResult> {
    const prompt = buildVisionPrompt(context);
    const startTime = Date.now();

    const image = images[0];
    if (!image) {
      throw new ProviderError(
        AI_PROVIDER_UNKNOWN_ERROR,
        "Moondream: almeno un'immagine richiesta.",
        "unknown"
      );
    }

    const mimeType = detectMimeType(image.filename);
    const base64 = image.buffer.toString("base64");
    const imageUrl = `data:${mimeType};base64,${base64}`;

    let httpStatus: number | string = "unknown";
    let tokenCount: { input?: number; output?: number; total?: number } | undefined;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${MOONDREAM_MODEL}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: "query",
          image: imageUrl,
          question: prompt,
          max_tokens: 300,
          temperature: 0.1,
          reasoning: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      httpStatus = response.status;

      const fullBody = await response.text().catch(() => "unknown");

      if (!response.ok) {
        const diag = `HTTP ${httpStatus}, Body: ${fullBody.slice(0, 500)}`;

        if (httpStatus === 429) {
          throw new ProviderError(AI_PROVIDER_QUOTA_EXCEEDED, `Moondream: quota esaurita. ${diag}`, httpStatus);
        }

        throw new ProviderError(AI_PROVIDER_UNKNOWN_ERROR, `Moondream: errore. ${diag}`, httpStatus);
      }

      if (!fullBody.trim()) {
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Moondream: body vuoto. HTTP ${httpStatus}.`,
          httpStatus
        );
      }

      const json = JSON.parse(fullBody) as {
        answer?: string;
        error?: { message?: string };
      };

      if (json.error) {
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Moondream: ${json.error.message ?? "Errore sconosciuto"}`,
          httpStatus
        );
      }

      const answer = json.answer ?? "";

      if (!answer.trim()) {
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Moondream: risposta vuota. fullBody: ${fullBody.slice(0, 500)}`,
          httpStatus
        );
      }

      const jsonStr = extractJsonFromText(answer);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        const fallbackJson = extractJsonFallback(answer);
        if (fallbackJson) {
          try {
            parsed = JSON.parse(fallbackJson);
          } catch {
            throw new ProviderError(
              AI_PROVIDER_UNKNOWN_ERROR,
              "Moondream: impossibile parsare JSON dalla risposta.",
              httpStatus
            );
          }
        } else {
          throw new ProviderError(
            AI_PROVIDER_UNKNOWN_ERROR,
            "Moondream: impossibile parsare JSON dalla risposta.",
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
          "Moondream: timeout richiesta (60s).",
          "timeout"
        );
      }

      const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
      throw new ProviderError(
        AI_PROVIDER_NETWORK_ERROR,
        `Moondream: errore di rete — ${msg}`,
        "network"
      );
    }
  }
}
