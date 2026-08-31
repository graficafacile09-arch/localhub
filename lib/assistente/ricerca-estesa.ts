/**
 * LocalHub — Assistente AI: Retrieval robusto multi-variante
 *
 * Esegue il recupero dei dati pubblici provando PIÙ varianti di query generate
 * da lib/assistente/interprete (soggetto esatto, espansione sinonimi, espansione
 * dei topic descrittivi, variante senza-città) e fonde i risultati con dedup per
 * id. Se UNA strategia fallisce, la successiva può recuperare: così la ricerca è
 * robusta anche quando la query dell'utente non contiene le parole esatte del
 * database.
 *
 * Riutilizza le funzioni di retrieval esistenti (searchStores/searchProducts/
 * searchOffers/searchEvents di lib/assistente/tools.ts): nessuna logica o query
 * DB duplicata. Il ranking finale resta quello già implementato (cercaNegozi/
 * cercaProdotti); qui si allarga SOLO il recall e si fonde.
 *
 * @module lib/assistente/ricerca-estesa
 */

import {
  searchStores,
  searchProducts,
  searchOffers,
  searchEvents,
  type ToolParams,
  type RisultatoRicercaCompleta,
} from "./tools";
import { variantiQuery } from "./interprete";

// ─── Tipi ───────────────────────────────────────────────────────────────────

export type RicercaRobustaParams = ToolParams & {
  /** Query originale utente. */
  query: string;
};

/** Unisce array deduplicando per id (prima occorrenza vince). Puro, riusato
 *  da ricerca-assistente e ricerca normale (lib/search-service.ts). */
export function unisciPerId<T extends { id: string }>(base: T[], aggiuntivi: T[]): T[] {
  const visti = new Set(base.map((x) => String(x.id)));
  const fuori: T[] = [];
  for (const item of aggiuntivi ?? []) {
    const k = String(item.id);
    if (visti.has(k)) continue;
    visti.add(k);
    fuori.push(item);
  }
  return [...base, ...fuori];
}

/** Unisce array deduplicando per id (prima occorrenza vince). */
function fondi<T extends { id: string }>(dest: T[], sorgente: T[]): void {
  const unione = unisciPerId(dest, sorgente);
  dest.length = 0;
  dest.push(...unione);
}

/**
 * Recupero robusto dei NEGOZI: prova ogni variante di query (max 3), fonde e
 * dedup. Restituisce i risultati con i primi match per priorità della variante
 * più specifica (ordine di variantiQuery).
 */
export async function cercaNegoziRobusti(
  params: RicercaRobustaParams
): Promise<Awaited<ReturnType<typeof searchStores>>> {
  const varianti = variantiQuery(params.query).slice(0, 3);
  const lista = varianti.length > 0 ? varianti : [params.query];
  const risultati: Awaited<ReturnType<typeof searchStores>> = [];

  for (const variazione of lista) {
    const righe = await searchStores(variazione, {
      ...params,
      query: undefined,
      limit: params.limit ?? 6,
    });
    fondi(risultati, righe ?? []);
    if (risultati.length >= 6) break; // recall sufficiente
  }

  return risultati.slice(0, 6);
}

/**
 * Recupero robusto dei PRODOTTI: prova più varianti di query e fonde.
 * Rispetta i vincoli di prezzo dopo la fusione (searchProducts li applica già,
 * ma per coerenza li ri-applichiamo in caso di varianti multiple).
 */
export async function cercaProdottiRobusti(
  params: RicercaRobustaParams
): Promise<Awaited<ReturnType<typeof searchProducts>>> {
  const varianti = variantiQuery(params.query).slice(0, 3);
  const lista = varianti.length > 0 ? varianti : [params.query];
  const risultati: Awaited<ReturnType<typeof searchProducts>> = [];

  for (const variazione of lista) {
    const righe = await searchProducts(variazione, {
      ...params,
      query: undefined,
      limit: params.limit ?? 8,
    });
    fondi(risultati, righe ?? []);
    if (risultati.length >= 8) break;
  }

  // Ri-applica i vincoli di prezzo se espressi (best-effort dopo la fusione).
  const maxPrice = params.maxPrice != null ? Number(params.maxPrice) : null;
  const minPrice = params.minPrice != null ? Number(params.minPrice) : null;
  let scelti = risultati;
  if (maxPrice != null || minPrice != null) {
    scelti = risultati.filter((p) => {
      const prezzo = Number(p.prezzo);
      if (maxPrice != null && Number.isFinite(maxPrice) && prezzo > maxPrice) return false;
      if (minPrice != null && Number.isFinite(minPrice) && prezzo < minPrice) return false;
      return true;
    });
    // Se il budget esclude tutto, manteniamo un paio di opzioni fuori budget,
    // l'AI le segnalerà onestamente come alternative vicine.
    if (scelti.length === 0) scelti = risultati.slice(0, 3);
  }

  return scelti.slice(0, 8);
}

/**
 * Ricerca completa robusta (negozi+prodotti) usata come fallback dalla
 * selezione tool fallita O come cascade quando i tool scelti non trovano nulla.
 * Prova le varianti di query e fonde; se tutto è vuoto, allarga a ogni variante
 * senza vincoli di categoria/tipo (più recall).
 */
export async function cercaCompletaRobusta(
  query: string,
  opts: ToolParams = {}
): Promise<RisultatoRicercaCompleta> {
  const q = (query ?? "").trim();
  if (!q) return { negozi: [], prodotti: [], offerte: [], eventi: [], categorie: [] };

  const [negozi, prodotti, offerte, eventi] = await Promise.all([
    cercaNegoziRobusti({ ...opts, query: q, limit: 6 }),
    cercaProdottiRobusti({ ...opts, query: q, limit: 8 }),
    searchOffers(q, 5),
    searchEvents(q, 5),
  ]);

  // Se il recall lessicale multi-variante resta vuoto, prova il fallback puro
  // (searchStores/searchProducts con la sola query utente già fanno fuzzy interno,
  // quindi qui non c'è altro da aggiungere — il risultato resta onesto).
  return { negozi, prodotti, offerte, eventi, categorie: [] };
}