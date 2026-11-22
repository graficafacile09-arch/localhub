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
 * - usa lo stesso provider primario di Aggiungi prodotti (Cloudflare/Gemma 4);
 * - una sola chiamata e una sola immagine preprocessata come nel flusso prodotti;
 * - nessun Gemini, OpenRouter o provider di fallback: un solo motore, una sola
 *   attesa, nessuna seconda chiamata nascosta;
 * - il parsing RadiciScan resta locale e usa il suo schema dedicato.
 *
 * Prompt e schema restano quelli di RadiciScan: il motore è condiviso,
 * l'interpretazione no.
 */

export const MODELLO_VISION_PRIMARIO = "@cf/google/gemma-4-26b-a4b-it";
export const TIMEOUT_VISION_PRIMARIO_MS = 12_000;
/** Budget di output dimensionato sullo schema RadiciScan, non su 1400 token fissi. */
export const MAX_TOKEN_VISION = 700;

export interface OpzioniProviderVisionProdotti {
  /** Iniezione per i test: nessuna chiamata di rete. */
  analizza?: typeof analyzeImagesWithPrompt;
  timeoutMs?: number;
  maxTokenOutput?: number;
}

export function creaProviderVisionProdotti(
  opzioni: OpzioniProviderVisionProdotti = {}
): ProviderRadiciScan {
  const analizza = opzioni.analizza ?? analyzeImagesWithPrompt;
  const timeoutMs = opzioni.timeoutMs ?? TIMEOUT_VISION_PRIMARIO_MS;
  const maxOutputTokens = opzioni.maxTokenOutput ?? MAX_TOKEN_VISION;

  return {
    nome: "vision-prodotti",
    modello: MODELLO_VISION_PRIMARIO,
    async genera({
      prompt,
      immagineBase64,
      mimeType,
      signal,
    }) {
      // Una sola immagine, identica al preprocessing del flusso Aggiungi prodotti.
      const immagini: VisionImage[] = [
        {
          buffer: Buffer.from(immagineBase64, "base64"),
          filename: nomeFileDaMime(mimeType),
          role: "primary",
        },
      ];

      const opzioniChiamata: OpzioniVisionPrompt = {
        timeoutMs,
        maxOutputTokens,
        primaryOnly: true,
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
