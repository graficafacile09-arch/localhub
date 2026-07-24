import { buildVisionPrompt } from "../prompts";
import type { ProductCondition, ProductVisionSuggestion, VisionContext, VisionImage } from "../types";
import type { VisionProvider } from "./base";

function parseString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseCondition(value: unknown): ProductCondition {
  if (value === "usato" || value === "ricondizionato") return value;
  return "nuovo";
}

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? item.split(/[,;]\s*/) : []))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,;]\s*/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function parseConfidenza(value: unknown): number {
  const n = parseNumber(value);
  if (n === null) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseQuantita(value: unknown): number {
  const n = parseNumber(value);
  if (n === null || n < 1) return 1;
  return Math.round(n);
}

function parseStringsArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/^\[|\]$/g, "").trim();
    if (!cleaned) return [];
    return cleaned
      .split(/[,;]\s*/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}

function parseFiltriCatalogo(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const result: Record<string, string> = {};
    let hasEntries = false;
    for (const [key, val] of Object.entries(record)) {
      if (typeof val === "string" && val.trim()) {
        result[key] = val.trim();
        hasEntries = true;
      }
    }
    return hasEntries ? result : null;
  }
  return null;
}

function extractSuggestion(raw: unknown): ProductVisionSuggestion {
  const payload =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    nome: parseString(payload.nome) ?? "",
    descrizione: parseString(payload.descrizione) ?? "",
    categoria: parseString(payload.categoria) ?? "",
    sottocategoria: parseString(payload.sottocategoria),
    marca: parseString(payload.marca),
    colore: parseString(payload.colore),
    materiale: parseString(payload.materiale),
    paroleChiave: parseKeywords(payload.parole_chiave ?? payload.paroleChiave),
    prezzoSuggerito: parseNumber(payload.prezzo_suggerito ?? payload.prezzoSuggerito),
    statoCondizione: parseCondition(payload.stato_condizione ?? payload.statoCondizione),
    quantitaSuggerita: parseQuantita(payload.quantita_suggerita ?? payload.quantitaSuggerita),
    confidenza: parseConfidenza(payload.confidenza),
    immaginePrincipale: null,
    descrizioneCompleta: parseString(payload.descrizione_completa ?? payload.descrizioneCompleta),
    caratteristiche: parseStringsArray(payload.caratteristiche),
    pesoVolume: parseString(payload.peso_volume ?? payload.pesoVolume),
    seoTitle: parseString(payload.seo_title ?? payload.seoTitle),
    seoDescription: parseString(payload.seo_description ?? payload.seoDescription),
    altTextImmagine: parseString(payload.alt_text_immagine ?? payload.altTextImmagine),
    filtriCatalogo: parseFiltriCatalogo(payload.filtri_catalogo ?? payload.filtriCatalogo),
  };
}

function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
  }

  const noMarkdown = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    JSON.parse(noMarkdown);
    return noMarkdown;
  } catch {
  }

  const firstBrace = noMarkdown.indexOf("{");
  const lastBrace = noMarkdown.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return noMarkdown.slice(firstBrace, lastBrace + 1);
  }

  return noMarkdown;
}

function extractJsonFallback(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function emptySuggestion(): ProductVisionSuggestion {
  return {
    nome: "",
    descrizione: "",
    descrizioneCompleta: null,
    categoria: "",
    sottocategoria: null,
    marca: null,
    colore: null,
    materiale: null,
    caratteristiche: [],
    pesoVolume: null,
    paroleChiave: [],
    filtriCatalogo: null,
    prezzoSuggerito: null,
    statoCondizione: "nuovo",
    quantitaSuggerita: 1,
    confidenza: 0,
    immaginePrincipale: null,
    seoTitle: null,
    seoDescription: null,
    altTextImmagine: null,
  };
}

function log(...args: unknown[]) {
  console.log("[OpenRouterProvider]", ...args);
}

function detectMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  };
  return mimeTypes[ext] ?? "image/jpeg";
}

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
  ): Promise<ProductVisionSuggestion> {
    const prompt = buildVisionPrompt(context);

    log(`Modello: ${this.model}, immagini: ${images.length}`);
    log(`Prompt (primi 300): "${prompt.slice(0, 300)}..."`);
    log(`OPENROUTER_API_KEY presente: ${Boolean(this.apiKey)}`);

    const content: OpenRouterMessage["content"] = [{ type: "text", text: prompt }];

    for (const image of images) {
      const mimeType = detectMimeType(image.filename);
      const base64 = image.buffer.toString("base64");
      log(`Immagine: ${image.filename} (${mimeType}, ${base64.length} bytes base64)`);
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    }

    const messages: OpenRouterMessage[] = [{ role: "user", content }];

    let responseText: string;
    try {
      log("Chiamata OpenRouter API in corso...");
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
      });

      const httpStatus = response.status;
      log(`Risposta OpenRouter: HTTP ${httpStatus}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        log(`ERRORE OpenRouter (HTTP ${httpStatus}): ${errorBody}`);

        if (httpStatus === 429) {
          const quotaError = new Error("OpenRouter quota exceeded");
          (quotaError as unknown as Record<string, unknown>).code = "AI_PROVIDER_QUOTA_EXCEEDED";
          throw quotaError;
        }

        return emptySuggestion();
      }

      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      responseText = json.choices?.[0]?.message?.content ?? "";
      log(`Risposta raw text length: ${responseText.length}`);
      log(`Risposta raw text (primi 500): "${responseText.slice(0, 500)}"`);
    } catch (caught: unknown) {
      if (caught instanceof Error && "code" in caught && (caught as unknown as Record<string, unknown>).code === "AI_PROVIDER_QUOTA_EXCEEDED") {
        throw caught;
      }
      const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
      log(`ERRORE chiamata OpenRouter: ${msg}`);
      if (caught instanceof Error && caught.stack) log(`Stack: ${caught.stack}`);
      return emptySuggestion();
    }

    if (!responseText.trim()) {
      log("ERRORE: risposta OpenRouter vuota");
      return emptySuggestion();
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
          log("ERRORE anche fallback JSON");
          return emptySuggestion();
        }
      } else {
        return emptySuggestion();
      }
    }

    return extractSuggestion(parsed);
  }
}
