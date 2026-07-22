/**
 * LocalHub Brain — Embedding Cache
 *
 * Cache in-memory per vettori di embedding.
 * Evita chiamate API ridondanti per testi già vettorizzati nella stessa
 * sessione del processo Node.js.
 *
 * Caratteristiche:
 * - TTL configurabile per entry (default: 1 ora)
 * - Limite massimo di entry (default: 500) — evita memory leak
 * - Eviction LRU-approximated (rimuove le entry meno recentemente accedute)
 * - Thread-safe per runtime single-threaded di Node.js
 *
 * @module lib/brain/embeddings/embedding-cache
 */

// ─── Configurazione ───────────────────────────────────────────────────────────

/** TTL di default per le entry: 1 ora in ms */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Numero massimo di entry in cache */
const MAX_CACHE_ENTRIES = 500;

// ─── Tipi interni ─────────────────────────────────────────────────────────────

interface CacheEntry {
  vector: number[];
  dimensions: number;
  model: string;
  provider: string;
  /** Timestamp Unix (ms) di creazione */
  createdAt: number;
  /** Timestamp Unix (ms) dell'ultimo accesso */
  lastAccessedAt: number;
  /** TTL in ms — dipende dal provider */
  ttlMs: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

/** Cache globale: chiave = hash del testo + provider */
const cache = new Map<string, CacheEntry>();

// ─── Chiave di cache ──────────────────────────────────────────────────────────

/**
 * Genera la chiave di cache per un testo + provider.
 * Usa una normalizzazione leggera (lowercase + trim) per aumentare i cache hit.
 */
export function buildCacheKey(text: string, provider: string): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  return `${provider}::${normalized}`;
}

// ─── Eviction ─────────────────────────────────────────────────────────────────

/**
 * Rimuove le entry scadute o in eccesso.
 * Chiamato automaticamente nelle operazioni di scrittura.
 */
function evict(): void {
  const now = Date.now();

  // 1. Rimuove entry scadute
  for (const [key, entry] of cache.entries()) {
    if (now - entry.createdAt > entry.ttlMs) {
      cache.delete(key);
    }
  }

  // 2. Se ancora sopra il limite, rimuove le meno recentemente accedute
  if (cache.size > MAX_CACHE_ENTRIES) {
    const sorted = Array.from(cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt
    );
    const toRemove = sorted.slice(0, cache.size - MAX_CACHE_ENTRIES);
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }
}

// ─── API pubblica ─────────────────────────────────────────────────────────────

/**
 * Recupera un vettore dalla cache, se presente e non scaduto.
 *
 * @param text     - Il testo originale
 * @param provider - Il nome del provider (per evitare collisioni tra provider diversi)
 * @returns Il vettore cached, o null se assente/scaduto
 */
export function getCachedEmbedding(
  text: string,
  provider: string
): Pick<CacheEntry, "vector" | "dimensions" | "model" | "provider"> | null {
  const key = buildCacheKey(text, provider);
  const entry = cache.get(key);

  if (!entry) return null;

  const now = Date.now();
  if (now - entry.createdAt > entry.ttlMs) {
    cache.delete(key);
    return null;
  }

  // Aggiorna il timestamp di accesso (LRU)
  entry.lastAccessedAt = now;

  return {
    vector: entry.vector,
    dimensions: entry.dimensions,
    model: entry.model,
    provider: entry.provider,
  };
}

/**
 * Salva un vettore in cache.
 *
 * @param text      - Il testo originale
 * @param provider  - Il nome del provider
 * @param vector    - Il vettore da cacheare
 * @param model     - Il modello usato per generarlo
 * @param ttlMs     - TTL opzionale (default: 1 ora)
 */
export function setCachedEmbedding(
  text: string,
  provider: string,
  vector: number[],
  model: string,
  ttlMs = DEFAULT_TTL_MS
): void {
  evict();

  const key = buildCacheKey(text, provider);
  const now = Date.now();

  cache.set(key, {
    vector,
    dimensions: vector.length,
    model,
    provider,
    createdAt: now,
    lastAccessedAt: now,
    ttlMs,
  });
}

/**
 * Verifica se un testo è in cache (senza aggiornare il timestamp di accesso).
 */
export function isEmbeddingCached(text: string, provider: string): boolean {
  const key = buildCacheKey(text, provider);
  const entry = cache.get(key);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > entry.ttlMs) {
    cache.delete(key);
    return false;
  }
  return true;
}

/**
 * Rimuove una specifica entry dalla cache.
 */
export function invalidateEmbedding(text: string, provider: string): void {
  cache.delete(buildCacheKey(text, provider));
}

/**
 * Svuota completamente la cache.
 * Utile per i test o per forzare la rigenerazione di tutti gli embedding.
 */
export function clearEmbeddingCache(): void {
  cache.clear();
}

/**
 * Statistiche correnti della cache (utile per monitoring e test).
 */
export function getEmbeddingCacheStats(): {
  size: number;
  maxSize: number;
  defaultTtlMs: number;
} {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_ENTRIES,
    defaultTtlMs: DEFAULT_TTL_MS,
  };
}
