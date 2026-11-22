import type { VisionProvider } from "./providers/base";
import { CloudflareProvider } from "./providers/cloudflare";
import { OpenRouterProvider } from "./providers/openrouter";
import { ProviderError, type AttemptLog, formatProviderLog } from "./providers/utils";
import { checkImageCache, storeInCache } from "./vision-cache";
import type {
  ProductVisionSuggestion,
  VisionContext,
  VisionImage,
} from "./types";

const LOW_CONFIDENCE_THRESHOLD = 60;

// ─── Risultato del servizio (discriminated union — invariata) ────────────────

export type VisionServiceResult =
  | {
      success: true;
      suggestion: ProductVisionSuggestion;
      lowConfidence: boolean;
    }
  | {
      success: false;
      disabled: true;
      message: string;
    }
  | {
      success: false;
      disabled: false;
      code: "AI_PROVIDER_QUOTA_EXCEEDED";
      message: string;
    };

// ─── Catena fissa di provider ─────────────────────────────────────────────────
// Cloudflare (Gemma 4) è il provider principale.
// OpenRouter è solo provider di emergenza.

type ProviderEntry = {
  name: string;
  build: () => VisionProvider | null;
};

function buildCloudflare(): VisionProvider | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;
  return new CloudflareProvider(accountId, apiToken);
}

function buildOpenRouter(): VisionProvider | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENROUTER_MODEL ?? "qwen/qwen2.5-vl-72b-instruct";
  return new OpenRouterProvider(apiKey, model);
}

const PROVIDER_CHAIN: ProviderEntry[] = [
  { name: "Cloudflare", build: buildCloudflare },
  { name: "OpenRouter", build: buildOpenRouter },
];

// ─── Entry point del servizio ─────────────────────────────────────────────────

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  const ts = Date.now().toString(36).slice(-4);
  return `V${ts}-${requestCounter}`;
}

export async function analyzeImages(
  images: VisionImage[],
  context?: VisionContext
): Promise<VisionServiceResult> {
  const requestId = nextRequestId();
  const attempts: AttemptLog[] = [];

  if (images.length === 0) {
    return {
      success: false,
      disabled: true,
      message: "Nessuna immagine fornita per l'analisi.",
    };
  }

  const primaryImage = images[0];
  const cacheLookupStart = Date.now();

  if (primaryImage) {
    const cached = await checkImageCache(primaryImage.buffer);
    if (cached.hit) {
      const latencyMs = Date.now() - cacheLookupStart;
      console.log(`[${requestId}] CACHE HIT — ${cached.entry.product_name} (${cached.entry.model_used}, hit #${cached.entry.hit_count}) — ${latencyMs}ms`);
      const suggestion = cached.entry.full_suggestion ?? {
        nome: cached.entry.product_name,
        marca: cached.entry.brand,
        categoria: cached.entry.category,
        codiceEan: cached.entry.ean,
        prezzoSuggerito: cached.entry.suggested_price,
        descrizione: cached.entry.description,
        confidenza: cached.entry.confidence,
      } as ProductVisionSuggestion;
      return {
        success: true,
        suggestion,
        lowConfidence: suggestion.confidenza < LOW_CONFIDENCE_THRESHOLD,
      };
    }
  }

  for (const entry of PROVIDER_CHAIN) {
    const provider = entry.build();
    if (!provider) {
      continue;
    }

    const attemptStart = Date.now();
    const attempt: AttemptLog = { provider: entry.name, latencyMs: 0 };

    try {
      const result = await provider.analyze(images, context);

      attempt.model = result.model;
      attempt.httpStatus = result.httpStatus;
      attempt.latencyMs = result.latencyMs;
      attempt.tokenCount = result.tokenCount;

      attempts.push(attempt);

      if (primaryImage) {
        storeInCache(primaryImage.buffer, result.suggestion, result.model).catch(() => {});
        console.log(`[${requestId}] CACHE STORE — ${result.suggestion.nome} (${result.model}, ${result.latencyMs}ms)`);
      }

      return {
        success: true,
        suggestion: result.suggestion,
        lowConfidence: result.suggestion.confidenza < LOW_CONFIDENCE_THRESHOLD,
      };
    } catch (caught: unknown) {
      attempt.latencyMs = Date.now() - attemptStart;
      if (caught instanceof ProviderError) {
        attempt.httpStatus = caught.httpStatus;
        attempt.errorCode = caught.code;
        attempt.errorMessage = caught.message;
      } else {
        const msg = caught instanceof Error ? caught.message : "Errore sconosciuto";
        attempt.errorCode = "UNKNOWN";
        attempt.errorMessage = msg;
      }

      attempts.push(attempt);
    }
  }

  const lastAttempt = attempts[attempts.length - 1];
  if (lastAttempt?.errorCode === "AI_PROVIDER_QUOTA_EXCEEDED") {
    return {
      success: false,
      disabled: false,
      code: "AI_PROVIDER_QUOTA_EXCEEDED" as const,
      message: "La quota del provider AI è temporaneamente esaurita. Riprova più tardi.",
    };
  }

  // Se almeno un provider era configurato ma ha fallito
  const anyConfigured = attempts.length > 0;
  if (anyConfigured) {
    return {
      success: false,
      disabled: true,
      message: "Tutti i provider AI hanno fallito. Controlla i log per i dettagli.",
    };
  }

  // Nessun provider configurato
  return {
    success: false,
    disabled: true,
    message:
      "Nessun provider AI configurato. Per abilitare il riconoscimento prodotti, segui le istruzioni in .env.example.",
  };
}

// ─── Variante con prompt esplicito (RadiciScan) ──────────────────────────────

export interface OpzioniVisionPrompt {
  /** Budget del primo tentativo (Gemma). */
  timeoutMs?: number;
  /** Budget di ogni tentativo di fallback. */
  fallbackTimeoutMs?: number;
  /** Token di output richiesti al provider. */
  maxOutputTokens?: number;
  /** Catena alternativa, usata dai test per evitare la rete. */
  catena?: ReadonlyArray<ProviderEntry>;
  /** Validazione specifica del chiamante: se fallisce si prova il fallback. */
  validateRawText?: (text: string) => boolean;
}

export const TIMEOUT_VISION_PROMPT_MS = 15_000;
export const TIMEOUT_VISION_PROMPT_FALLBACK_MS = 7_000;

/**
 * Esegue la stessa catena Gemma -> OpenRouter di Aggiungi prodotti, senza
 * cache commerciale e senza trasformare l'output nello schema prodotto.
 *
 * Il fallback scatta **solo** quando il provider fallisce davvero (HTTP, rete,
 * timeout, risposta vuota). Un testo ben formato ma non conforme allo schema
 * non provoca una seconda chiamata: viene restituito al chiamante, che lo
 * valida con un parser tollerante. È così che si evitano le attese di 55-60 s
 * per un errore correggibile localmente.
 */
export async function analyzeImagesWithPrompt(
  images: VisionImage[],
  prompt: string,
  signal?: AbortSignal,
  opzioni: OpzioniVisionPrompt = {}
): Promise<{ rawText: string; model: string; provider: string }> {
  if (images.length === 0) throw new Error("Nessuna immagine fornita per l'analisi.");

  const catena = opzioni.catena ?? PROVIDER_CHAIN;
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_VISION_PROMPT_MS;
  const fallbackTimeoutMs =
    opzioni.fallbackTimeoutMs ?? TIMEOUT_VISION_PROMPT_FALLBACK_MS;

  let ultimoErrore: unknown = null;
  let ultimoTestoNonValido: { rawText: string; model: string; provider: string } | null = null;
  let tentativi = 0;

  for (const entry of catena) {
    const provider = entry.build();
    if (!provider) continue;

    const budget = tentativi === 0 ? timeoutMs : fallbackTimeoutMs;
    tentativi += 1;

    try {
      const result = await provider.analyze(images, undefined, prompt, signal, {
        timeoutMs: budget,
        maxOutputTokens: opzioni.maxOutputTokens,
      });

      if (!result.rawText?.trim()) {
        throw new ProviderError(
          "AI_PROVIDER_UNKNOWN_ERROR",
          `${entry.name}: risposta vuota.`,
          result.httpStatus
        );
      }

      if (opzioni.validateRawText && !opzioni.validateRawText(result.rawText)) {
        ultimoTestoNonValido = {
          rawText: result.rawText,
          model: result.model,
          provider: entry.name,
        };
        console.warn(
          `[radiscan][vision] provider=${entry.name} esito=schema_non_valido budget=${budget}ms`
        );
        continue;
      }

      return { rawText: result.rawText, model: result.model, provider: entry.name };
    } catch (error) {
      ultimoErrore = error;
      const codice =
        error instanceof ProviderError ? error.code : "UNKNOWN";
      console.warn(
        `[radiscan][vision] provider=${entry.name} esito=errore codice=${codice} budget=${budget}ms`
      );
    }
  }

  // Se anche il fallback non produce uno schema valido, restituiamo l'ultimo
  // testo ricevuto: il parser RadiciScan emetterà il suo errore strutturato.
  if (ultimoTestoNonValido) return ultimoTestoNonValido;
  if (ultimoErrore instanceof Error) throw ultimoErrore;
  throw new Error("Nessun provider vision configurato o disponibile.");
}
