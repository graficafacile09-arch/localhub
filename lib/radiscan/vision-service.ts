/**
 * RadiciScan — copia autonoma del servizio vision di Aggiungi prodotti.
 *
 * Mantiene la stessa catena e gli stessi parametri del servizio originale:
 * Cloudflare/Gemma 4 -> OpenRouter, 60 secondi per provider, 1400 token.
 * L'unica differenza è il prompt in ingresso e il fatto che restituiamo
 * il testo grezzo al parser RadiciScan invece dello schema commerciale.
 *
 * Questo file è intenzionalmente duplicato: RadiciScan non dipende dal
 * coordinatore di Aggiungi prodotti e potrà evolvere senza modificarlo.
 */
import type { VisionProvider } from "../product-assistant/providers/base";
import { CloudflareProvider } from "../product-assistant/providers/cloudflare";
import { OpenRouterProvider } from "../product-assistant/providers/openrouter";
import { ProviderError } from "../product-assistant/providers/utils";
import type { VisionImage } from "../product-assistant/types";

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

// Copia fedele della catena usata da Aggiungi prodotti.
const PROVIDER_CHAIN: ProviderEntry[] = [
  { name: "Cloudflare", build: buildCloudflare },
  { name: "OpenRouter", build: buildOpenRouter },
];

export interface OpzioniVisionRadiciScan {
  /** Iniezione per i test: evita chiamate di rete. */
  catena?: ReadonlyArray<ProviderEntry>;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

export async function analyzeRadiciScanImages(
  images: VisionImage[],
  prompt: string,
  signal?: AbortSignal,
  opzioni: OpzioniVisionRadiciScan = {}
): Promise<{ rawText: string; model: string; provider: string }> {
  if (images.length === 0) {
    throw new Error("Nessuna immagine fornita per l'analisi.");
  }

  const catena = opzioni.catena ?? PROVIDER_CHAIN;
  const timeoutMs = opzioni.timeoutMs ?? 60_000;
  const maxOutputTokens = opzioni.maxOutputTokens ?? 1_400;
  let ultimoErrore: unknown = null;

  for (const entry of catena) {
    const provider = entry.build();
    if (!provider) continue;

    try {
      const result = await provider.analyze(images, undefined, prompt, signal, {
        timeoutMs,
        maxOutputTokens,
      });

      if (!result.rawText?.trim()) {
        throw new ProviderError(
          "AI_PROVIDER_UNKNOWN_ERROR",
          `${entry.name}: risposta vuota.`,
          result.httpStatus
        );
      }

      return {
        rawText: result.rawText,
        model: result.model,
        provider: entry.name,
      };
    } catch (error) {
      ultimoErrore = error;
      const codice = error instanceof ProviderError ? error.code : "UNKNOWN";
      console.warn(
        `[radiscan][vision-duplicata] provider=${entry.name} esito=errore codice=${codice}`
      );
    }
  }

  if (ultimoErrore instanceof Error) throw ultimoErrore;
  throw new Error("Nessun provider vision configurato o disponibile.");
}
