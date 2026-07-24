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

function log(...args: unknown[]) {
  console.log("[CloudflareProvider]", ...args);
}

export class CloudflareProvider implements VisionProvider {
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor(accountId: string, apiToken: string) {
    this.accountId = accountId;
    this.apiToken = apiToken;
  }

  get model(): string {
    return "@cf/meta/llama-3.2-11b-vision-instruct";
  }

  async analyze(
    images: VisionImage[],
    context?: VisionContext
  ): Promise<ProviderResult> {
    const prompt = buildVisionPrompt(context);
    const startTime = Date.now();

    log(`Modello: ${this.model}, immagini: ${images.length}`);
    log(`Prompt (primi 300): "${prompt.slice(0, 300)}..."`);
    log(`CLOUDFLARE_ACCOUNT_ID presente: ${Boolean(this.accountId)}`);

    const content: CloudflareMessage["content"] = [{ type: "text", text: prompt }];

    for (const image of images) {
      const mimeType = detectMimeType(image.filename);
      const base64 = image.buffer.toString("base64");
      log(`Immagine: ${image.filename} (${mimeType}, ${base64.length} bytes base64)`);
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    }

    const messages: CloudflareMessage[] = [{ role: "user", content }];

    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`;
    const url = `${baseUrl}/${this.model}`;

    let httpStatus: number | string = "unknown";
    let responseText = "";

    try {
      log("Chiamata Cloudflare Workers AI in corso...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          max_tokens: 2000,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      httpStatus = response.status;
      log(`Risposta Cloudflare: HTTP ${httpStatus}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        log(`ERRORE Cloudflare (HTTP ${httpStatus}): ${errorBody}`);

        if (httpStatus === 429) {
          throw new ProviderError(
            AI_PROVIDER_QUOTA_EXCEEDED,
            "Cloudflare quota esaurita (rate limit).",
            httpStatus
          );
        }

        if (httpStatus >= 500 && httpStatus < 600) {
          throw new ProviderError(
            AI_PROVIDER_UNKNOWN_ERROR,
            `Cloudflare: errore server HTTP ${httpStatus}.`,
            httpStatus
          );
        }

        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Cloudflare: HTTP ${httpStatus} — ${errorBody.slice(0, 200)}`,
          httpStatus
        );
      }

      const json = await response.json() as {
        result?: { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
        success?: boolean;
        errors?: Array<{ message?: string }>;
      };

      if (!json.success) {
        const errMsg = json.errors?.[0]?.message ?? "Errore sconosciuto Cloudflare";
        log(`ERRORE Cloudflare API: ${errMsg}`);

        if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("ratelimit")) {
          throw new ProviderError(AI_PROVIDER_QUOTA_EXCEEDED, `Cloudflare: ${errMsg}`, httpStatus);
        }

        throw new ProviderError(AI_PROVIDER_UNKNOWN_ERROR, `Cloudflare: ${errMsg}`, httpStatus);
      }

      responseText = json.result?.response ?? "";
      log(`Risposta raw text length: ${responseText.length}`);
      log(`Risposta raw text (primi 500): "${responseText.slice(0, 500)}"`);

      if (!responseText.trim()) {
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          "Cloudflare: risposta vuota.",
          httpStatus
        );
      }

      const jsonStr = extractJsonFromText(responseText);
      log(`JSON extracted length: ${jsonStr.length}`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
        log("JSON parsato con successo");
      } catch (parseErr) {
        log(`ERRORE parsing JSON: ${parseErr}`);
        log(`JSON estratto: "${jsonStr.slice(0, 800)}"`);
        const fallbackJson = extractJsonFallback(responseText);
        if (fallbackJson) {
          try {
            parsed = JSON.parse(fallbackJson);
            log("JSON recuperato con fallback");
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
      const tokenCount = json.result?.usage
        ? {
            input: json.result.usage.prompt_tokens,
            output: json.result.usage.completion_tokens,
            total: json.result.usage.total_tokens,
          }
        : undefined;

      log(`Analisi completata in ${latencyMs}ms: "${suggestion.nome}"`);

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
        log(`ERRORE Cloudflare: [${caught.code}] ${caught.message}`);
        throw caught;
      }

      if (caught instanceof DOMException && caught.name === "AbortError") {
        log(`ERRORE Cloudflare: timeout (60s)`);
        throw new ProviderError(
          AI_PROVIDER_TIMEOUT,
          "Cloudflare: timeout richiesta (60s).",
          "timeout"
        );
      }

      const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
      log(`ERRORE Cloudflare: ${msg}`);
      throw new ProviderError(
        AI_PROVIDER_NETWORK_ERROR,
        `Cloudflare: errore di rete — ${msg}`,
        "network"
      );
    }
  }
}
