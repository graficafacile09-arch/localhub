/**
 * LocalHub Brain — Semantic Retriever
 *
 * Recupera negozi tramite similarità vettoriale (pgvector) su Supabase.
 * Si affianca al Keyword Retriever senza sostituirlo.
 *
 * Funzionamento:
 * 1. generateEmbedding(text)  → genera il vettore (con cache)
 * 2. searchByEmbedding(vec)   → chiama Supabase RPC match_negozi
 * 3. searchSemantic(query)    → combina 1+2 in un'unica chiamata
 *
 * Graceful degradation:
 * - Se nessun provider di embedding è configurato → ritorna []
 * - Se Supabase RPC fallisce → logga e ritorna []
 * - Mai lancia eccezioni verso l'orchestrator
 *
 * La funzione Supabase RPC attesa (da creare in migration):
 *   match_negozi(query_embedding vector, match_threshold float, match_count int)
 *   returns table(id text, nome text, ..., similarity float)
 *
 * @module lib/brain/embeddings/semantic-retriever
 */

import { getEmbeddingProvider } from "./embedding-provider";
import { getCachedEmbedding, setCachedEmbedding } from "./embedding-cache";
import type { EmbeddingResult } from "./embedding-provider";
import type { BrainCandidate } from "../types";

// ─── Configurazione ───────────────────────────────────────────────────────────

/** Soglia minima di similarità coseno per includere un risultato (0-1) */
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

/** Numero di risultati da richiedere al RPC */
const DEFAULT_TOP_K = 20;

// ─── Tipi ─────────────────────────────────────────────────────────────────────

/** Risultato raw dall'RPC Supabase match_negozi */
interface RpcMatchResult {
  id: string;
  nome?: string | null;
  categoria?: string | null;
  descrizione?: string | null;
  indirizzo?: string | null;
  parole_chiave?: string[] | string | null;
  similarity: number;
}

// ─── generateEmbedding ────────────────────────────────────────────────────────

/**
 * Genera il vettore di embedding per un testo, usando la cache quando possibile.
 *
 * @param text - Il testo da vettorizzare
 * @returns EmbeddingResult, o null se nessun provider è disponibile
 */
export async function generateEmbedding(
  text: string
): Promise<EmbeddingResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const provider = getEmbeddingProvider();
  if (!provider) return null;

  // Controlla la cache prima di chiamare l'API
  const cached = getCachedEmbedding(trimmed, provider.name);
  if (cached) {
    return {
      vector: cached.vector,
      dimensions: cached.dimensions,
      model: cached.model,
      provider: cached.provider,
    };
  }

  try {
    const result = await provider.embed(trimmed);

    // Salva in cache per riuso futuro
    setCachedEmbedding(trimmed, provider.name, result.vector, result.model);

    return result;
  } catch (error) {
    // Log silenzioso — non interrompe la pipeline
    console.warn(
      `[Brain/SemanticRetriever] generateEmbedding fallito per "${trimmed.slice(0, 30)}…": ${error}`
    );
    return null;
  }
}

// ─── searchByEmbedding ────────────────────────────────────────────────────────

/**
 * Cerca negozi per similarità coseno usando l'RPC Supabase match_negozi.
 *
 * Richiede che la tabella negozi abbia una colonna `embedding vector(N)`
 * e che sia definita la funzione RPC match_negozi nel database.
 *
 * @param vector     - Il vettore di query
 * @param topK       - Numero massimo di risultati
 * @param threshold  - Soglia minima di similarità (0-1)
 * @returns Array di BrainCandidate con semanticScore = similarity, lexicalScore = 0
 */
export async function searchByEmbedding(
  vector: number[],
  topK = DEFAULT_TOP_K,
  threshold = DEFAULT_SIMILARITY_THRESHOLD
): Promise<BrainCandidate[]> {
  if (vector.length === 0) return [];

  try {
    // Import dinamico per evitare dipendenze circolari e problemi SSR
    const { createClient } = await import("@supabase/supabase-js");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc("match_negozi", {
      query_embedding: vector,
      match_threshold: threshold,
      match_count: topK,
    });

    if (error) {
      console.warn(
        `[Brain/SemanticRetriever] searchByEmbedding RPC error: ${error.message}`
      );
      return [];
    }

    if (!data || !Array.isArray(data)) return [];

    return (data as RpcMatchResult[]).map((row) => ({
      id: row.id,
      lexicalScore: 0, // il retrieval semantico non ha punteggio lessicale
      semanticScore: row.similarity,
      combinedScore: row.similarity, // verrà rivalutato dal combiner
      data: {
        id: row.id,
        nome: row.nome ?? null,
        categoria: row.categoria ?? null,
        descrizione: row.descrizione ?? null,
        indirizzo: row.indirizzo ?? null,
        parole_chiave: row.parole_chiave ?? null,
      },
    }));
  } catch (error) {
    console.warn(
      `[Brain/SemanticRetriever] searchByEmbedding eccezione: ${error}`
    );
    return [];
  }
}

// ─── searchSemantic ───────────────────────────────────────────────────────────

/**
 * Pipeline completa: genera l'embedding della query e cerca per similarità.
 *
 * Entry point principale per il semantic retrieval.
 * Ritorna [] se il provider non è disponibile o se il DB non risponde.
 *
 * @param query     - La query dell'utente
 * @param topK      - Numero massimo di risultati (default: 20)
 * @param threshold - Soglia minima di similarità (default: 0.5)
 * @returns Array di BrainCandidate ordinati per similarity desc
 */
export async function searchSemantic(
  query: string,
  topK = DEFAULT_TOP_K,
  threshold = DEFAULT_SIMILARITY_THRESHOLD
): Promise<BrainCandidate[]> {
  const embedding = await generateEmbedding(query);
  if (!embedding) return [];

  const results = await searchByEmbedding(embedding.vector, topK, threshold);

  // Ordina per similarity decrescente
  return results.sort((a, b) => (b.semanticScore ?? 0) - (a.semanticScore ?? 0));
}
