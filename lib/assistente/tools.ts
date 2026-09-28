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
import { getFarmacieTurnoCastrovillari, type FarmaciaTurno } from "@/lib/farmacie-turno";
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

export type MeteoAssistente = {
  citta: "Castrovillari";
  timezone: "Europe/Rome";
  aggiornato: string;
  temperatura: number;
  temperaturaPercepita: number;
  codice: number;
  descrizione: string;
  ventoKmh: number;
  precipitazioneMm: number;
  oggi: { minima: number; massima: number; probabilitaPioggia: number | null };
  domani: { data: string; minima: number; massima: number; probabilitaPioggia: number | null; descrizione: string };
};

export type FarmaciaAssistente = Pick<
  FarmaciaTurno,
  "id" | "nome" | "indirizzo" | "stato" | "apertura" | "turno" | "telefono" | "urlScheda"
>;

export type ToolParams = {
  query?: string;
  maxPrice?: number | null;
  minPrice?: number | null;
  limit?: number;
  /** Termini espliciti (da intent AI) — nessuna espansione automatica. */
  termini?: string[];
  /** Filtro categoria (es. "salute e benessere"). */
  categoria?: string;
  /** Filtro sottocategoria. */
  sottocategoria?: string;
  /** Filtro tipo attività / profilo (es. "medico"). */
  tipo?: string;
  /** Filtro città. */
  citta?: string;
  /** Stato farmacia per il tool locale: aperte, turno o tutte. */
  stato?: "aperte" | "turno" | "tutte";
};

export type RisultatoRicercaCompleta = {
  negozi: NegozioRicerca[];
  prodotti: ProdottoRicerca[];
  offerte: OffertaAssistente[];
  eventi: EventoAssistente[];
  categorie: { nome: string; count: number }[];
  meteo: MeteoAssistente | null;
  farmacie: FarmaciaAssistente[];
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

function descrizioneMeteo(codice: number): string {
  const map: Record<number, string> = {
    0: "Sereno",
    1: "Prevalentemente sereno",
    2: "Parzialmente nuvoloso",
    3: "Coperto",
    45: "Nebbia",
    48: "Nebbia",
    51: "Pioggerella",
    53: "Pioggerella",
    55: "Pioggerella intensa",
    61: "Pioggia",
    63: "Pioggia",
    65: "Pioggia intensa",
    71: "Neve",
    73: "Neve",
    75: "Neve intensa",
    80: "Rovesci",
    81: "Rovesci",
    82: "Rovesci intensi",
    95: "Temporale",
    96: "Temporale con grandine",
    99: "Temporale con grandine",
  };
  return map[codice] ?? "Condizioni variabili";
}

export async function getWeatherCastrovillari(): Promise<MeteoAssistente | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=39.817&longitude=16.202" +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&forecast_days=2&timezone=Europe%2FRome";
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const d = (await response.json()) as {
      current?: {
        time?: string;
        temperature_2m?: number;
        apparent_temperature?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        precipitation?: number;
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: Array<number | null>;
      };
    };
    const cur = d.current;
    const daily = d.daily;
    if (
      !cur?.time ||
      typeof cur.temperature_2m !== "number" ||
      typeof cur.apparent_temperature !== "number" ||
      typeof cur.weather_code !== "number" ||
      !daily?.time?.[0] ||
      !daily.time[1] ||
      !Array.isArray(daily.temperature_2m_min) ||
      !Array.isArray(daily.temperature_2m_max)
    ) return null;

    const min0 = daily.temperature_2m_min[0];
    const max0 = daily.temperature_2m_max[0];
    const min1 = daily.temperature_2m_min[1];
    const max1 = daily.temperature_2m_max[1];
    if (![min0, max0, min1, max1].every((n) => typeof n === "number")) return null;

    const wind = typeof cur.wind_speed_10m === "number" ? cur.wind_speed_10m : 0;
    const precipitation = typeof cur.precipitation === "number" ? cur.precipitation : 0;
    const code1 = typeof daily.weather_code?.[1] === "number" ? daily.weather_code[1] : 0;

    return {
      citta: "Castrovillari",
      timezone: "Europe/Rome",
      aggiornato: cur.time,
      temperatura: Math.round(cur.temperature_2m),
      temperaturaPercepita: Math.round(cur.apparent_temperature),
      codice: cur.weather_code,
      descrizione: descrizioneMeteo(cur.weather_code),
      ventoKmh: Math.round(wind),
      precipitazioneMm: Number(precipitation.toFixed(1)),
      oggi: {
        minima: Math.round(min0),
        massima: Math.round(max0),
        probabilitaPioggia:
          typeof daily.precipitation_probability_max?.[0] === "number"
            ? daily.precipitation_probability_max[0]
            : null,
      },
      domani: {
        data: daily.time[1],
        minima: Math.round(min1),
        massima: Math.round(max1),
        probabilitaPioggia:
          typeof daily.precipitation_probability_max?.[1] === "number"
            ? daily.precipitation_probability_max[1]
            : null,
        descrizione: descrizioneMeteo(code1),
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchPharmacies(
  stato: "aperte" | "turno" | "tutte",
  limit = 8
): Promise<FarmaciaAssistente[]> {
  const farmacie = await getFarmacieTurnoCastrovillari();
  const filtrate =
    stato === "turno"
      ? farmacie.filter((f) => Boolean(f.turno))
      : stato === "aperte"
        ? (() => {
            const aperte = farmacie.filter((f) => f.stato === "aperta");
            // Se la fonte non espone lo stato di apertura per nessuna farmacia,
            // restituiamo solo le righe non verificate come avvertenza esplicita.
            // Pino NON deve mai trasformarle in "aperte".
            return aperte.length > 0
              ? aperte
              : farmacie.filter((f) => f.stato === null).slice(0, 3);
          })()
        : farmacie;

  return filtrate.slice(0, limita(limit, 8, 8)).map((f) => ({
    id: f.id,
    nome: f.nome,
    indirizzo: f.indirizzo,
    stato: f.stato,
    apertura: f.apertura,
    turno: f.turno,
    telefono: f.telefono,
    urlScheda: f.urlScheda,
  }));
}

// ─── searchStores ────────────────────────────────────────────────────────────

export async function searchStores(
  query: string,
  opts: ToolParams = {}
): Promise<NegozioRicerca[]> {
  const q = (query ?? "").trim();
  if (!q && !(opts?.termini?.length) && !opts?.categoria && !opts?.tipo) return [];

  const righe = await cercaNegozi(q, {
    limit: limita(opts?.limit, 6, 8),
    categoria: opts?.categoria,
    tipo: opts?.tipo,
    citta: opts?.citta,
    termini: opts?.termini?.length ? opts.termini : undefined,
  });
  const attivi = (righe ?? [])
    .filter((n: Record<string, unknown>) => n.attivo !== false)
    .slice(0, limita(opts?.limit, 6, 8));

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

  const righe = await cercaProdotti(q, 60);
  // Filtri in memoria su categoria/sottocategoria/tipo-se-pertinente.
  let filtrate = righe;
  if (opts?.categoria?.trim()) {
    const c = opts.categoria.trim().toLowerCase();
    filtrate = filtrate.filter((p) => (p.categoria ?? "").toLowerCase().includes(c));
  }
  const maxPrice = opts.maxPrice != null ? Number(opts.maxPrice) : null;
  const minPrice = opts.minPrice != null ? Number(opts.minPrice) : null;

  // Escludiamo i prodotti senza prezzo reale (es. prezzo 0 da dati demo).
  const conPrezzo = filtrate.filter((p) => {
    const prezzo = Number(p.prezzo);
    return Number.isFinite(prezzo) && prezzo > 0;
  });

  const nelBudget = conPrezzo.filter((p) => {
    const prezzo = Number(p.prezzo);
    if (maxPrice != null && Number.isFinite(maxPrice) && prezzo > maxPrice) return false;
    if (minPrice != null && Number.isFinite(minPrice) && prezzo < minPrice) return false;
    return true;
  });

  // Se il filtro prezzo esclude tutto, mostriamo comunque un paio di opzioni
  // fuori budget: l'AI le segnalerà onestamente come "vicine" alla richiesta.
  const scelti =
    nelBudget.length > 0
      ? nelBudget
      : (maxPrice != null || minPrice != null) && conPrezzo.length > 0
        ? conPrezzo.slice(0, 3)
        : nelBudget;

  return scelti
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
    return { negozi: [], prodotti: [], offerte: [], eventi: [], categorie: [], meteo: null, farmacie: [] };
  }

  const [negozi, prodotti, offerte, eventi, categorie] = await Promise.all([
    searchStores(q, { limit: 6 }),
    searchProducts(q, { ...opts, limit: 8 }),
    searchOffers(q, 5),
    searchEvents(q, 5),
    getCategoriesList(),
  ]);

  return { negozi, prodotti, offerte, eventi, categorie, meteo: null, farmacie: [] };
}
