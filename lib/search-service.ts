/**
 * LocalHub — Search Service
 *
 * Punto di accesso unificato alla ricerca.
 * Quando BRAIN_ENABLED=true, usa BrainOrchestrator per ricerca semantica + LLM.
 * Altrimenti cade in graceful fallback sulla ricerca keyword esistente (ricercaConAi).
 *
 * Questo è lo strato di servizio che tutte le API route e i componenti
 * client devono usare — mai chiamare ricercaConAi() o brainSearch() direttamente
 * da UI o API, sempre passare da qui.
 *
 * @module lib/search-service
 */

import type { NegozioRicerca, ProdottoRicerca } from "./ricerca-ai";

// ─── Tipi pubblici ────────────────────────────────────────────────────────────

/** Risultato unificato della ricerca, indipendente dalla sorgente */
export interface SearchResult {
  /** Lista di negozi trovati, già ordinati per rilevanza */
  negozi: NegozioRicerca[];

  /** Lista di prodotti trovati */
  prodotti: ProdottoRicerca[];

  /** Risposta sintetica in linguaggio naturale (Markdown) */
  risposta: string | null;

  /** Da quale sistema ha risposto la ricerca */
  source: "brain" | "fallback";

  /** Intento classificato da Brain (null se fallback) */
  intent: string | null;

  /** Confidenza dell'intent 0-100 (null se fallback) */
  intentConfidence: number | null;

  /** Query espansa usata per il retrieval (null se fallback) */
  queryExpanded: string | null;

  /** Tempo di elaborazione in ms */
  processingMs: number;
}

// ─── Service principale ───────────────────────────────────────────────────────

/**
 * Esegue la ricerca usando Brain (se abilitato) o il fallback keyword+LLM.
 *
 * @param query - La query dell'utente
 * @param options - Opzioni opzionali per Brain
 */
export async function search(
  query: string,
  options?: {
    sessionId?: string;
    userId?: string;
    useMemory?: boolean;
  }
): Promise<SearchResult> {
  const termine = query.trim();

  if (!termine) {
    return {
      negozi: [],
      prodotti: [],
      risposta: null,
      source: "fallback",
      intent: null,
      intentConfidence: null,
      queryExpanded: null,
      processingMs: 0,
    };
  }

  const startTime = Date.now();

  // ─── Tentativo Brain ──────────────────────────────────────────────────────
  try {
    // @ts-expect-error — Brain module will be re-enabled in a future phase
    const brainModule = await import("./brain/index");
    const brainSearch = brainModule.brainSearch;
    const isBrainEnabled = brainModule.isBrainEnabled;

    if (isBrainEnabled()) {
      const brainResult = await brainSearch(termine, {
        sessionId: options?.sessionId,
        userId: options?.userId,
        useMemory: options?.useMemory ?? false,
      });

      if (brainResult) {
        const { context, response } = brainResult.data;

        // Trasforma BrainCandidate[] → NegozioRicerca[]
        const negozi: NegozioRicerca[] = context.candidates.map((c: Record<string, unknown>) => {
          const data = c.data as Record<string, unknown> ?? {};
          return {
            id: c.id as string,
            slug: (data.slug as string | null | undefined) ?? null,
            nome: (data.nome as string) ?? (c.id as string),
            descrizione: (data.descrizione as string | null | undefined) ?? null,
            categoria: (data.categoria as string | null | undefined) ?? null,
            indirizzo: (data.indirizzo as string | null | undefined) ?? null,
            telefono: (data.telefono as string | null | undefined) ?? null,
            immagine: (data.immagine as string | null | undefined) ?? null,
          };
        });

        return {
          negozi,
          prodotti: [],
          risposta: response,
          source: "brain",
          intent: context.intent?.type ?? null,
          intentConfidence: context.intent?.confidence ?? null,
          queryExpanded: context.queryExpanded ?? null,
          processingMs: brainResult.processingMs,
        };
      }
    }
  } catch (error) {
    // Brain non disponibile — cade nel fallback
    console.warn("[search-service] Brain non disponibile, uso fallback:", error);
  }

  // ─── Fallback: ricerca keyword + LLM esistente ────────────────────────────
  try {
    const { ricercaConAi } = await import("./ricerca-ai");
    const risultato = await ricercaConAi(termine);

    return {
      negozi: risultato.negozi,
      prodotti: risultato.prodotti ?? [],
      risposta: risultato.risposta || null,
      source: "fallback",
      intent: null,
      intentConfidence: null,
      queryExpanded: null,
      processingMs: Date.now() - startTime,
    };
  } catch (error) {
    // Anche il fallback ha fallito — ritorna risultato vuoto con errore propagato
    throw error;
  }
}
