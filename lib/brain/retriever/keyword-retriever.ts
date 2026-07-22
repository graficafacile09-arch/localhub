/**
 * LocalHub Brain — Keyword Retriever
 *
 * Wrapper della ricerca lessicale esistente.
 * Riutilizza la logica di lib/negozi.ts e lib/ranking-negozi.ts
 * senza duplicare codice.
 */

import { cercaNegozi } from "../../negozi";
import { calcolaPunteggioNegozio } from "../../ranking-negozi";
import type { BrainCandidate } from "../types";

/**
 * Recupera negozi usando la ricerca keyword esistente.
 * Trasforma i risultati nel formato BrainCandidate.
 */
export async function retrieveByKeyword(
  query: string
): Promise<BrainCandidate[]> {
  // Usa la ricerca esistente (ilike + demo + ranking)
  const negozi = await cercaNegozi(query);

  // Trasforma in BrainCandidate con il punteggio lessicale
  return negozi.map((negozio) => {
    const lexicalScore = calcolaPunteggioNegozio(negozio, query);

    return {
      id: negozio.id,
      lexicalScore,
      semanticScore: null, // non disponibile in keyword retrieval
      combinedScore: lexicalScore,
      data: negozio as Record<string, unknown>,
    };
  });
}
