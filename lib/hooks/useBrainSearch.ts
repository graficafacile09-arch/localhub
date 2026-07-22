/**
 * LocalHub — Hook: useBrainSearch
 *
 * Hook React riutilizzabile per la ricerca client-side.
 * Wrappa /api/search e gestisce loading, errori e risultati.
 *
 * Caratteristiche:
 * - Debounce opzionale per evitare troppe chiamate API
 * - Annullamento automatico delle richieste precedenti (AbortController)
 * - Stato granulare: idle | loading | success | error
 * - Backward compatible: funziona con Brain abilitato o disabilitato
 *
 * Utilizzo base:
 *   const { results, status, search } = useBrainSearch();
 *   await search("pizzeria");
 *
 * Utilizzo con opzioni:
 *   const { results, status, search, reset } = useBrainSearch({
 *     debounceMs: 300,
 *     sessionId: "abc123",
 *     useMemory: true,
 *   });
 *
 * @module lib/hooks/useBrainSearch
 */

"use client";

import { useCallback, useRef, useState } from "react";
import type { SearchResult } from "@/lib/search-service";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export type SearchStatus = "idle" | "loading" | "success" | "error";

export interface UseBrainSearchOptions {
  /** Ritardo in ms prima di eseguire la ricerca (default: 0 = immediato) */
  debounceMs?: number;

  /** ID sessione per Brain Memory */
  sessionId?: string;

  /** ID utente autenticato (opzionale) */
  userId?: string;

  /** Se usare Brain Memory per arricchire i risultati */
  useMemory?: boolean;
}

export interface UseBrainSearchReturn {
  /** Risultati dell'ultima ricerca */
  results: SearchResult | null;

  /** Stato corrente del hook */
  status: SearchStatus;

  /** Messaggio di errore (null se nessun errore) */
  error: string | null;

  /** Ultima query eseguita */
  lastQuery: string;

  /** Esegue la ricerca (può essere chiamata da un event handler) */
  search: (query: string) => Promise<void>;

  /** Resetta lo stato a idle (utile al mount o dopo navigazione) */
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook per la ricerca Brain-powered.
 * Chiama /api/search e gestisce lo stato React.
 */
export function useBrainSearch(
  options: UseBrainSearchOptions = {}
): UseBrainSearchReturn {
  const { debounceMs = 0, sessionId, userId, useMemory = false } = options;

  const [results, setResults] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string>("");

  // Ref per AbortController — annulla la richiesta precedente se arriva una nuova
  const abortRef = useRef<AbortController | null>(null);

  // Ref per debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSearch = useCallback(
    async (query: string) => {
      const termine = query.trim();

      // Query vuota → reset silenzioso
      if (!termine) {
        setResults(null);
        setStatus("idle");
        setError(null);
        setLastQuery("");
        return;
      }

      // Annulla la richiesta precedente ancora in volo
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");
      setError(null);
      setLastQuery(termine);

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: termine,
            sessionId,
            userId,
            useMemory,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ??
              `Errore HTTP ${response.status}`
          );
        }

        const data = (await response.json()) as SearchResult;

        setResults(data);
        setStatus("success");
      } catch (err) {
        // Ignora abort (l'utente ha già fatto una nuova ricerca)
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        const message =
          err instanceof Error ? err.message : "Errore durante la ricerca.";

        setError(message);
        setStatus("error");
        setResults(null);
      }
    },
    [sessionId, userId, useMemory]
  );

  const search = useCallback(
    async (query: string) => {
      // Cancella debounce precedente
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (debounceMs > 0) {
        // Esegui dopo il debounce
        await new Promise<void>((resolve) => {
          debounceRef.current = setTimeout(async () => {
            await executeSearch(query);
            resolve();
          }, debounceMs);
        });
      } else {
        await executeSearch(query);
      }
    },
    [debounceMs, executeSearch]
  );

  const reset = useCallback(() => {
    // Annulla eventuale richiesta in volo
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    setResults(null);
    setStatus("idle");
    setError(null);
    setLastQuery("");
  }, []);

  return { results, status, error, lastQuery, search, reset };
}
