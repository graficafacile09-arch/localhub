import { GoogleGenAI, type Part } from "@google/genai";
import { buildVisionPrompt } from "../prompts";
import type { ProductCondition, ProductVisionSuggestion, VisionContext, VisionImage } from "../types";
import type { VisionProvider } from "./base";

// ─── Parsing robusto della risposta JSON di Gemini ────────────────────────────

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

// ─── Provider Gemini ──────────────────────────────────────────────────────────

function log(...args: unknown[]) {
  console.log("[GeminiProvider]", ...args);
}

/**
 * Estrae una stringa JSON valida da un testo che può contenere
 * markdown, spiegazioni, caratteri di contorno.
 * Strategia: trova il primo { e l'ultimo }, e prendi tutto il contenuto.
 */
function extractJsonFromText(text: string): string {
  // 1. Tenta parsing diretto (se è già JSON puro)
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // non è JSON puro — procedi
  }

  // 2. Rimuove blocchi markdown ```json ... ```
  const noMarkdown = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    JSON.parse(noMarkdown);
    return noMarkdown;
  } catch {
    // ancora non valido — procedi
  }

  // 3. Cerca il primo `{` e l'ultimo `}` (JSON object)
  const firstBrace = noMarkdown.indexOf("{");
  const lastBrace = noMarkdown.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return noMarkdown.slice(firstBrace, lastBrace + 1);
  }

  // 4. Se tutto fallisce, ritorna il testo ripulito da markdown
  return noMarkdown;
}

/**
 * Fallback: cerca il primo `{` e l'ultimo `}` nel testo originale
 * (utile quando il testo ha più blocchi e il primo estratto non era valido)
 */
function extractJsonFallback(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

export class GeminiProvider implements VisionProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-1.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async analyze(
    images: VisionImage[],
    context?: VisionContext
  ): Promise<ProductVisionSuggestion> {
    const prompt = buildVisionPrompt(context);

    log(`Modello: ${this.model}, immagini: ${images.length}`);
    log(`Prompt (primi 300): "${prompt.slice(0, 300)}..."`);
    log(`GEMINI_API_KEY presente: ${Boolean(this.client)}`);

    // Costruisce le parti multimodali: testo + immagini
    const parts: Part[] = [{ text: prompt }];

    for (const image of images) {
      const mimeType = this.detectMimeType(image.filename);
      const base64 = image.buffer.toString("base64");
      log(`Immagine: ${image.filename} (${mimeType}, ${base64.length} bytes base64)`);
      parts.push({
        inlineData: { mimeType, data: base64 },
      });
    }

    let response;
    let httpStatus = "unknown";
    try {
      log("Chiamata Gemini generateContent in corso...");
      response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts }],
      });
      httpStatus = "200";
      log("Risposta Gemini ricevuta (HTTP 200)");
    } catch (caught: unknown) {
      const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
      const status = caught && typeof caught === "object" && "status" in caught
        ? String((caught as { status: unknown }).status)
        : "unknown";
      log(`ERRORE chiamata Gemini (HTTP ${status}): ${msg}`);
      if (caught instanceof Error && caught.stack) log(`Stack: ${caught.stack}`);

      if (status === "429") {
        const quotaError = new Error("Gemini quota exceeded");
        (quotaError as unknown as Record<string, unknown>).code = "GEMINI_QUOTA_EXCEEDED";
        throw quotaError;
      }

      return emptySuggestion();
    }

    // Legge il testo raw dalla risposta
    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    log(`Risposta raw text length: ${rawText.length}`);
    log(`Risposta raw text (primi 500): "${rawText.slice(0, 500)}"`);

    if (!rawText.trim()) {
      log("ERRORE: risposta Gemini vuota");
      const finishReason = response.candidates?.[0]?.finishReason ?? "unknown";
      log(`Finish reason: ${finishReason}`);
      return emptySuggestion();
    }

    // Estrae JSON dalla risposta — gestisce wrapping markdown, testo prima/dopo
    const jsonStr = extractJsonFromText(rawText);
    log(`JSON extracted length: ${jsonStr.length}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
      log("JSON parsato con successo");
    } catch (parseErr) {
      log(`ERRORE parsing JSON: ${parseErr}`);
      log(`JSON estratto: "${jsonStr.slice(0, 800)}"`);
      // Tentativo: trova il primo { e ultimo } nel testo raw
      const fallbackJson = extractJsonFallback(rawText);
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

  private detectMimeType(filename: string): string {
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
