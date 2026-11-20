import {
  CODICI_ERRORE,
  ErroreRadiciScan,
} from "./errori";
import type { MimeAmmesso, ProviderRadiciScan } from "./tipi";

/**
 * RadiciScan — client Gemini separato.
 *
 * Non importa `lib/product-assistant/**`: il percorso venditori ha il suo
 * provider e resta intatto. La chiave è quella già configurata
 * (`GEMINI_API_KEY`), letta a runtime e mai inclusa in URL, log o messaggi
 * di errore: viaggia nell'header `x-goog-api-key`.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELLO_PREDEFINITO = "gemini-flash-lite-latest";
const TIMEOUT_PREDEFINITO_MS = 35_000;
const MAX_OUTPUT_TOKENS = 1000;
/**
 * Deve restare allineato a `TIMEOUT_ANALISI_MS` di `handler.ts` (55 s).
 * Il margine copre il lavoro della route precedente alla chiamata al provider
 * (lettura registro, quota, cache), così il secondo tentativo non consuma
 * tempo oltre la scadenza complessiva della route. I 20 s aggiuntivi lasciano
 * spazio alla ricerca documentale successiva al riconoscimento.
 */
const TIMEOUT_ROUTE_MS = 55_000;
const MARGINE_BUDGET_ROUTE_MS = 1_000;
const BACKOFF_RETRY_MS = 400;
const STATI_HTTP_RITENTABILI = new Set([500, 502, 503, 504]);
const CODICI_RETE_RECUPERABILI = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "ECONNABORTED",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
]);

export interface OpzioniGeminiRadiciScan {
  apiKey?: string;
  modello?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Errore interno di un singolo tentativo: conserva l'errore applicativo
 * definitivo e se quel tentativo può essere ripetuto.
 */
class ErroreTentativo extends Error {
  readonly errore: ErroreRadiciScan;
  readonly ritentabile: boolean;

  constructor(errore: ErroreRadiciScan, ritentabile: boolean) {
    super(errore.message);
    this.name = "ErroreTentativo";
    this.errore = errore;
    this.ritentabile = ritentabile;
  }
}

function erroreReteRecuperabile(errore: unknown): boolean {
  if (!(errore instanceof Error)) return false;

  const conCausa = errore as Error & {
    code?: unknown;
    cause?: { code?: unknown };
  };
  // Un JSON malformato non è un errore di trasporto e non va ritentato.
  if (errore.name === "SyntaxError") return false;

  const codice =
    typeof conCausa.cause?.code === "string"
      ? conCausa.cause.code
      : typeof conCausa.code === "string"
        ? conCausa.code
        : null;

  // Un errore di rete senza codice è trattato come recuperabile una sola
  // volta; gli errori di configurazione/URL non lo sono.
  if (!codice) return true;
  if (codice === "ERR_INVALID_URL" || codice === "ERR_INVALID_ARG_TYPE") {
    return false;
  }
  return CODICI_RETE_RECUPERABILI.has(codice) || codice.startsWith("UND_ERR_");
}

function chiaveDaAmbiente(): string {
  const chiave = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!chiave) {
    throw new ErroreRadiciScan(
      CODICI_ERRORE.PROVIDER_CONFIGURAZIONE,
      "Provider non configurato: chiave Gemini assente."
    );
  }
  return chiave;
}

export function creaProviderGemini(
  opzioni: OpzioniGeminiRadiciScan = {}
): ProviderRadiciScan {
  const apiKey = opzioni.apiKey ?? chiaveDaAmbiente();
  const modello =
    opzioni.modello?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    MODELLO_PREDEFINITO;
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_PREDEFINITO_MS;
  const fetchImpl = opzioni.fetchImpl ?? fetch;

  return {
    nome: "gemini",
    modello,
    async genera({ prompt, immagineBase64, mimeType, signal }) {
      const body = JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inlineData: { mimeType, data: immagineBase64 } }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
        },
      });

      const eseguiTentativo = async (timeoutTentativoMs: number): Promise<string> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutTentativoMs);
        const annulla = () => controller.abort();
        signal?.addEventListener("abort", annulla, { once: true });

        try {
          // Se la route ha già annullato la richiesta, non si avvia nulla.
          if (signal?.aborted) controller.abort();

          const risposta = await fetchImpl(`${BASE_URL}/${modello}:generateContent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body,
            signal: controller.signal,
          });

          if (risposta.status === 429) {
            throw new ErroreTentativo(
              new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_QUOTA,
                "Il provider ha esaurito la quota disponibile."
              ),
              false
            );
          }
          if (!risposta.ok) {
            throw new ErroreTentativo(
              new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_RISPOSTA,
                `Il provider ha risposto con stato ${risposta.status}.`
              ),
              STATI_HTTP_RITENTABILI.has(risposta.status)
            );
          }

          const payload = (await risposta.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
          };

          const parti = payload.candidates?.[0]?.content?.parts ?? [];
          const testo = parti
            .map((parte) => (typeof parte.text === "string" ? parte.text : ""))
            .join("\n")
            .trim();

          if (!testo) {
            throw new ErroreTentativo(
              new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_RISPOSTA,
                "Il provider non ha restituito testo."
              ),
              false
            );
          }

          return testo;
        } catch (errore) {
          if (errore instanceof ErroreTentativo) throw errore;
          if (errore instanceof ErroreRadiciScan) {
            throw new ErroreTentativo(errore, false);
          }
          if (errore instanceof Error && errore.name === "AbortError") {
            // Timeout interno del singolo tentativo: può essere transitorio e
            // merita un secondo tentativo se la route non è stata annullata.
            // Un abort della route, invece, non va mai ritentato.
            throw new ErroreTentativo(
              new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_TIMEOUT,
                "Il provider non ha risposto entro il tempo previsto."
              ),
              !signal?.aborted
            );
          }
          throw new ErroreTentativo(
            new ErroreRadiciScan(
              CODICI_ERRORE.PROVIDER_RETE,
              "Errore di rete verso il provider."
            ),
            erroreReteRecuperabile(errore)
          );
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", annulla);
        }
      };

      // Il primo tentativo conserva il timeout di 25 s. Il secondo usa solo il
      // tempo che resta nel budget della route, al netto del margine.
      const scadenzaRoute = Date.now() + TIMEOUT_ROUTE_MS - MARGINE_BUDGET_ROUTE_MS;
      let ultimoErrore: ErroreTentativo | null = null;

      for (let tentativo = 1; tentativo <= 2; tentativo += 1) {
        const residuo = scadenzaRoute - Date.now();
        if (residuo <= 0 || signal?.aborted) {
          if (ultimoErrore) throw ultimoErrore.errore;
          throw new ErroreRadiciScan(
            CODICI_ERRORE.PROVIDER_TIMEOUT,
            "Il provider non ha risposto entro il tempo previsto."
          );
        }

        try {
          const testo = await eseguiTentativo(Math.min(timeoutMs, residuo));
          return { testo };
        } catch (errore) {
          if (!(errore instanceof ErroreTentativo)) throw errore;
          ultimoErrore = errore;

          if (tentativo === 2 || !errore.ritentabile || signal?.aborted) {
            throw errore.errore;
          }

          // Se il backoff consumerebbe l'intero budget residuo, si restituisce
          // l'errore originale senza avviare un secondo tentativo inutile.
          if (scadenzaRoute - Date.now() <= BACKOFF_RETRY_MS) {
            throw errore.errore;
          }

          await new Promise<void>((resolve) => {
            if (signal?.aborted) {
              resolve();
              return;
            }

            const timer = setTimeout(() => {
              signal?.removeEventListener("abort", annullaBackoff);
              resolve();
            }, BACKOFF_RETRY_MS);
            const annullaBackoff = () => {
              clearTimeout(timer);
              signal?.removeEventListener("abort", annullaBackoff);
              resolve();
            };
            signal?.addEventListener("abort", annullaBackoff, { once: true });
          });

          if (signal?.aborted) {
            throw new ErroreRadiciScan(
              CODICI_ERRORE.PROVIDER_TIMEOUT,
              "Il provider non ha risposto entro il tempo previsto."
            );
          }
        }
      }

      throw (
        ultimoErrore?.errore ??
        new ErroreRadiciScan(
          CODICI_ERRORE.PROVIDER_RETE,
          "Errore di rete verso il provider."
        )
      );
    },
  };
}

export type { MimeAmmesso };
