import type { VisionContext, VisionImage } from "../types";
import type { ProviderResult } from "./utils";

/** Contratto comune dei provider di Computer Vision. */
export interface VisionProvider {
  analyze(
    images: VisionImage[],
    context?: VisionContext,
    promptOverride?: string,
    signal?: AbortSignal
  ): Promise<ProviderResult>;
}
