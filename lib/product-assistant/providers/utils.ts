import type { ProductCondition, ProductVisionSuggestion } from "../types";

// ─── Error codes (provider-agnostic) ─────────────────────────────────────────

export const AI_PROVIDER_QUOTA_EXCEEDED = "AI_PROVIDER_QUOTA_EXCEEDED";
export const AI_PROVIDER_NETWORK_ERROR = "AI_PROVIDER_NETWORK_ERROR";
export const AI_PROVIDER_TIMEOUT = "AI_PROVIDER_TIMEOUT";
export const AI_PROVIDER_UNKNOWN_ERROR = "AI_PROVIDER_UNKNOWN_ERROR";

// ─── ProviderError class ─────────────────────────────────────────────────────

export class ProviderError extends Error {
  code: string;
  httpStatus: number | string;

  constructor(code: string, message: string, httpStatus: number | string = "unknown") {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ─── Risultato di una chiamata provider (con metadata per il logging) ────────

export type ProviderResult = {
  suggestion: ProductVisionSuggestion;
  model: string;
  latencyMs: number;
  tokenCount?: { input?: number; output?: number; total?: number };
  httpStatus: number | string;
};

// ─── JSON parsing utilities (condivise tra tutti i provider) ─────────────────

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

// ─── Estrazione del suggerimento da JSON grezzo ──────────────────────────────

export function extractSuggestion(raw: unknown): ProductVisionSuggestion {
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

// ─── Estrazione JSON da testo (con vari tentativi) ───────────────────────────

export function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
  }

  const noMarkdown = trimmed
    .replace(/^```(?:json)?\s*\n*/i, "")
    .replace(/\n*\s*```\s*$/i, "")
    .replace(/```(?:json)?/gi, "")
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

export function extractJsonFallback(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

// ─── Suggerimento vuoto (valore di default) ──────────────────────────────────

export function emptySuggestion(): ProductVisionSuggestion {
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

// ─── Rilevamento MIME type da filename ───────────────────────────────────────

export function detectMimeType(filename: string): string {
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

// ─── Helpers per il logging strutturato ──────────────────────────────────────

export type AttemptLog = {
  provider: string;
  model?: string;
  httpStatus?: number | string;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  tokenCount?: { input?: number; output?: number; total?: number };
};

export function formatProviderLog(
  requestId: string,
  attempts: AttemptLog[],
  finalProvider: string | null
): string {
  const lines: string[] = [];
  lines.push("=".repeat(40));
  lines.push(`Richiesta Vision AI [${requestId}]`);
  lines.push("-".repeat(40));

  for (const attempt of attempts) {
    lines.push(`Provider tentato: ${attempt.provider}`);
    if (attempt.model) lines.push(`  Modello: ${attempt.model}`);
    if (attempt.httpStatus) lines.push(`  HTTP Status: ${attempt.httpStatus}`);
    lines.push(`  Tempo: ${attempt.latencyMs}ms`);
    if (attempt.tokenCount) {
      const t = attempt.tokenCount;
      lines.push(`  Token: ${t.total ?? "?"} (${t.input ?? "?"} in / ${t.output ?? "?"} out)`);
    }
    if (attempt.errorCode) {
      lines.push(`  ERRORE: [${attempt.errorCode}] ${attempt.errorMessage ?? ""}`);
    }
    lines.push("-".repeat(40));
  }

  lines.push(`Provider finale: ${finalProvider ?? "NESSUNO"}`);
  lines.push("=".repeat(40));

  return lines.join("\n");
}
