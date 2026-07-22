/**
 * LocalHub Brain — Embeddings
 *
 * Gestisce la vettorizzazione dei testi per la ricerca semantica.
 * Genera vettori float[] da testi (negozi, prodotti, query) e li salva
 * in Supabase tramite l'estensione pgvector per evitare ricalcoli.
 *
 * Provider supportati (configurabili via BRAIN_EMBEDDING_PROVIDER):
 * - "gemini"  → Google text-embedding-004 (default, zero dipendenze aggiuntive)
 * - "openai"  → text-embedding-3-small (richiede OPENAI_API_KEY)
 *
 * Se il provider non è configurato, le funzioni ritornano null
 * e il sistema usa il retrieval solo lessicale.
 *
 * @module lib/brain/embeddings
 */

// ─── Embedding Provider ───────────────────────────────────────────────────────
// Interfacce, implementazioni Gemini/OpenAI e factory

export type { EmbeddingResult, EmbeddingProvider } from "./embedding-provider";

export {
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  getEmbeddingProvider,
} from "./embedding-provider";

// ─── Embedding Cache ──────────────────────────────────────────────────────────
// Cache in-memory LRU con TTL per evitare chiamate API ridondanti

export {
  buildCacheKey,
  getCachedEmbedding,
  setCachedEmbedding,
  isEmbeddingCached,
  invalidateEmbedding,
  clearEmbeddingCache,
  getEmbeddingCacheStats,
} from "./embedding-cache";

// ─── Semantic Retriever ───────────────────────────────────────────────────────
// Pipeline completa: genera embedding → cerca per similarità coseno su Supabase

export {
  generateEmbedding,
  searchByEmbedding,
  searchSemantic,
} from "./semantic-retriever";
