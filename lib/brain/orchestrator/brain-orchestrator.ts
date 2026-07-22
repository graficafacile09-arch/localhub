/**
 * LocalHub Brain — Brain Orchestrator
 *
 * Coordina tutti i sottosistemi di Brain in un unico flusso di esecuzione.
 * È il punto centrale che riceve una richiesta, la smista ai moduli appropriati
 * (builder, retriever, ranking, reasoning, memory) e restituisce il risultato.
 *
 * Principio di funzionamento:
 * 1. Riceve query + contesto opzionale
 * 2. Delega al Builder per assemblare il BrainContext
 * 3. Delega al Retriever per recuperare i candidati
 * 4. Delega al Ranking per ordinare i candidati
 * 5. Delega al Reasoning per generare la risposta finale
 * 6. Delega alla Memory per salvare l'interazione
 * 7. Ritorna BrainResult<T>
 *
 * @module lib/brain/orchestrator/brain-orchestrator
 */

import type { BrainContext, BrainResult } from "../types";

/** Opzioni di configurazione per una singola esecuzione dell'orchestratore */
export interface OrchestratorRunOptions {
  /** ID sessione anonimo del client */
  sessionId?: string;

  /** ID utente autenticato (opzionale) */
  userId?: string;

  /** Se salvare l'interazione nella memoria */
  saveToMemory?: boolean;

  /** Se usare la memoria per arricchire il contesto */
  useMemory?: boolean;
}

/** Risultato dell'orchestratore per una ricerca */
export interface OrchestratorSearchResult {
  context: BrainContext;
  response: string | null;
}

/**
 * Contratto pubblico dell'orchestratore.
 * L'implementazione concreta verrà aggiunta nei task successivi.
 */
export interface BrainOrchestrator {
  /**
   * Esegue una ricerca completa con Brain.
   * @param query - La query dell'utente
   * @param options - Opzioni di esecuzione
   */
  search(
    query: string,
    options?: OrchestratorRunOptions
  ): Promise<BrainResult<OrchestratorSearchResult> | null>;

  /**
   * Esegue solo il ranking semantico su una lista di candidati esistenti.
   * @param candidates - Lista di candidati già recuperati
   * @param query - La query per il ranking
   */
  rank<T extends { id: string }>(
    candidates: T[],
    query: string
  ): Promise<BrainResult<T[]> | null>;
}

/**
 * Implementazione concreta dell'orchestratore.
 */
export class BrainOrchestratorImpl implements BrainOrchestrator {
  async search(
    query: string,
    options?: OrchestratorRunOptions
  ): Promise<BrainResult<OrchestratorSearchResult> | null> {
    const startTime = Date.now();

    // Import dinamici per evitare dipendenze circolari
    const { buildBrainContext } = await import("../builder");
    const { retrieveByKeyword } = await import("../retriever");
    const { applyCombiner, sortByCombinedScore } = await import("../ranking");

    // 1. Costruisce il contesto (include intent + decisionPlan)
    const context = buildBrainContext(query, {
      userId: options?.userId,
      sessionId: options?.sessionId,
      useMemory: options?.useMemory ?? false,
    });

    // 2. Legge il piano decisionale prodotto dal Decision Engine
    const plan = context.decisionPlan;

    // 3. Arricchisce il contesto con la session memory (se abilitata e disponibile)
    const shouldUseMemory =
      (options?.useMemory ?? false) &&
      plan?.useMemory === true &&
      !!options?.sessionId;

    if (shouldUseMemory && options?.sessionId) {
      const { getRecentQueries, getPreferredCategories, addMemoryEntry } =
        await import("../memory");

      const recentQueries = getRecentQueries(options.sessionId);
      const preferredCategories = getPreferredCategories(options.sessionId);

      if (context.userContext) {
        context.userContext.recentQueries = recentQueries;
        context.userContext.preferredCategories = preferredCategories;
      }

      addMemoryEntry(
        options.sessionId,
        { type: "query", value: query },
        options.userId
      );
    }

    // 4. Espansione LLM: se il piano prevede useExpansion, arricchisce
    //    queryExpanded con sinonimi via LLM (sovrascrive l'espansione locale del builder)
    if (plan?.useExpansion) {
      try {
        const { expandQuery } = await import("../reasoning/steps/expand");
        context.queryExpanded = await expandQuery(context.query);
      } catch {
        // Degradazione graceful: rimane l'espansione locale già nel contesto
      }
    }

    // 5. Sceglie la query di retrieval in base al piano
    const retrievalQuery =
      plan !== null && !plan.useExpansion
        ? context.query
        : context.queryExpanded;

    // 6. Recupera i candidati con keyword retrieval (sempre disponibile)
    const keywordCandidates = await retrieveByKeyword(retrievalQuery);

    // 6b. Recupera candidati semantici se gli embedding sono configurati.
    //     Graceful degradation: se il provider non è disponibile ritorna []
    let mergedCandidates = keywordCandidates;

    try {
      const { searchSemantic } = await import("../embeddings");
      const semanticCandidates = await searchSemantic(retrievalQuery);

      if (semanticCandidates.length > 0) {
        // Unisce i due set per id, preferendo il candidato con il semantic score
        // quando lo stesso negozio appare in entrambi i retriever.
        const byId = new Map<string, (typeof keywordCandidates)[number]>();

        for (const c of keywordCandidates) {
          byId.set(c.id, c);
        }

        for (const s of semanticCandidates) {
          const existing = byId.get(s.id);
          if (existing) {
            // Merge: mantieni lexicalScore del keyword retriever, aggiungi semanticScore
            byId.set(s.id, {
              ...existing,
              semanticScore: s.semanticScore,
            });
          } else {
            // Trovato solo via semantic — aggiungilo
            byId.set(s.id, s);
          }
        }

        mergedCandidates = Array.from(byId.values());
      }
    } catch {
      // Degradazione graceful: usa solo keyword candidates
    }

    // 7. Applica il limite di candidati definito dal piano
    const maxCandidates = plan?.maxCandidates ?? 25;
    const limitedCandidates = mergedCandidates.slice(0, maxCandidates);

    // 8. Applica il combiner (ibrido lexical + semantic quando disponibile)
    const scoredCandidates = applyCombiner(limitedCandidates);

    // 9. Ordina per combined score
    const sortedCandidates = sortByCombinedScore(scoredCandidates);

    // 10. Filtra per confidence threshold definita dal piano
    const threshold = plan?.confidenceThreshold ?? 0;
    const filteredCandidates = threshold > 0
      ? sortedCandidates.filter((c) => c.combinedScore >= threshold)
      : sortedCandidates;

    // 11. Aggiorna il contesto con i candidati finali
    context.candidates = filteredCandidates;

    // 12. Genera la risposta finale in linguaggio naturale
    let response: string | null = null;
    try {
      const { synthesizeResponse } = await import("../reasoning/steps/synthesize");
      response = await synthesizeResponse(context);
    } catch {
      // Degradazione graceful: se la sintesi fallisce, response rimane null
      response = null;
    }

    const processingMs = Date.now() - startTime;

    return {
      data: {
        context,
        response,
      },
      source: "brain",
      processingMs,
    };
  }

  async rank<T extends { id: string }>(
    candidates: T[],
    query: string
  ): Promise<BrainResult<T[]> | null> {
    const startTime = Date.now();

    // Import dinamici
    const { calcolaPunteggioNegozio } = await import("../../ranking-negozi");
    const { applyCombiner, sortByCombinedScore } = await import("../ranking");

    // Trasforma in BrainCandidate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brainCandidates = candidates.map((item) => {
      // calcolaPunteggioNegozio accetta { id, nome?, categoria?, ... }
      // Il cast è sicuro perché T ha sempre id:string e i campi extra sono opzionali
      const lexicalScore = calcolaPunteggioNegozio(
        item as { id: string; nome?: string; categoria?: string; descrizione?: string },
        query
      );

      return {
        id: item.id,
        lexicalScore,
        semanticScore: null,
        combinedScore: lexicalScore,
        data: item as Record<string, unknown>,
      };
    });

    // Applica combiner e ordina
    const scored = applyCombiner(brainCandidates);
    const sorted = sortByCombinedScore(scored);

    // Ricostruisce l'array originale nell'ordine rankato
    const rankedItems = sorted.map((candidate) => candidate.data as T);

    const processingMs = Date.now() - startTime;

    return {
      data: rankedItems,
      source: "brain",
      processingMs,
    };
  }
}
