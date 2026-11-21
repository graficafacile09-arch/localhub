import type { VisionContext, VisionImage } from "../types";
import type { ProviderResult } from "./utils";

/** Opzioni per singola chiamata: i default restano quelli di Aggiungi prodotti. */
export interface OpzioniChiamataProvider {
  /** Timeout della singola chiamata HTTP. Default del provider: 60 s. */
  timeoutMs?: number;
  /** Token di output. Default del provider: invariato per Aggiungi prodotti. */
  maxOutputTokens?: number;
}

/** Contratto comune dei provider di Computer Vision. */
export interface VisionProvider {
  analyze(
    images: VisionImage[],
    context?: VisionContext,
    promptOverride?: string,
    signal?: AbortSignal,
    opzioni?: OpzioniChiamataProvider
  ): Promise<ProviderResult>;
}
