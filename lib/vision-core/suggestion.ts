import type { VisionCondition, VisionSuggestion } from "./types";

// ─── Error codes (provider-agnostic) ─────────────────────────────────────────

export const AI_PROVIDER_QUOTA_EXCEEDED = "AI_PROVIDER_QUOTA_EXCEEDED";
export const AI_PROVIDER_NETWORK_ERROR = "AI_PROVIDER_NETWORK_ERROR";
export const AI_PROVIDER_TIMEOUT = "AI_PROVIDER_TIMEOUT";
export const AI_PROVIDER_UNKNOWN_ERROR = "AI_PROVIDER_UNKNOWN_ERROR";

// ─── Parsing del suggerimento ────────────────────────────────────────────────
// Copia controllata di lib/product-assistant/providers/utils.ts.
// Parità verificata da tests/vision-core-parity.spec.mjs.

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

function parseCondition(value: unknown): VisionCondition {
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

export function parseVisionSuggestion(raw: unknown): VisionSuggestion {
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
    immaginePrincipale: parseString(payload.image_url ?? payload.immaginePrincipale),
    descrizioneCompleta: parseString(payload.descrizione_completa ?? payload.descrizioneCompleta),
    caratteristiche: parseStringsArray(payload.caratteristiche),
    pesoVolume: parseString(payload.peso_volume ?? payload.pesoVolume),
    seoTitle: parseString(payload.seo_title ?? payload.seoTitle),
    seoDescription: parseString(payload.seo_description ?? payload.seoDescription),
    altTextImmagine: parseString(payload.alt_text_immagine ?? payload.altTextImmagine),
    filtriCatalogo: parseFiltriCatalogo(payload.filtri_catalogo ?? payload.filtriCatalogo),
    formato: null,
    tipoConfezione: null,
    codiceEan: null,
    produttore: null,
    ingredienti: [],
    allergeni: [],
  };
}

// ─── Estrazione testo JSON ────────────────────────────────────────────────────
// Copia della logica usata dalla route venditori (fence markdown del modello
// chat e ritaglio tra la prima "{" e l'ultima "}").

export function stripCodeFence(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractJsonText(text: string): string {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // prosegue con il ritaglio
  }
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return trimmed.slice(braceStart, braceEnd + 1);
  }
  return trimmed;
}

export type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false };

export function parseVisionJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(extractJsonText(text)) };
  } catch {
    return { ok: false };
  }
}
