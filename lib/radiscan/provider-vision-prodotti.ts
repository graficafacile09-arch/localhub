import type { VisionImage } from "../product-assistant/types";
import { analizzaOutputModello } from "./schema";
import {
  analyzeRadiciScanImages,
  type OpzioniVisionRadiciScan,
} from "./vision-service";
import type { MimeAmmesso, ProviderRadiciScan } from "./tipi";

/**
 * Adattatore del servizio vision duplicato per RadiciScan.
 *
 * La catena, i timeout e il budget token sono copiati da Aggiungi prodotti.
 * RadiciScan mantiene soltanto il proprio prompt e il proprio parser.
 */
export const MODELLO_VISION_PRIMARIO = "@cf/google/gemma-4-26b-a4b-it";

export interface OpzioniProviderVisionProdotti {
  /** Iniezione per i test: nessuna chiamata di rete. */
  analizza?: typeof analyzeRadiciScanImages;
  timeoutMs?: number;
  maxTokenOutput?: number;
  fallbackTimeoutMs?: number;
  primaryOnly?: boolean;
  catena?: OpzioniVisionRadiciScan["catena"];
}

export function creaProviderVisionProdotti(
  opzioni: OpzioniProviderVisionProdotti = {}
): ProviderRadiciScan {
  const analizza = opzioni.analizza ?? analyzeRadiciScanImages;

  return {
    nome: "vision-prodotti-duplicato",
    modello: MODELLO_VISION_PRIMARIO,
    async genera({ prompt, immagineBase64, mimeType, signal }) {
      // Stesso input immagine già preparato da preparaImmagineVisione.
      const immagini: VisionImage[] = [
        {
          buffer: Buffer.from(immagineBase64, "base64"),
          filename: nomeFileDaMime(mimeType),
          role: "primary",
        },
      ];

      const opzioniChiamata: OpzioniVisionRadiciScan = {
        timeoutMs: opzioni.timeoutMs,
        maxOutputTokens: opzioni.maxTokenOutput,
        fallbackTimeoutMs: opzioni.fallbackTimeoutMs,
        primaryOnly: opzioni.primaryOnly,
        catena: opzioni.catena,
        validateRawText: (testo) => analizzaOutputModello(testo).ok,
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
