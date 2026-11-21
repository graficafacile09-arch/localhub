import type { VisionImage } from "../product-assistant/types";
import { analyzeImagesWithPrompt } from "../product-assistant/vision-service";
import type { MimeAmmesso, ProviderRadiciScan } from "./tipi";

/**
 * Adattatore RadiciScan verso la stessa catena vision di Aggiungi prodotti.
 * Riusa Gemma 4 Cloudflare e il fallback Qwen 2.5 VL OpenRouter; il prompt,
 * lo schema e la verifica documentale restano quelli specifici RadiciScan.
 */
export function creaProviderVisionProdotti(): ProviderRadiciScan {
  return {
    nome: "vision-prodotti",
    modello: "@cf/google/gemma-4-26b-a4b-it -> qwen/qwen2.5-vl-72b-instruct",
    async genera({ prompt, immagineBase64, mimeType, immagineDettaglioBase64 }) {
      const immagini: VisionImage[] = [{
        buffer: Buffer.from(immagineBase64, "base64"),
        filename: nomeFileDaMime(mimeType),
      }];

      if (immagineDettaglioBase64) {
        immagini.push({
          buffer: Buffer.from(immagineDettaglioBase64, "base64"),
          filename: "etichetta-dettaglio.jpg",
        });
      }

      const risultato = await analyzeImagesWithPrompt(immagini, prompt);
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
