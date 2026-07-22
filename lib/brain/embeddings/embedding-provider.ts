/**
 * LocalHub Brain — Embedding Provider
 *
 * Interfaccia unificata per la generazione di vettori di embedding.
 * Supporta Gemini (text-embedding-004) e OpenAI (text-embedding-3-small).
 *
 * Configurazione:
 *   BRAIN_EMBEDDING_PROVIDER=gemini|openai  (default: gemini)
 *   GEMINI_API_KEY                          (per Gemini)
 *   OPENAI_API_KEY                          (per OpenAI)
 *
 * Se nessun provider è configurato, getEmbeddingProvider() ritorna null
 * e il sistema opera in modalità solo-keyword senza errori.
 *
 * @module lib/brain/embeddings/embedding-provider
 */

// ─── Interfaccia ──────────────────────────────────────────────────────────────

/** Risultato della generazione di un embedding */
export interface EmbeddingResult {
  /** Il vettore numerico (float[]) */
  vector: number[];

  /** Dimensione del vettore */
  dimensions: number;

  /** Nome del modello usato */
  model: string;

  /** Nome del provider */
  provider: string;
}

/** Contratto comune per tutti i provider di embedding */
export interface EmbeddingProvider {
  /** Nome identificativo del provider */
  readonly name: string;

  /** Modello in uso */
  readonly model: string;

  /** Dimensione dei vettori prodotti */
  readonly dimensions: number;

  /**
   * Genera un vettore di embedding per il testo dato.
   * @throws Error se la chiamata API fallisce
   */
  embed(text: string): Promise<EmbeddingResult>;
}

// ─── Gemini Embedding Provider ────────────────────────────────────────────────

const GEMINI_EMBED_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Risposta dell'API Gemini embedContent */
interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
  error?: { message?: string };
}

/**
 * Provider Gemini per embeddings testuali.
 * Modello: text-embedding-004 (768 dimensioni).
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini";
  readonly model: string;
  readonly dimensions = 768;

  private readonly apiKey: string;

  constructor(apiKey?: string, model = "text-embedding-004") {
    const key = apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GeminiEmbeddingProvider: GEMINI_API_KEY mancante"
      );
    }
    this.apiKey = key;
    this.model = model;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const url = `${GEMINI_EMBED_API_BASE}/${this.model}:embedContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `GeminiEmbeddingProvider: errore API (${response.status}) — ${errText}`
      );
    }

    const data = (await response.json()) as GeminiEmbedResponse;

    if (data.error?.message) {
      throw new Error(`GeminiEmbeddingProvider: ${data.error.message}`);
    }

    const vector = data.embedding?.values;
    if (!vector || vector.length === 0) {
      throw new Error("GeminiEmbeddingProvider: risposta senza vettore");
    }

    return {
      vector,
      dimensions: vector.length,
      model: this.model,
      provider: this.name,
    };
  }
}

// ─── OpenAI Embedding Provider ────────────────────────────────────────────────

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";

/** Risposta dell'API OpenAI embeddings */
interface OpenAIEmbedResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

/**
 * Provider OpenAI per embeddings testuali.
 * Modello: text-embedding-3-small (1536 dimensioni).
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dimensions = 1536;

  private readonly apiKey: string;

  constructor(apiKey?: string, model = "text-embedding-3-small") {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OpenAIEmbeddingProvider: OPENAI_API_KEY mancante"
      );
    }
    this.apiKey = key;
    this.model = model;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `OpenAIEmbeddingProvider: errore API (${response.status}) — ${errText}`
      );
    }

    const data = (await response.json()) as OpenAIEmbedResponse;

    if (data.error?.message) {
      throw new Error(`OpenAIEmbeddingProvider: ${data.error.message}`);
    }

    const vector = data.data?.[0]?.embedding;
    if (!vector || vector.length === 0) {
      throw new Error("OpenAIEmbeddingProvider: risposta senza vettore");
    }

    return {
      vector,
      dimensions: vector.length,
      model: this.model,
      provider: this.name,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Ritorna il provider di embedding configurato, o null se nessuna chiave è disponibile.
 *
 * Ordine di preferenza:
 * 1. Provider indicato da BRAIN_EMBEDDING_PROVIDER
 * 2. Fallback automatico all'altro provider se la chiave del preferito manca
 * 3. null se nessuna chiave è disponibile
 *
 * @param preferred - Provider preferito ("gemini" | "openai"), default da env
 */
export function getEmbeddingProvider(
  preferred?: "gemini" | "openai"
): EmbeddingProvider | null {
  const providerName =
    preferred ??
    (process.env.BRAIN_EMBEDDING_PROVIDER as "gemini" | "openai" | undefined) ??
    "gemini";

  // Tenta il provider preferito
  if (providerName === "openai") {
    if (process.env.OPENAI_API_KEY) {
      try { return new OpenAIEmbeddingProvider(); } catch { /* fallthrough */ }
    }
    // Fallback a Gemini
    if (process.env.GEMINI_API_KEY) {
      try { return new GeminiEmbeddingProvider(); } catch { /* fallthrough */ }
    }
  } else {
    // gemini (default)
    if (process.env.GEMINI_API_KEY) {
      try { return new GeminiEmbeddingProvider(); } catch { /* fallthrough */ }
    }
    // Fallback a OpenAI
    if (process.env.OPENAI_API_KEY) {
      try { return new OpenAIEmbeddingProvider(); } catch { /* fallthrough */ }
    }
  }

  // Nessuna chiave disponibile — modalità solo-keyword
  return null;
}
