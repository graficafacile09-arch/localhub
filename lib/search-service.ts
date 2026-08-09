/**
 * LocalHub — Search Service
 *
 * Punto di accesso unificato alla ricerca PUBBLICA di InCittà.
 *
 * RICERCA NORMALE = 100% DATABASE, zero chiamate AI:
 *   query utente → search() → cercaNegozi()/cercaProdotti() (lib/negozi.ts)
 *   → Supabase → ranking locale (sinonimi, accenti, fuzzy/Levenshtein) → risultati
 *
 * Nessun LLM (Groq/Gemini/OpenAI) viene mai chiamato qui: l'AI interviene
 * SOLO quando l'utente preme esplicitamente il pulsante dell'Assistente
 * (flusso lib/assistente → lib/ai/gemini-text.ts, endpoint /api/assistente).
 *
 * Questo è lo strato di servizio che tutte le API route e i componenti
 * client devono usare — mai chiamare cercaNegozi()/cercaProdotti() o
 * funzioni AI direttamente da UI o API, sempre passare da qui.
 *
 * @module lib/search-service
 */

import { cercaNegozi, cercaProdotti } from "./negozi";
import type { NegozioRicerca, ProdottoRicerca } from "./ricerca-ai";

// ─── Tipi pubblici ────────────────────────────────────────────────────────────

/** Risultato unificato della ricerca, indipendente dalla sorgente */
export interface SearchResult {
  /** Lista di negozi trovati, già ordinati per rilevanza */
  negozi: NegozioRicerca[];

  /** Lista di prodotti trovati */
  prodotti: ProdottoRicerca[];

  /** Risposta sintetica in linguaggio naturale (sempre null: la ricerca
   *  normale è DB-only, l'AI risponde solo tramite l'Assistente) */
  risposta: string | null;

  /** Da quale sistema ha risposto la ricerca (sempre "fallback" = DB) */
  source: "brain" | "fallback";

  /** Intento classificato da Brain (sempre null: nessun AI in ricerca) */
  intent: string | null;

  /** Confidenza dell'intent 0-100 (sempre null) */
  intentConfidence: number | null;

  /** Query espansa usata per il retrieval (sempre null) */
  queryExpanded: string | null;

  /** Tempo di elaborazione in ms */
  processingMs: number;
}

// ─── Service principale ───────────────────────────────────────────────────────

/**
 * Esegue la ricerca ESCLUSIVAMENTE sul database (negozi + prodotti attivi),
 * con il ranking tollerante già presente in lib/negozi.ts (sinonimi,
 * normalizzazione accenti/maiuscole, fuzzy a 1 errore di battitura).
 *
 * @param query - La query dell'utente
 * @param options - Riservati per il futuro (Brain); ignorati oggi
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

  // options: riservate a un futuro ripristino di Brain (oggi ignorate)

  const startTime = Date.now();

  const [negozi, prodotti] = await Promise.all([
    cercaNegozi(termine),
    cercaProdotti(termine, 20),
  ]);

  return {
    negozi: (negozi ?? []) as NegozioRicerca[],
    prodotti: (prodotti ?? []) as ProdottoRicerca[],
    risposta: null,
    source: "fallback",
    intent: null,
    intentConfidence: null,
    queryExpanded: null,
    processingMs: Date.now() - startTime,
  };
}
