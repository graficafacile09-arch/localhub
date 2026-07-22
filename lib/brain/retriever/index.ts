/**
 * LocalHub Brain — Retriever
 *
 * Il Retriever recupera dati rilevanti dal database per arricchire il contesto Brain.
 * Affianca (non sostituisce) la logica di recupero esistente in lib/negozi.ts.
 *
 * Due strategie di retrieval:
 * - Keyword Retriever: incapsula la logica ilike esistente (zero regressioni)
 * - Semantic Retriever: usa gli embeddings pgvector per similarità semantica
 *
 * Se il Semantic Retriever non è disponibile (embeddings non configurati),
 * il sistema ricade automaticamente sul Keyword Retriever.
 *
 * Implementazione prevista nei task successivi:
 * - keyword-retriever.ts  → wrapper della ricerca ilike esistente
 * - semantic-retriever.ts → ricerca per similarità vettoriale
 *
 * @module lib/brain/retriever
 */

export { retrieveByKeyword } from "./keyword-retriever";
