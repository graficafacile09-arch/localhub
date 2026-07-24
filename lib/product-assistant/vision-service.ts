import type { VisionProvider } from "./providers/base";
import { CloudflareProvider } from "./providers/cloudflare";
import { GeminiProvider } from "./providers/gemini";
import { MoondreamProvider } from "./providers/moondream";
import { OpenRouterProvider } from "./providers/openrouter";
import { ProviderError, type AttemptLog, formatProviderLog } from "./providers/utils";
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
// Moondream 3.1 è il provider primario (2B parametri attivi, inferenza veloce).
// Cloudflare (Gemma 4) è il fallback principale.
// OpenRouter e Gemini sono solo provider di emergenza.

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

function buildMoondream(): VisionProvider | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;
  return new MoondreamProvider(accountId, apiToken);
}

function buildOpenRouter(): VisionProvider | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENROUTER_MODEL ?? "qwen/qwen2.5-vl-72b-instruct";
  return new OpenRouterProvider(apiKey, model);
}

function buildGemini(): VisionProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  return new GeminiProvider(apiKey, model);
}

const PROVIDER_CHAIN: ProviderEntry[] = [
  { name: "Moondream", build: buildMoondream },
  { name: "Cloudflare", build: buildCloudflare },
  { name: "OpenRouter", build: buildOpenRouter },
  { name: "Gemini", build: buildGemini },
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


