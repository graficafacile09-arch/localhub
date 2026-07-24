import type { VisionProvider } from "./providers/base";
import { GeminiProvider } from "./providers/gemini";
import type {
  ProductVisionSuggestion,
  VisionContext,
  VisionImage,
} from "./types";

/** Soglia sotto la quale il riconoscimento è considerato inaffidabile */
const LOW_CONFIDENCE_THRESHOLD = 60;

// ─── Risultato del servizio (discriminated union) ─────────────────────────────

export type VisionServiceResult =
  | {
      /** Provider configurato e risposta valida */
      success: true;
      suggestion: ProductVisionSuggestion;
      /** true se confidenza < 60: il frontend deve mostrare un avviso */
      lowConfidence: boolean;
    }
  | {
      /** Provider non disponibile (es. chiave API mancante) */
      success: false;
      /** true se il servizio è disabilitato per mancanza di configurazione */
      disabled: true;
      /** Messaggio chiaro per l'utente (non tecnico) */
      message: string;
    }
  | {
      /** Quota API Gemini esaurita */
      success: false;
      disabled: false;
      code: "GEMINI_QUOTA_EXCEEDED";
      message: string;
    };

// ─── Factory: istanzia il provider corretto in base a VISION_PROVIDER ─────────

function createProvider(): VisionProvider | null {
  const providerName = (process.env.VISION_PROVIDER ?? "gemini").toLowerCase();

  switch (providerName) {
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return null;
      }
      const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
      return new GeminiProvider(apiKey, model);
    }

    // ── Aggiungere qui i provider futuri ────────────────────────────────────
    // case "openai": {
    //   const apiKey = process.env.OPENAI_API_KEY;
    //   if (!apiKey) return null;
    //   return new OpenAiProvider(apiKey);
    // }
    // case "claude": {
    //   const apiKey = process.env.ANTHROPIC_API_KEY;
    //   if (!apiKey) return null;
    //   return new ClaudeProvider(apiKey);
    // }
    // ────────────────────────────────────────────────────────────────────────

    default:
      return null;
  }
}

// ─── Entry point del servizio ─────────────────────────────────────────────────

function log(...args: unknown[]) {
  console.log("[VisionService]", ...args);
}

export async function analyzeImages(
  images: VisionImage[],
  context?: VisionContext
): Promise<VisionServiceResult> {
  if (images.length === 0) {
    return {
      success: false,
      disabled: true,
      message: "Nessuna immagine fornita per l'analisi.",
    };
  }

  const provider = createProvider();

  if (!provider) {
    const providerName = (process.env.VISION_PROVIDER ?? "gemini").toLowerCase();

    const message =
      providerName === "gemini"
        ? "Il riconoscimento automatico dei prodotti tramite fotocamera non è attivo. Per abilitarlo, aggiungi GEMINI_API_KEY al file .env.local. Puoi ottenere una chiave gratuita su https://aistudio.google.com/apikey."
        : `Il provider "${providerName}" non è configurato o la chiave API è mancante. Controlla le impostazioni.`;

    console.warn(`[VisionService] ${message}`);

    return {
      success: false,
      disabled: true,
      message,
    };
  }

  try {
    log("Chiamata provider.analyze()...");
    const suggestion = await provider.analyze(images, context);
    log(`Provider.analyze() completato: "${suggestion.nome}"`);

    return {
      success: true,
      suggestion,
      lowConfidence: suggestion.confidenza < LOW_CONFIDENCE_THRESHOLD,
    };
  } catch (caught: unknown) {
    const message =
      caught instanceof Error ? caught.message : "Errore sconosciuto durante l'analisi.";
    const stack = caught instanceof Error ? caught.stack : undefined;

    log(`ERRORE provider.analyze(): ${message}`);
    if (stack) log(stack);

    if (
      caught &&
      typeof caught === "object" &&
      "code" in caught &&
      (caught as Record<string, unknown>).code === "GEMINI_QUOTA_EXCEEDED"
    ) {
      return {
        success: false,
        disabled: false,
        code: "GEMINI_QUOTA_EXCEEDED" as const,
        message:
          "La quota API di Gemini è esaurita. Riprova più tardi oppure abilita la fatturazione sul progetto Google AI Studio.",
      };
    }

    return {
      success: false,
      disabled: true,
      message: `Il provider AI ha restituito un errore: ${message}. Riprova o contatta l'assistenza.`,
    };
  }
}
