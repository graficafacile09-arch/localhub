import type { VisionProvider } from "./providers/base";
import { GeminiProvider } from "./providers/gemini";
import type {
  ProductVisionSuggestion,
  VisionContext,
  VisionImage,
} from "./types";

/** Soglia sotto la quale il riconoscimento è considerato inaffidabile */
const LOW_CONFIDENCE_THRESHOLD = 60;

// ─── Factory: istanzia il provider corretto in base a VISION_PROVIDER ─────────

function createProvider(): VisionProvider {
  const providerName = (process.env.VISION_PROVIDER ?? "gemini").toLowerCase();

  switch (providerName) {
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "GEMINI_API_KEY mancante. Aggiungila al file .env.local per usare il provider Gemini."
        );
      }
      const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
      return new GeminiProvider(apiKey, model);
    }

    // ── Aggiungere qui i provider futuri ────────────────────────────────────
    // case "openai": {
    //   const apiKey = process.env.OPENAI_API_KEY;
    //   if (!apiKey) throw new Error("OPENAI_API_KEY mancante.");
    //   return new OpenAiProvider(apiKey);
    // }
    // case "claude": {
    //   const apiKey = process.env.ANTHROPIC_API_KEY;
    //   if (!apiKey) throw new Error("ANTHROPIC_API_KEY mancante.");
    //   return new ClaudeProvider(apiKey);
    // }
    // ────────────────────────────────────────────────────────────────────────

    default:
      throw new Error(
        `Provider Vision non supportato: "${providerName}". Valori accettati: gemini`
      );
  }
}

// ─── Risultato con flag lowConfidence ─────────────────────────────────────────

export type VisionServiceResult = {
  suggestion: ProductVisionSuggestion;
  /** true se confidenza < 60: il frontend deve mostrare un avviso al merchant */
  lowConfidence: boolean;
};

// ─── Entry point del servizio ─────────────────────────────────────────────────

export async function analyzeImages(
  images: VisionImage[],
  context?: VisionContext
): Promise<VisionServiceResult> {
  if (images.length === 0) {
    throw new Error("Nessuna immagine fornita per l'analisi.");
  }

  const provider = createProvider();
  const suggestion = await provider.analyze(images, context);

  return {
    suggestion,
    lowConfidence: suggestion.confidenza < LOW_CONFIDENCE_THRESHOLD,
  };
}
