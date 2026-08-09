/**
 * LocalHub — Assistente AI: Tool di retrieval
 *
 * Strato interno dell'assistente: recupera i dati pubblici di InCittà
 * RIUSANDO le funzioni di ricerca già esistenti (nessuna logica duplicata):
 *   - searchStores   → cercaNegozi() (keyword + sinonimi + ranking)
 *   - searchProducts → cercaProdotti() + filtro prezzo in memoria
 *   - searchOffers   → getOffertePubbliche() + nome negozio + filtro testo
 *   - searchEvents   → getEventiPubblici() + nome negozio + filtro testo
 *   - getCategories  → getCategorieConNegozi()
 *   - searchAll      → combinazione delle precedenti
 *
 * Nessuna scrittura: solo lettura sui dati pubblici, nessun tocco a DB/RLS.
 *
 * @module lib/assistente/tools
 */

import { cercaNegozi, cercaProdotti, getCategorieConNegozi } from "@/lib/negozi";
import { getOffertePubbliche } from "@/lib/offerte";
import { getEventiPubblici } from "@/lib/eventi";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { NegozioRicerca, ProdottoRicerca } from "@/lib/ricerca-ai";

// ─── Tipi risultati dei tool ─────────────────────────────────────────────────

export type OffertaAssistente = {
  id: string;
  titolo: string;
  descrizione: string | null;
  prezzo_originale: number | null;
  prezzo_offerta: number | null;
  negozio_nome: string;
  data_fine: string | null;
};

export type EventoAssistente = {
  id: string;
  titolo: string;
  descrizione: string | null;
  luogo: string | null;
  data_inizio: string | null;
  negozio_nome: string;
};

export type ToolParams = {
  query?: string;
  maxPrice?: number | null;
  minPrice?: number | null;
  limit?: number;
};

export type RisultatoRicercaCompleta = {
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  offerte: OffertaAssistente[];
  eventi: EventoAssistente[];
  categorie: { nome: string; count: number }[];
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function limita(n: number | undefined, fallback: number, max: number): number {
  const valore = Number.isFinite(n) ? Math.floor(Number(n)) : fallback;
  return Math.max(1, Math.min(valore, max));
}

function tronca(testo: string | null | undefined, max: number): string {
  const t = (testo ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function testoIncluso(testo: string | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (testo ?? "").toLowerCase().includes(q);
}

// ─── searchStores ────────────────────────────────────────────────────────────

export async function searchStores(query: string, limit = 6): Promise<NegozioRicerca[]> {
  const q = (query ?? "").trim();
  if (!q) return [];

  const righe = await cercaNegozi(q);
  const attivi = (righe ?? [])
    .filter((n: Record<string, unknown>) => n.attivo !== false)
    .slice(0, limita(limit, 6, 8));

  return attivi.map((n: Record<string, unknown>) => ({
    id: String(n.id),
    slug: (n.slug as string | null | undefined) ?? null,
    nome: String(n.nome ?? ""),
    descrizione: (n.descrizione as string | null | undefined) ?? null,
    categoria: (n.categoria as string | null | undefined) ?? null,
    indirizzo: (n.indirizzo as string | null | undefined) ?? null,
    telefono: (n.telefono as string | null | undefined) ?? null,
    logo_url: (n.logo_url as string | null | undefined) ?? null,
  }));
}

// ─── searchProducts (con filtro prezzo) ──────────────────────────────────────

export async function searchProducts(
  query: string,
  opts: ToolParams = {}
): Promise<ProdottoRicerca[]> {
  const q = (query ?? "").trim();
  if (!q) return [];

  const righe = await cercaProdotti(q, 30);
  const maxPrice = opts.maxPrice != null ? Number(opts.maxPrice) : null;
  const minPrice = opts.minPrice != null ? Number(opts.minPrice) : null;

  return righe
    .filter((p) => {
      const prezzo = Number(p.prezzo);
      if (!Number.isFinite(prezzo)) return false;
      if (maxPrice != null && Number.isFinite(maxPrice) && prezzo > maxPrice) return false;
      if (minPrice != null && Number.isFinite(minPrice) && prezzo < minPrice) return false;
      return true;
    })
    .sort((a, b) => Number(a.prezzo) - Number(b.prezzo))
    .slice(0, limita(opts.limit, 8, 10));
}

// ─── searchOffers ────────────────────────────────────────────────────────────

async function nomiNegozi(ids: string[]): Promise<Map<string, string>> {
  const unici = Array.from(new Set(ids.filter(Boolean)));
  if (unici.length === 0) return new Map();

  let db;
  try {
    db = createAdminSupabaseClient();
  } catch {
    return new Map();
  }

  const { data } = await db
    .from("negozi")
    .select("id, nome")
    .in("id", unici)
    .is("deleted_at", null);

  return new Map((data ?? []).map((n) => [String(n.id), String(n.nome ?? "")]));
}

export async function searchOffers(query?: string, limit = 8): Promise<OffertaAssistente[]> {
  const q = (query ?? "").trim().toLowerCase();
  const offerte = await getOffertePubbliche();

  const filtrate = q
    ? offerte.filter(
        (o) =>
          (o.titolo ?? "").toLowerCase().includes(q) ||
          (o.descrizione ?? "").toLowerCase().includes(q)
      )
    : offerte;

  const nomi = await nomiNegozi(filtrate.map((o) => o.negozio_id));

  return filtrate.slice(0, limita(limit, 8, 8)).map((o) => ({
    id: String(o.id),
    titolo: o.titolo,
    descrizione: tronca(o.descrizione, 180),
    prezzo_originale: o.prezzo_originale,
    prezzo_offerta: o.prezzo_offerta,
    negozio_nome: nomi.get(String(o.negozio_id)) ?? "",
    data_fine: o.data_fine,
  }));
}

// ─── searchEvents ────────────────────────────────────────────────────────────

export async function searchEvents(query?: string, limit = 8): Promise<EventoAssistente[]> {
  const q = (query ?? "").trim().toLowerCase();
  const eventi = await getEventiPubblici();

  const filtrati = q
    ? eventi.filter(
        (e) =>
          (e.titolo ?? "").toLowerCase().includes(q) ||
          (e.descrizione ?? "").toLowerCase().includes(q) ||
          (e.luogo ?? "").toLowerCase().includes(q)
      )
    : eventi;

  const nomi = await nomiNegozi(filtrati.map((e) => e.negozio_id));

  return filtrati.slice(0, limita(limit, 8, 8)).map((e) => ({
    id: String(e.id),
    titolo: e.titolo,
    descrizione: tronca(e.descrizione, 180),
    luogo: e.luogo,
    data_inizio: e.data_inizio,
    negozio_nome: nomi.get(String(e.negozio_id)) ?? "",
  }));
}

// ─── getCategories ───────────────────────────────────────────────────────────

export async function getCategoriesList(): Promise<{ nome: string; count: number }[]> {
  const categorie = await getCategorieConNegozi();
  return categorie
    .map((c) => ({ nome: String(c.categoria?.nome ?? ""), count: c.count }))
    .filter((c) => c.nome)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// ─── searchAll ───────────────────────────────────────────────────────────────

export async function searchAll(
  query: string,
  opts: ToolParams = {}
): Promise<RisultatoRicercaCompleta> {
  const q = (query ?? "").trim();
  if (!q) {
    return { negozi: [], prodotti: [], offerte: [], eventi: [], categorie: [] };
  }

  const [negozi, prodotti, offerte, eventi, categorie] = await Promise.all([
    searchStores(q, 6),
    searchProducts(q, { ...opts, limit: 8 }),
    searchOffers(q, 5),
    searchEvents(q, 5),
    getCategoriesList(),
  ]);

  return { negozi, prodotti, offerte, eventi, categorie };
}
