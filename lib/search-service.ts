/**
 * LocalHub — Search Service
 *
 * Punto di accesso unificato alla ricerca PUBBLICA di InCittà.
 *
 * RICERCA NORMALE = 100% DATABASE, zero chiamate AI:
 *   query utente → search() → cercaNegozi()/cercaProdotti() (lib/negozi.ts)
 *   → Supabase → ranking locale (sinonimi, accenti, fuzzy/Levenshtein) → risultati
 *
 * FASE C (discovery e filtri pubblici): search() accetta anche filtri prodotto
 * (categoria, sottocategoria, marca, colore, prezzo min/max, disponibilità,
 * filtri_catalogo), ordinamento, paginazione e negozioId (catalogo del singolo
 * negozio). Quando sono attivi filtri/negozioId si usano cercaProdottiConOpzioni
 * (total incluso); la ricerca base resta identica al comportamento storico.
 *
 * Nessun LLM (Groq/Gemini/OpenAI) viene mai chiamato qui: l'AI interviene
 * SOLO quando l'utente preme esplicitamente il pulsante dell'Assistente.
 *
 * Questo è lo strato di servizio che tutte le API route e i componenti
 * client devono usare — mai chiamare cercaNegozi()/cercaProdotti() o
 * funzioni AI direttamente da UI o API, sempre passare da qui.
 *
 * @module lib/search-service
 */

import {
  cercaNegozi,
  cercaProdotti,
  cercaProdottiConOpzioni,
  isOrdinamentoProdottiPubblici,
  type CercaProdottiOptions,
  type OrdinamentoProdottiPubblici,
} from "./negozi";
import type { NegozioRicerca, ProdottoRicerca } from "./ricerca-ai";
import {
  analizzaRichiesta,
  dovrebbeUsareMotoreRobusto,
  espandiQueryIbrida,
} from "./assistente/interprete";
import {
  cercaNegoziRobusti,
  cercaProdottiRobusti,
  unisciPerId,
} from "./assistente/ricerca-estesa";

// ─── Tipi pubblici ────────────────────────────────────────────────────────────

/** Risultato unificato della ricerca, indipendente dalla sorgente */
export interface SearchResult {
  /** Lista di negozi trovati, già ordinati per rilevanza (vuota con filtri attivi) */
  negozi: NegozioRicerca[];

  /** Lista di prodotti trovati */
  prodotti: ProdottoRicerca[];

  /** Totale prodotti che soddisfano i filtri (count exact) */
  total: number;

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

/** Opzioni di filtri/ordinamento/paginazione accettate da search(). */
export type SearchOptions = CercaProdottiOptions;

// ─── Service principale ───────────────────────────────────────────────────────

/**
 * Esegue la ricerca ESCLUSIVAMENTE sul database (negozi + prodotti attivi di
 * negozi non eliminati), con il ranking tollerante già presente in lib/negozi.ts
 * (sinonimi, normalizzazione accenti/maiuscole, fuzzy a 1 errore di battitura).
 *
 * - Con filtri/negozioId attivi: cercaProdottiConOpzioni (total incluso), senza
 *   ricerca negozi (siamo nel contesto filtrato / del singolo negozio).
 * - Senza filtri: comportamento storico (cercaProdotti + cercaNegozi).
 *
 * @param query - La query dell'utente
 * @param options - Filtri/ordinamento/paginazione + riservati (Brain, oggi ignorati)
 */
export async function search(
  query: string,
  options?: SearchOptions & {
    sessionId?: string;
    userId?: string;
    useMemory?: boolean;
  }
): Promise<SearchResult> {
  const termine = query.trim();
  const opts = options ?? {};

  // Filtri che restringono i prodotti (e sopprimono la ricerca negozi).
  const conFiltri = Boolean(
    opts.negozioId ||
      opts.categoria?.trim() ||
      opts.sottocategoria?.trim() ||
      opts.marca?.trim() ||
      opts.colore?.trim() ||
      (opts.prezzoMin !== undefined && opts.prezzoMin > 0) ||
      (opts.prezzoMax !== undefined && opts.prezzoMax > 0) ||
      opts.soloDisponibili ||
      (opts.filtriCatalogo && Object.keys(opts.filtriCatalogo).length > 0) ||
      (opts.ordina !== undefined && opts.ordina !== "rilevanza")
  );

  // Con paginazione esplicita (o filtri) usiamo sempre cercaProdottiConOpzioni
  // (count exact + slice corretto), così pagina 1 e 2 restano coerenti.
  const usaOpzioni = conFiltri || opts.pagina !== undefined || opts.perPagina !== undefined;

  if (!termine && !usaOpzioni) {
    return {
      negozi: [],
      prodotti: [],
      total: 0,
      risposta: null,
      source: "fallback",
      intent: null,
      intentConfidence: null,
      queryExpanded: null,
      processingMs: 0,
    };
  }

  const startTime = Date.now();

  let negozi: NegozioRicerca[] = [];
  let prodotti: ProdottoRicerca[] = [];
  let total = 0;
  let queryExpandedRv: string | null = null;

  if (usaOpzioni) {
    const ordina: OrdinamentoProdottiPubblici = isOrdinamentoProdottiPubblici(opts.ordina)
      ? opts.ordina
      : "rilevanza";
    const risultato = await cercaProdottiConOpzioni(termine, {
      negozioId: opts.negozioId,
      categoria: opts.categoria,
      sottocategoria: opts.sottocategoria,
      marca: opts.marca,
      colore: opts.colore,
      prezzoMin: opts.prezzoMin,
      prezzoMax: opts.prezzoMax,
      soloDisponibili: opts.soloDisponibili,
      filtriCatalogo: opts.filtriCatalogo,
      ordina,
      pagina: opts.pagina,
      perPagina: opts.perPagina,
    });
    prodotti = risultato.prodotti;
    total = risultato.total;
    // Ricerca base senza filtri (ma paginata): i negozi restano visibili.
    if (!conFiltri && !opts.negozioId) {
      negozi = (await cercaNegozi(termine)) as NegozioRicerca[];
    }
  } else {
    // 1) Retrieval diretto (veloce, compatibile con il comportamento storico).
    const [n, p] = await Promise.all([
      cercaNegozi(termine),
      cercaProdotti(termine, 20),
    ]);
    negozi = (n ?? []) as NegozioRicerca[];
    prodotti = (p ?? []) as ProdottoRicerca[];
    total = prodotti.length;

    // 2) Motore ROBUSTO condiviso (stesso interprete + ricerca-estesa
    //    dell'Assistente, nessuna duplicazione né chiamata AI): impiegato solo
    //    quando serve davvero — cascade su zero risultati, oppure query
    //    descrittive/ambigue con località o concetto chiaro. Le query semplici
    //    con risultati restano immediate e identiche.
    const analisi = analizzaRichiesta(termine);
    const primarioVuoto = negozi.length === 0 && prodotti.length === 0;
    if (dovrebbeUsareMotoreRobusto(analisi, primarioVuoto)) {
      const [rn, rp] = await Promise.all([
        cercaNegoziRobusti({
          query: termine,
          citta: analisi.citta ?? undefined,
          tipo: analisi.tipoAttivita?.[0] ?? undefined,
          limit: 8,
        }),
        cercaProdottiRobusti({ query: termine, limit: 10 }),
      ]);
      // Fusione con dedup per id: prima i risultati diretti (ordine invariato),
      // poi solo quelli nuovi dal recall multi-variante.
      negozi = unisciPerId<NegozioRicerca>(negozi, rn ?? []).slice(0, 12);
      prodotti = unisciPerId<ProdottoRicerca>(prodotti, rp ?? []).slice(0, 20);
      total = prodotti.length;
      queryExpandedRv = espandiQueryIbrida(termine);
    }
  }

  return {
    negozi,
    prodotti,
    total,
    risposta: null,
    source: "fallback",
    intent: null,
    intentConfidence: null,
    queryExpanded: queryExpandedRv,
    processingMs: Date.now() - startTime,
  };
}
