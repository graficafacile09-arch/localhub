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
import type {
  OpzioniChiamataProvider,
  VisionProvider,
} from "../product-assistant/providers/base";
import { CloudflareProvider } from "../product-assistant/providers/cloudflare";
import { OpenRouterProvider } from "../product-assistant/providers/openrouter";
import {
  AI_PROVIDER_QUOTA_EXCEEDED,
  AI_PROVIDER_UNKNOWN_ERROR,
  detectMimeType,
  ProviderError,
  type ProviderResult,
} from "../product-assistant/providers/utils";
import type { VisionContext, VisionImage } from "../product-assistant/types";

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

function buildGemini(): VisionProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash";
  return new GeminiVisionProvider(apiKey, model);
}

/**
 * Adattatore Gemini Vision locale a RadiciScan.
 *
 * Non riusa `lib/product-assistant/providers/gemini.ts` perché quel modulo
 * espone una funzione, non un `VisionProvider`: tenerlo qui evita di
 * modificare il codice di Aggiungi prodotti.
 */
class GeminiVisionProvider implements VisionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly modello: string
  ) {}

  get model(): string {
    return `google/${this.modello}`;
  }

  async analyze(
    images: VisionImage[],
    _context?: VisionContext,
    promptOverride?: string,
    signal?: AbortSignal,
    opzioni?: OpzioniChiamataProvider
  ): Promise<ProviderResult> {
    const prompt = promptOverride ?? "Descrivi l'etichetta.";
    const inizio = Date.now();

    const parti = [
      { text: prompt },
      ...images.map((immagine) => ({
        inline_data: {
          mime_type: detectMimeType(immagine.filename),
          data: immagine.buffer.toString("base64"),
        },
      })),
    ];

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      opzioni?.timeoutMs ?? 12_000
    );
    const annullaSegnale = () => controller.abort();
    signal?.addEventListener("abort", annullaSegnale, { once: true });
    if (signal?.aborted) controller.abort();

    try {
      const risposta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modello}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: parti }],
            generationConfig: {
              maxOutputTokens: opzioni?.maxOutputTokens ?? 1_400,
              temperature: 0.1,
            },
          }),
        }
      );

      if (!risposta.ok) {
        const corpo = await risposta.text().catch(() => "");
        const codice =
          risposta.status === 429
            ? AI_PROVIDER_QUOTA_EXCEEDED
            : AI_PROVIDER_UNKNOWN_ERROR;
        throw new ProviderError(
          codice,
          `Gemini: HTTP ${risposta.status}. Body: ${corpo.slice(0, 300)}`,
          risposta.status
        );
      }

      const corpo = (await risposta.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const testo =
        corpo.candidates?.[0]?.content?.parts
          ?.map((parte) => parte.text ?? "")
          .join("") ?? "";

      return {
        // RadiciScan legge solo `rawText`: il parser RadiciScan interpreta il
        // testo grezzo e produce il proprio schema. Gli altri campi del
        // contratto condiviso non sono usati da questa catena.
        suggestion: {} as ProviderResult["suggestion"],
        rawText: testo,
        model: this.model,
        latencyMs: Date.now() - inizio,
        httpStatus: risposta.status,
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", annullaSegnale);
    }
  }
}

// Catena: Cloudflare/Gemma 4 -> OpenRouter -> Gemini Vision.
// Ogni voce senza credenziali viene saltata, così un provider non
// configurato non impedisce il tentativo dei successivi.
const PROVIDER_CHAIN: ProviderEntry[] = [
  { name: "Cloudflare", build: buildCloudflare },
  { name: "OpenRouter", build: buildOpenRouter },
  { name: "Gemini", build: buildGemini },
];

export interface OpzioniVisionRadiciScan {
  /** Iniezione per i test: evita chiamate di rete. */
  catena?: ReadonlyArray<ProviderEntry>;
  timeoutMs?: number;
  fallbackTimeoutMs?: number;
  maxOutputTokens?: number;
  primaryOnly?: boolean;
  validateRawText?: (rawText: string) => boolean;
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

  const catenaCompleta = opzioni.catena ?? PROVIDER_CHAIN;
  const catenaEffettiva = opzioni.primaryOnly ? catenaCompleta.slice(0, 1) : catenaCompleta;
  // La route RadiciScan ha un timeout complessivo di 18 s: entrambi i tentativi
  // devono rientrare nel budget, senza attendere i 60 s standard.
  const timeoutMs = opzioni.timeoutMs ?? 12_000;
  const fallbackTimeoutMs = opzioni.fallbackTimeoutMs ?? 5_000;
  const maxOutputTokens = opzioni.maxOutputTokens ?? 1_400;
  let ultimoErrore: unknown = null;
  let ultimoTestoNonValido: { rawText: string; model: string; provider: string } | null = null;
  let tentativi = 0;

  for (const entry of catenaEffettiva) {
    const provider = entry.build();
    if (!provider) continue;

    const budget = tentativi === 0 ? timeoutMs : fallbackTimeoutMs;
    tentativi += 1;
    const tentativoIniziato = Date.now();

    try {
      const result = await provider.analyze(images, undefined, prompt, signal, {
        timeoutMs: budget,
        maxOutputTokens,
      });

      if (!result.rawText?.trim()) {
        throw new ProviderError(
          "AI_PROVIDER_UNKNOWN_ERROR",
          `${entry.name}: risposta vuota.`,
          result.httpStatus
        );
      }

      if (opzioni.validateRawText && !opzioni.validateRawText(result.rawText)) {
        ultimoTestoNonValido = { rawText: result.rawText, model: result.model, provider: entry.name };
        console.warn(
          `[radiscan][vision-copia] provider=${entry.name} esito=schema_non_valido durata_ms=${Date.now() - tentativoIniziato} budget_ms=${budget}`
        );
        continue;
      }
      console.info(
        `[radiscan][vision-copia] provider=${entry.name} esito=ok modello=${result.model} durata_ms=${Date.now() - tentativoIniziato} latency_provider_ms=${result.latencyMs ?? "n/d"} http_status=${result.httpStatus ?? "n/d"} budget_ms=${budget}`
      );
      return { rawText: result.rawText, model: result.model, provider: entry.name };
    } catch (error) {
      ultimoErrore = error;
      const codice = error instanceof ProviderError ? error.code : "UNKNOWN";
      console.warn(
        `[radiscan][vision-copia] provider=${entry.name} esito=errore codice=${codice} durata_ms=${Date.now() - tentativoIniziato} budget_ms=${budget}`
      );
    }
  }

  if (ultimoTestoNonValido) return ultimoTestoNonValido;
  if (ultimoErrore instanceof Error) throw ultimoErrore;
  // Nessun provider configurato: il codice tecnico dice esattamente quali
  // variabili d'ambiente mancano, senza esporne il valore.
  throw new ProviderError(
    "MISSING_KEYS",
    `Nessun provider vision configurato (attesi CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN, OPENROUTER_API_KEY o GEMINI_API_KEY). Catena: ${catenaEffettiva
      .map((voce) => voce.name)
      .join(" -> ")}.`
  );
}
