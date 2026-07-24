import type { VisionContext, VisionImage } from "../types";
import type { ProviderResult } from "./utils";

/**
 * Contratto comune per tutti i provider di Computer Vision.
 *
 * Per aggiungere un nuovo provider:
 * 1. Crea un file in providers/ che implementa questa interfaccia
 * 2. Aggiungi il case in vision-service.ts
 * Zero modifiche al resto del progetto.
 */
export interface VisionProvider {
  /**
   * Analizza una o più immagini e restituisce il suggerimento prodotto.
   *
   * @param images  Array di immagini (predisposto per immagini multiple)
   * @param context Contesto opzionale del negozio per migliorare il riconoscimento
   */
  analyze(
    images: VisionImage[],
    context?: VisionContext
  ): Promise<ProviderResult>;
}
