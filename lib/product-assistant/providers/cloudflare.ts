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

type CloudflareMessage = {
  role: "user" | "assistant" | "system";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
};

const CLOUDFLARE_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export class CloudflareProvider implements VisionProvider {
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor(accountId: string, apiToken: string) {
    this.accountId = accountId;
    this.apiToken = apiToken;
  }

  get model(): string {
    return CLOUDFLARE_MODEL;
  }

  async analyze(
    images: VisionImage[],
    context?: VisionContext
  ): Promise<ProviderResult> {
    const prompt = buildVisionPrompt(context);
    const startTime = Date.now();

    const content: CloudflareMessage["content"] = [{ type: "text", text: prompt }];

    for (const image of images) {
      const mimeType = detectMimeType(image.filename);
      const base64 = image.buffer.toString("base64");
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    }

    const messages: CloudflareMessage[] = [{ role: "user", content }];

    // Endpoint OpenAI-compatible (NON l'API REST nativa /ai/run/{model})
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1/chat/completions`;

    let httpStatus: number | string = "unknown";
    let responseText = "";
    let tokenCount: { input?: number; output?: number; total?: number } | undefined;

    try {

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CLOUDFLARE_MODEL,
          messages,
          max_tokens: 2000,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      httpStatus = response.status;

      const headersSnapshot: Record<string, string> = {};
      response.headers.forEach((v, k) => { headersSnapshot[k] = v; });

      const fullBody = await response.text().catch(() => "unknown");

      if (!response.ok) {
        const diag = `HTTP ${httpStatus}, Content-Length: ${headersSnapshot["content-length"] ?? "N/A"}, headers: ${JSON.stringify(headersSnapshot)}. Body: ${fullBody.slice(0, 500)}`;

        if (httpStatus === 429) {
          throw new ProviderError(AI_PROVIDER_QUOTA_EXCEEDED, `Cloudflare quota esaurita (rate limit). ${diag}`, httpStatus);
        }

        if (httpStatus >= 500 && httpStatus < 600) {
          throw new ProviderError(AI_PROVIDER_UNKNOWN_ERROR, `Cloudflare: errore server. ${diag}`, httpStatus);
        }

        throw new ProviderError(AI_PROVIDER_UNKNOWN_ERROR, `Cloudflare: errore. ${diag}`, httpStatus);
      }

      if (!fullBody.trim()) {
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Cloudflare: body vuoto. HTTP ${httpStatus}, Content-Length: ${headersSnapshot["content-length"] ?? "N/A"}, Transfer-Encoding: ${headersSnapshot["transfer-encoding"] ?? "N/A"}, headers: ${JSON.stringify(headersSnapshot)}.`,
          httpStatus
        );
      }

      // Formato risposta OpenAI-compatible
      const json = JSON.parse(fullBody) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        error?: { message?: string; code?: string };
      };

      if (json.error) {
        const errMsg = json.error.message ?? "Errore sconosciuto Cloudflare";

        if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("ratelimit")) {
          throw new ProviderError(AI_PROVIDER_QUOTA_EXCEEDED, `Cloudflare: ${errMsg}`, httpStatus);
        }

        throw new ProviderError(AI_PROVIDER_UNKNOWN_ERROR, `Cloudflare: ${errMsg}`, httpStatus);
      }

      responseText = json.choices?.[0]?.message?.content ?? "";

      responseText = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      if (!responseText.trim()) {
        const finishReason = json.choices?.[0]?.finish_reason ?? "unknown";
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Cloudflare: risposta vuota. HTTP ${httpStatus}, finish_reason: ${finishReason}, fullBody (primi 500): ${fullBody.slice(0, 500)}, Content-Length: ${headersSnapshot["content-length"] ?? "N/A"}, Transfer-Encoding: ${headersSnapshot["transfer-encoding"] ?? "N/A"}, headers: ${JSON.stringify(headersSnapshot)}.`,
          httpStatus
        );
      }

      tokenCount = json.usage
        ? {
            input: json.usage.prompt_tokens,
            output: json.usage.completion_tokens,
            total: json.usage.total_tokens,
          }
        : undefined;

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
              "Cloudflare: impossibile parsare JSON dalla risposta.",
              httpStatus
            );
          }
        } else {
          throw new ProviderError(
            AI_PROVIDER_UNKNOWN_ERROR,
            "Cloudflare: impossibile parsare JSON dalla risposta.",
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
          "Cloudflare: timeout richiesta (60s).",
          "timeout"
        );
      }

      const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
      throw new ProviderError(
        AI_PROVIDER_NETWORK_ERROR,
        `Cloudflare: errore di rete — ${msg}`,
        "network"
      );
    }
  }
}
