/**
 * Entry point pubblico per il modulo di analisi immagini AI.
 *
 * Il resto dell'applicazione importa solo da questo file.
 * La scelta del provider, la factory e la logica di confidenza
 * sono incapsulate in vision-service.ts e non devono essere
 * conosciute dai consumatori esterni.
 *
 * ## Utilizzo
 *
 * ```ts
 * import { analyzeImages } from "@/lib/product-assistant/vision";
 *
 * const result = await analyzeImages([{ buffer, filename, role: "primary" }]);
 *
 * if (!result.success) {
 *   // Servizio disabilitato — mostra il messaggio all'utente
 *   console.warn(result.message);
 *   return;
 * }
 *
 * // result.success === true → result.suggestion è disponibile
 * console.log(result.suggestion.nome);
 * ```
 */

export type { ProductVisionSuggestion, ProductCondition, VisionContext, VisionImage } from "./types";
export type { VisionServiceResult } from "./vision-service";
export { analyzeImages } from "./vision-service";
