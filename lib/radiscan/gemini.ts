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
 *
 * Il modello primario è Flash completo, migliore sui dettagli grafici dei
 * bollini. Non tutti i progetti/chiavi hanno accesso a un determinato modello:
 * per questo la richiesta prova una catena di modelli vision e usa il primo
 * che risponde. Un modello assente non deve rendere indisponibile il servizio.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELLO_PREDEFINITO = "gemini-2.5-flash";
/** Modello vision già usato con successo dal progetto: fallback obbligatorio. */
const MODELLO_FALLBACK = "gemini-flash-lite-latest";
const TIMEOUT_PREDEFINITO_MS = 35_000;
const MAX_OUTPUT_TOKENS = 1200;
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
 * definitivo, se quel tentativo può essere ripetuto e se ha senso provare
 * il modello successivo della catena.
 */
class ErroreTentativo extends Error {
  readonly errore: ErroreRadiciScan;
  readonly ritentabile: boolean;
  readonly prossimoModello: boolean;

  constructor(
    errore: ErroreRadiciScan,
    ritentabile: boolean,
    prossimoModello: boolean
  ) {
    super(errore.message);
    this.name = "ErroreTentativo";
    this.errore = errore;
    this.ritentabile = ritentabile;
    this.prossimoModello = prossimoModello;
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

interface DettaglioErroreHttp {
  stato: string | null;
  messaggio: string;
}

/** Legge il dettaglio dell'errore senza includerlo nei messaggi pubblici. */
async function leggiDettaglioErrore(
  risposta: Response
): Promise<DettaglioErroreHttp> {
  try {
    const testo = (await risposta.text()).slice(0, 2_000);
    const payload = JSON.parse(testo) as {
      error?: { status?: unknown; message?: unknown };
    };
    return {
      stato:
        typeof payload.error?.status === "string" ? payload.error.status : null,
      messaggio:
        typeof payload.error?.message === "string" ? payload.error.message : "",
    };
  } catch {
    return { stato: null, messaggio: "" };
  }
}

/**
 * Distingue configurazione, quota, modello assente e risposta non valida.
 * Il log è sanificato: modello e stato HTTP, mai chiave, prompt o immagine.
 */
function classificaErroreHttp(
  status: number,
  dettaglio: DettaglioErroreHttp,
  modello: string
): ErroreTentativo {
  const messaggio = dettaglio.messaggio.toLowerCase();

  if (
    status === 404 ||
    (status === 400 &&
      /model|not found|not supported|unsupported|thinking/.test(messaggio))
  ) {
    console.warn(
      `[radiscan][gemini] modello=${modello} http=${status} stato=${dettaglio.stato ?? "-"} esito=modello_non_disponibile`
    );
    return new ErroreTentativo(
      new ErroreRadiciScan(
        CODICI_ERRORE.PROVIDER_MODELLO,
        `Il modello ${modello} non è disponibile per questa chiave.`
      ),
      false,
      true
    );
  }

  if (status === 429) {
    console.warn(
      `[radiscan][gemini] modello=${modello} http=429 esito=quota`
    );
    return new ErroreTentativo(
      new ErroreRadiciScan(
        CODICI_ERRORE.PROVIDER_QUOTA,
        "Il provider ha esaurito la quota disponibile."
      ),
      false,
      true
    );
  }

  if (status === 401 || status === 403) {
    console.warn(
      `[radiscan][gemini] modello=${modello} http=${status} esito=configurazione`
    );
    return new ErroreTentativo(
      new ErroreRadiciScan(
        CODICI_ERRORE.PROVIDER_CONFIGURAZIONE,
        "La chiave del provider non è autorizzata."
      ),
      false,
      false
    );
  }

  if (
    status === 400 &&
    /api key|credential|permission|unauth|invalid key/.test(messaggio)
  ) {
    console.warn(
      `[radiscan][gemini] modello=${modello} http=400 esito=configurazione`
    );
    return new ErroreTentativo(
      new ErroreRadiciScan(
        CODICI_ERRORE.PROVIDER_CONFIGURAZIONE,
        "La chiave del provider non è valida."
      ),
      false,
      false
    );
  }

  const ritentabile = STATI_HTTP_RITENTABILI.has(status);
  console.warn(
    `[radiscan][gemini] modello=${modello} http=${status} stato=${dettaglio.stato ?? "-"} esito=risposta`
  );
  return new ErroreTentativo(
    new ErroreRadiciScan(
      CODICI_ERRORE.PROVIDER_RISPOSTA,
      `Il provider ha risposto con stato ${status}.`
    ),
    ritentabile,
    ritentabile
  );
}

function attesaBackoff(signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", annulla);
      resolve();
    }, BACKOFF_RETRY_MS);
    const annulla = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", annulla);
      resolve();
    };
    signal?.addEventListener("abort", annulla, { once: true });
  });
}

export function creaProviderGemini(
  opzioni: OpzioniGeminiRadiciScan = {}
): ProviderRadiciScan {
  const apiKey = opzioni.apiKey ?? chiaveDaAmbiente();
  // GEMINI_MODEL resta un override esplicito dell'operatore; se assente si
  // parte dal modello completo. La catena include comunque il fallback noto.
  const richiesto =
    opzioni.modello?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    MODELLO_PREDEFINITO;
  const modelli = [...new Set([richiesto, MODELLO_PREDEFINITO, MODELLO_FALLBACK])];
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_PREDEFINITO_MS;
  const fetchImpl = opzioni.fetchImpl ?? fetch;

  return {
    nome: "gemini",
    modello: richiesto,
    async genera({ prompt, immagineBase64, mimeType, immagineDettaglioBase64, signal }) {
      const parti: Array<Record<string, unknown>> = [
        { text: prompt },
        { inlineData: { mimeType, data: immagineBase64 } },
      ];
      if (immagineDettaglioBase64) {
        parti.push({
          text: "DETTAGLIO INGRANDITO: esamina con particolare attenzione i bollini e i marchi di qualità presenti su questa porzione della stessa confezione. Non ignorare il marchio solo perché è piccolo nell'immagine completa.",
        });
        parti.push({
          inlineData: { mimeType: "image/jpeg", data: immagineDettaglioBase64 },
        });
      }

      const eseguiTentativo = async (
        modello: string,
        timeoutTentativoMs: number
      ): Promise<string> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutTentativoMs);
        const annulla = () => controller.abort();
        signal?.addEventListener("abort", annulla, { once: true });

        // Il thinking consuma il budget di output e può lasciare il testo
        // vuoto: sui modelli Flash 2.5 lo disattiviamo per un JSON completo.
        const generationConfig: Record<string, unknown> = {
          temperature: 0.1,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
        };
        if (/^gemini-2\.5-flash/.test(modello) && !modello.includes("lite")) {
          generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        const body = JSON.stringify({
          contents: [{ parts: parti }],
          generationConfig,
        });

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

          if (!risposta.ok) {
            const dettaglio = await leggiDettaglioErrore(risposta);
            throw classificaErroreHttp(risposta.status, dettaglio, modello);
          }

          const payload = (await risposta.json().catch(() => null)) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: unknown }> };
              finishReason?: unknown;
            }>;
          } | null;

          if (!payload) {
            throw new ErroreTentativo(
              new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_RISPOSTA,
                "Il provider ha restituito una risposta non leggibile."
              ),
              false,
              true
            );
          }

          const candidato = payload.candidates?.[0];
          const testo = (candidato?.content?.parts ?? [])
            .map((parte) => (typeof parte.text === "string" ? parte.text : ""))
            .join("\n")
            .trim();

          if (!testo) {
            console.warn(
              `[radiscan][gemini] modello=${modello} http=200 motivo=risposta_vuota finish=${String(
                candidato?.finishReason ?? "-"
              )}`
            );
            throw new ErroreTentativo(
              new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_RISPOSTA,
                "Il provider non ha restituito testo."
              ),
              false,
              true
            );
          }

          return testo;
        } catch (errore) {
          if (errore instanceof ErroreTentativo) throw errore;
          if (errore instanceof ErroreRadiciScan) {
            throw new ErroreTentativo(errore, false, false);
          }
          if (errore instanceof Error && errore.name === "AbortError") {
            // Timeout o abort della route: non si prova un altro modello,
            // perché il budget residuo non è affidabile.
            throw new ErroreTentativo(
              new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_TIMEOUT,
                "Il provider non ha risposto entro il tempo previsto."
              ),
              false,
              false
            );
          }
          throw new ErroreTentativo(
            new ErroreRadiciScan(
              CODICI_ERRORE.PROVIDER_RETE,
              "Errore di rete verso il provider."
            ),
            erroreReteRecuperabile(errore),
            false
          );
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", annulla);
        }
      };

      // Budget complessivo della route: nessun modello può consumarlo tutto.
      const scadenzaRoute = Date.now() + TIMEOUT_ROUTE_MS - MARGINE_BUDGET_ROUTE_MS;
      let ultimoErrore: ErroreTentativo | null = null;

      for (const modello of modelli) {
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
            const testo = await eseguiTentativo(
              modello,
              Math.min(timeoutMs, residuo)
            );
            return { testo, modello };
          } catch (errore) {
            if (!(errore instanceof ErroreTentativo)) throw errore;
            ultimoErrore = errore;

            // Configurazione, timeout o rete: nessun altro modello può
            // risolvere il problema in modo affidabile.
            if (!errore.prossimoModello) throw errore.errore;

            if (!errore.ritentabile || tentativo === 2 || signal?.aborted) {
              break;
            }

            // Se il backoff consumerebbe l'intero budget residuo, si passa
            // direttamente al modello successivo.
            if (scadenzaRoute - Date.now() <= BACKOFF_RETRY_MS) break;

            await attesaBackoff(signal);

            if (signal?.aborted) {
              throw new ErroreRadiciScan(
                CODICI_ERRORE.PROVIDER_TIMEOUT,
                "Il provider non ha risposto entro il tempo previsto."
              );
            }
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
