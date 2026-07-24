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

    // Endpoint OpenAI-compatible (NON l'API REST nativa /ai/run/{model})
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1/chat/completions`;

    let httpStatus: number | string = "unknown";
    let responseText = "";
    let tokenCount: { input?: number; output?: number; total?: number } | undefined;

    try {
      log(`URL chiamata: ${url}`);
      log(`Account ID: ${this.accountId.slice(0, 8)}...`);
      log(`Token: ${this.apiToken.slice(0, 8)}...`);

      const bodyForLog = JSON.stringify({
        model: CLOUDFLARE_MODEL,
        messages: [{ role: "user", content: "..." }],
        max_tokens: 2000,
        temperature: 0.1,
      });
      log(`Body inviato (senza image): ${bodyForLog}`);

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
      log(`STATUS: ${httpStatus}`);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        responseHeaders[key] = value;
      });
      log(`HEADERS: ${JSON.stringify(responseHeaders, null, 2)}`);

      const fullBody = await response.text().catch(() => "unknown");
      log(`BODY COMPLETO: ${fullBody}`);

      if (!response.ok) {

        if (httpStatus === 429) {
          throw new ProviderError(
            AI_PROVIDER_QUOTA_EXCEEDED,
            `Cloudflare quota esaurita (rate limit). Body: ${fullBody.slice(0, 500)}`,
            httpStatus
          );
        }

        if (httpStatus >= 500 && httpStatus < 600) {
          throw new ProviderError(
            AI_PROVIDER_UNKNOWN_ERROR,
            `Cloudflare: errore server HTTP ${httpStatus}. Body: ${fullBody.slice(0, 500)}`,
            httpStatus
          );
        }

        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Cloudflare: HTTP ${httpStatus} — Body: ${fullBody.slice(0, 500)}`,
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
        log(`ERRORE Cloudflare API: ${errMsg}`);

        if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("ratelimit")) {
          throw new ProviderError(AI_PROVIDER_QUOTA_EXCEEDED, `Cloudflare: ${errMsg}`, httpStatus);
        }

        throw new ProviderError(AI_PROVIDER_UNKNOWN_ERROR, `Cloudflare: ${errMsg}`, httpStatus);
      }

      responseText = json.choices?.[0]?.message?.content ?? "";

      // DEBUG: stampa raw content prima del parsing
      console.log("=== CLOUDFLARE choices[0].message.content (raw) ===");
      console.log(responseText);
      console.log("=============================================");

      // Ignora reasoning_content — usiamo solo message.content

      // Pulizia automatica markdown (Gemma restituisce ```json ... ```)
      responseText = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      log(`Risposta raw text length: ${responseText.length}`);
      log(`Risposta raw text (primi 500): "${responseText.slice(0, 500)}"`);

      if (!responseText.trim()) {
        const finishReason = json.choices?.[0]?.finish_reason ?? "unknown";
        log(`Finish reason: ${finishReason}`);
        throw new ProviderError(
          AI_PROVIDER_UNKNOWN_ERROR,
          `Cloudflare: risposta vuota (finish_reason: ${finishReason}).`,
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
      log(`JSON extracted length: ${jsonStr.length}`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
        console.log("JSON PARSED:", JSON.stringify(parsed, null, 2));
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
