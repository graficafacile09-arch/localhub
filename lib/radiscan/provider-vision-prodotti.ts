import type { VisionImage } from "../product-assistant/types";
import {
  analyzeImagesWithPrompt,
  type OpzioniVisionPrompt,
} from "../product-assistant/vision-service";
import type { MimeAmmesso, ProviderRadiciScan } from "./tipi";

/**
 * Adattatore RadiciScan verso la stessa catena vision di Aggiungi prodotti.
 *
 * Differenze rispetto alla versione precedente, tutte misurate sul percorso
 * che funziona:
 * - una sola immagine (l'originale era già stata ridotta dal preprocessing);
 *   il ritaglio ingrandito raddoppiava il payload senza un guadagno
 *   dimostrato;
 * - nessun secondo modello automatico quando il testo è solo malformato: il
 *   parsing avviene dopo, con un parser tollerante. Il fallback scatta solo
 *   se il provider fallisce davvero (rete, HTTP, timeout, risposta vuota);
 * - timeout brevi e distinti: 15 s per Gemma, 7 s per il fallback.
 *
 * Prompt e schema restano quelli di RadiciScan: il motore è condiviso,
 * l'interpretazione no.
 */

export const MODELLO_VISION_PRIMARIO = "@cf/google/gemma-4-26b-a4b-it";
export const MODELLO_VISION_FALLBACK = "qwen/qwen2.5-vl-72b-instruct";

export const TIMEOUT_VISION_PRIMARIO_MS = 15_000;
export const TIMEOUT_VISION_FALLBACK_MS = 7_000;
/** Budget di output dimensionato sullo schema RadiciScan, non su 1400 token fissi. */
export const MAX_TOKEN_VISION = 700;

export interface OpzioniProviderVisionProdotti {
  /** Iniezione per i test: nessuna chiamata di rete. */
  analizza?: typeof analyzeImagesWithPrompt;
  timeoutMs?: number;
  fallbackTimeoutMs?: number;
  maxTokenOutput?: number;
}

export function creaProviderVisionProdotti(
  opzioni: OpzioniProviderVisionProdotti = {}
): ProviderRadiciScan {
  const analizza = opzioni.analizza ?? analyzeImagesWithPrompt;
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_VISION_PRIMARIO_MS;
  const fallbackTimeoutMs =
    opzioni.fallbackTimeoutMs ?? TIMEOUT_VISION_FALLBACK_MS;
  const maxOutputTokens = opzioni.maxTokenOutput ?? MAX_TOKEN_VISION;

  return {
    nome: "vision-prodotti",
    modello: `${MODELLO_VISION_PRIMARIO} -> ${MODELLO_VISION_FALLBACK}`,
    async genera({
      prompt,
      immagineBase64,
      mimeType,
      immagineDettaglioBase64,
      signal,
    }) {
      // Il dettaglio ingrandito non viene più inviato: il preprocessing ha
      // già ridotto l'immagine e un secondo ritaglio non ha mostrato un
      // miglioramento misurabile. Resta accettato per compatibilità.
      void immagineDettaglioBase64;

      const immagini: VisionImage[] = [
        {
          buffer: Buffer.from(immagineBase64, "base64"),
          filename: nomeFileDaMime(mimeType),
          role: "primary",
        },
      ];

      const opzioniChiamata: OpzioniVisionPrompt = {
        timeoutMs,
        fallbackTimeoutMs,
        maxOutputTokens,
      };

      const risultato = await analizza(
        immagini,
        prompt,
        signal,
        opzioniChiamata
      );

      return {
        testo: risultato.rawText,
        modello: risultato.model,
      };
    },
  };
}

function nomeFileDaMime(mime: MimeAmmesso): string {
  if (mime === "image/png") return "radiscan.png";
  if (mime === "image/webp") return "radiscan.webp";
  return "radiscan.jpg";
}
