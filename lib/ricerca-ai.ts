/**
 * LocalHub — Tipi condivisi dei risultati di ricerca.
 *
 * Questo modulo espone SOLO i tipi pubblici dei risultati (negozi/prodotti)
 * condivisi tra l'area pubblica (pagina /ricerca) e l'Assistente AI.
 *
 * La ricerca vera e propria è ora ESCLUSIVAMENTE database-side:
 *   - lib/negozi.ts  → cercaNegozi() / cercaProdotti()
 *     (sinonimi + normalizzazione accenti/maiuscole + fuzzy tollerante:
 *     pattern ilike a 1 errore di battitura + distanza Levenshtein in memoria)
 *   - lib/search-service.ts → search() (strato di servizio unificato, DB-only)
 *
 * Nessuna chiamata LLM (Groq/Gemini/OpenAI) avviene durante la ricerca
 * normale: l'AI (Gemini) interviene SOLO quando l'utente preme esplicitamente
 * il pulsante dell'Assistente (lib/assistente → lib/ai/gemini-text.ts).
 *
 * @module lib/ricerca-ai
 */

export type NegozioRicerca = {
  id: string;
  slug?: string | null;
  nome: string;
  descrizione?: string | null;
  categoria?: string | null;
  indirizzo?: string | null;
  telefono?: string | null;
  logo_url?: string | null;
  immagine?: string | null; // backward compat
};

export type ProdottoRicerca = {
  id: string;
  slug?: string | null;
  negozio_id: string;
  nome: string;
  descrizione: string | null;
  categoria: string | null;
  prezzo: number;
  negozio_nome: string;
  immagine_principale: string | null;
};

export type RisultatoRicercaAi = {
  risposta: string;
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
};
