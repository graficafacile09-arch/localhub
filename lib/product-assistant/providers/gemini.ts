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
  if (n === null) return 50; // valore neutro di default
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseQuantita(value: unknown): number {
  const n = parseNumber(value);
  if (n === null || n < 1) return 1;
  return Math.round(n);
}

function extractSuggestion(raw: unknown): ProductVisionSuggestion {
  // Gemini a volte avvolge il JSON in un oggetto radice
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
    immaginePrincipale: null, // Gemini non restituisce URL immagine
  };
}

// ─── Provider Gemini ──────────────────────────────────────────────────────────

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

    // Costruisce le parti multimodali: testo + immagini
    const parts: Part[] = [{ text: prompt }];

    for (const image of images) {
      parts.push({
        inlineData: {
          mimeType: this.detectMimeType(image.filename),
          data: image.buffer.toString("base64"),
        },
      });
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Rimuove eventuale wrapping markdown ```json ... ```
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Se Gemini non restituisce JSON valido, ritorna un suggestion vuoto con bassa confidenza
      return {
        nome: "",
        descrizione: "",
        categoria: "",
        sottocategoria: null,
        marca: null,
        colore: null,
        materiale: null,
        paroleChiave: [],
        prezzoSuggerito: null,
        statoCondizione: "nuovo",
        quantitaSuggerita: 1,
        confidenza: 0,
        immaginePrincipale: null,
      };
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
