/**
 * LocalHub Brain — Builder
 *
 * Il Builder assembla un BrainContext strutturato a partire da una query grezza.
 * Coordina il Retriever per i dati, la Memory per il contesto storico,
 * e il Reasoning per la classificazione dell'intento.
 *
 * Trasforma l'input grezzo in un contesto ricco e tipizzato
 * che tutti gli altri moduli di Brain possono consumare.
 *
 * Implementazione prevista nei task successivi:
 * - context-builder.ts  → assembla BrainContext
 * - prompt-assembler.ts → trasforma BrainContext in prompt LLM
 *
 * @module lib/brain/builder
 */

export { buildBrainContext } from "./context-builder";
export type { BuildContextOptions } from "./context-builder";
