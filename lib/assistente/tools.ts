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
import { terminiSignificativi, similaritaLevenshtein } from "@/lib/search-tollerante";
import { analizzaRichiesta } from "@/lib/ricerca-intento";
import { espandiQueryConSinonimi } from "@/lib/ricerca-semantica";
import { estraiCitta } from "@/lib/localita";
import { normalizza, estraiToken } from "@/lib/text-utils";
import type { Orari } from "@/types/negozio";
import { apertoOra } from "./conversazione";

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
  /** Esclusioni semantiche Pino: es. ["alcolica"] per "birra non alcolica". */
  esclusioni?: string[];
  /** Vincolo reale sugli orari: solo attività aperte secondo gli orari registrati. */
  apertiOra?: boolean;
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

function campoContieneEsclusione(campo: string, esclusioni: string[]): boolean {
  const testo = normalizza(campo);
  const token = testo.split(/[^a-z0-9]+/).filter(Boolean);
  for (const esclusione of esclusioni) {
    const e = normalizza(esclusione).trim();
    if (!e) continue;
    const et = e.split(/[^a-z0-9]+/).filter(Boolean);
    if (et.length === 0) continue;
    for (let i = 0; i <= token.length - et.length; i++) {
      if (!et.every((v, j) => token[i + j] === v)) continue;
      const precedente = token[i - 1] ?? "";
      // "birra non alcolica" non deve essere scartata solo perché la descrizione
      // ripete "non alcolica": l'esclusione vale quando il prodotto contiene
      // davvero la caratteristica esclusa.
      if (precedente === "non" || precedente === "senza") continue;
      return true;
    }
  }
  return false;
}

function recordEscluso(campi: unknown[], esclusioni: string[] | undefined): boolean {
  if (!esclusioni?.length) return false;
  return campi.some((campo) => campoContieneEsclusione(String(campo ?? ""), esclusioni));
}

function prodottoSoddisfaEsclusioni(
  prodotto: ProdottoRicerca,
  esclusioni: string[] | undefined
): boolean {
  if (!esclusioni?.length) return true;
  const testo = normalizza(
    [prodotto.nome, prodotto.descrizione, prodotto.categoria]
      .filter(Boolean)
      .join(" ")
  );
  for (const esclusione of esclusioni) {
    const e = normalizza(esclusione);
    if (!e) continue;
    if (e === "alcolica" || e === "alcolico" || e === "alcol") {
      const analcolica =
        /\banalcolic[oa]\b/.test(testo) ||
        /\bsenza alcol\b/.test(testo) ||
        /\bzero alcol\b/.test(testo) ||
        /\b0[.,]?0(?:%| gradi)?\b/.test(testo) ||
        /\b0% alcol\b/.test(testo);
      if (!analcolica) return false;
      continue;
    }
    if (campoContieneEsclusione(testo, [e])) return false;
  }
  return true;
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

// Gate di pertinenza dei NEGOZI (solo assistente).
// `cercaNegozi` è condivisa con la ricerca pubblica e allarga volutamente il
// recall (sinonimi di categoria/commercio, profili attività, fallback
// tollerante). Per il catalogo è corretto; per Pino no: una richiesta senza
// significato finiva per restituire negozi senza alcun rapporto con essa (es.
// "prodotto inesistente" → 5 negozi, perché "prodotto" attiva il profilo
// ecommerce e "prodotti" compare nelle parole chiave "prodotti tipici").
// Regole, applicate SOLO nel tool dell'assistente (nessuna modifica a
// /api/search, alla ricerca pubblica o al catalogo):
//   1) tutti i termini ORIGINALI della richiesta devono comparire nei campi
//      identitari del negozio (nome, descrizione, categoria, sottocategoria,
//      tipo attività, servizi, parole chiave);
//   2) un concetto d'INTENTO riconosciuto ("ho sete" → bar/caffetteria) può
//      comparire negli stessi campi: sono termini realmente cercabili;
//   3) un sinonimo ESPANSO vale solo nei campi di CLASSIFICAZIONE (categoria,
//      tipo attività): così "pizzeria" trova il panificio per categoria, ma
//      "prodotto" non trova più chi ha "prodotti tipici" tra le parole chiave.
// I termini originali sono ammessi anche con un refuso ragionevole (stessa
// soglia del fallback tollerante della ricerca): "panifcio" continua a trovare
// il Panificio, mentre "inesistente" non trova nulla.
// Un filtro esplicito categoria/tipo chiesto dal chiamante è già di per sé una
// prova di pertinenza e non viene mai scartato.
function testoNegozio(n: Record<string, unknown>): string {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const lista = (v: unknown) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : "";
  return normalizza(
    [
      n.nome,
      n.descrizione,
      n.categoria,
      n.sottocategoria,
      data.tipo_attivita,
      lista(n.servizi),
      lista(n.parole_chiave),
    ]
      .filter(Boolean)
      .map(String)
      .join(" ")
  );
}

function classificazioneNegozio(n: Record<string, unknown>): string {
  const data = (n.data ?? {}) as Record<string, unknown>;
  return normalizza(
    [n.categoria, data.tipo_attivita]
      .filter(Boolean)
      .map(String)
      .join(" ")
  );
}

// Somiglianza con i termini richiesti: sottostringa oppure un token vicino per
// edit-distance (refuso/plurale). Soglia più alta sui termini corti, come nel
// fallback tollerante esistente.
function terminePresente(termine: string, testo: string, token: string[]): boolean {
  // Termini CORTI (< 4): devono essere parole INTERE. Con il solo
  // `includes`, "bar" matcherebbe "Barone" (e "barattolo" lato prodotti):
  // un negozio di gioielli non è un bar.
  if (termine.length < 4) return token.includes(termine);
  if (testo.includes(termine)) return true;
  const soglia = termine.length <= 6 ? 0.85 : 0.8;
  return token.some(
    (tok) => tok.length >= 4 && similaritaLevenshtein(tok, termine) >= soglia
  );
}

function negozioPertinente(
  n: Record<string, unknown>,
  termini: string[],
  concetti: string[],
  espansi: string[]
): boolean {
  const testo = testoNegozio(n);
  if (!testo) return false;
  // Nessun termine sostanziale nella richiesta → nessun vincolo da applicare.
  if (termini.length === 0) return true;
  // 1) Tutti i termini originali presenti (il match parziale non basta).
  const token = estraiToken(testo);
  if (termini.every((t) => terminePresente(t, testo, token))) return true;
  // 2) Concetto d'intento riconosciuto.
  if (concetti.some((c) => c.length >= 3 && testo.includes(c))) return true;
  // 3) Sinonimo espanso, solo su un campo di classificazione.
  const classificazione = classificazioneNegozio(n);
  return espansi.some((e) => e.length >= 4 && classificazione.includes(e));
}


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
  const attivi = (righe ?? []).filter(
    (n: Record<string, unknown>) => n.attivo !== false
  ).filter((n: Record<string, unknown>) =>
    !recordEscluso(
      [n.nome, n.descrizione, n.categoria, n.sottocategoria, (n.data as Record<string, unknown> | undefined)?.tipo_attivita],
      opts?.esclusioni
    )
  );

  // Filtro esplicito categoria/tipo: la classificazione è già garantita dal
  // chiamante, quindi non applichiamo il gate.
  const filtroEsplicito = Boolean(opts?.categoria?.trim() || opts?.tipo?.trim());
  let pertinenti = attivi;
  if (!filtroEsplicito) {
    const base = q || (opts?.termini ?? []).join(" ");
    const citta = opts?.citta?.trim() || estraiCitta(base) || "";
    const tokenCitta = citta ? normalizza(citta) : "";
    const terminiOriginali = terminiSignificativi(base, 10)
      .map(normalizza)
      .filter((t) => !tokenCitta || t !== tokenCitta);
    // Concetti d'intento come FRASI intere (es. "prodotti tipici"): spezzarli
    // in singole parole renderebbe "prodotti"/"tipici" una chiave capace di
    // pescare qualsiasi bottega con "prodotti da forno" tra i servizi.
    const concetti = analizzaRichiesta(base).concetti.map(normalizza);
    const espansi = espandiQueryConSinonimi(base)
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizza);
    pertinenti = attivi.filter((n) =>
      negozioPertinente(n, terminiOriginali, concetti, espansi)
    );
  }

  if (opts?.apertiOra && pertinenti.length > 0) {
    const orari = await orariPerNegozi(pertinenti.map((n) => String(n.id)));
    pertinenti = pertinenti.filter((n) => apertoOra(orari.get(String(n.id))) === true);
  }

  return pertinenti.slice(0, limita(opts?.limit, 6, 8)).map((n: Record<string, unknown>) => ({
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

// Gate di pertinenza dei PRODOTTI (solo assistente).
// La ricerca prodotti condivisa con il catalogo espande la query con i sinonimi
// di categoria/commercio e, in ultima istanza, con una fase tollerante ai
// refusi: utile al recall, ma sui PRODOTTI genera falsi positivi reali
//   - "pane" attiva il gruppo "panificio" (che include "dolci") ⇒ Nutella
//     (categoria "Dolciumi") comparirebbe cercando "pane";
//   - per query senza riscontro la fase tollerante restituisce prodotti
//     casuali (es. "tartufo nero" ⇒ T-shirt/orologi).
// Pino deve mostrare SOLO prodotti che corrispondono alla richiesta reale:
// tutti i termini ORIGINALI della query devono comparire nei campi del
// prodotto; in alternativa basta un concetto d'INTENTO riconosciuto
// (es. "ho sete" ⇒ acqua/bevande). Il match PARZIALE non è una corrispondenza:
// per "tartufo nero" la parola "nero" nella descrizione di una T-shirt non
// rende la T-shirt pertinente. I campi del NEGOZIO non contano: la pertinenza
// del negozio non deve propagarsi ai suoi prodotti.
// Se la query non ha termini sostanziali, non applichiamo il vincolo.
function prodottoPertinente(
  prodotto: ProdottoRicerca,
  termini: string[],
  concetti: string[]
): boolean {
  const campi = normalizza(
    [prodotto.nome, prodotto.descrizione, prodotto.categoria]
      .filter(Boolean)
      .join(" ")
  );
  if (!campi) return false;
  if (termini.length === 0) return true;
  // Anche qui i termini CORTI devono essere parole intere: altrimenti "bar"
  // matcherebbe "barattolo" nella descrizione di un prodotto qualsiasi.
  const token = estraiToken(campi);
  if (termini.every((t) => (t.length < 4 ? token.includes(t) : campi.includes(t)))) {
    return true;
  }
  return concetti.some((c) => campi.includes(c));
}

function punteggioProdottoPino(
  prodotto: ProdottoRicerca,
  query: string,
  termini: string[]
): number {
  const nome = normalizza(prodotto.nome ?? "");
  const descrizione = normalizza(prodotto.descrizione ?? "");
  const categoria = normalizza(prodotto.categoria ?? "");
  const q = normalizza(query).trim();
  const tokenNome = estraiToken(nome);
  let score = 0;

  if (q && nome === q) score += 120;
  else if (q && nome.includes(q)) score += 90;

  for (const termine of termini) {
    const t = normalizza(termine).trim();
    if (!t) continue;
    if (tokenNome.includes(t)) score += 45;
    else if (nome.includes(t)) score += 30;
    else if (categoria.includes(t)) score += 18;
    else if (descrizione.includes(t)) score += 8;
  }

  // Se più termini della richiesta compaiono nel nome, il prodotto è più
  // specifico rispetto a uno che li cita solo nella descrizione.
  if (termini.length > 0 && termini.every((t) => nome.includes(normalizza(t)))) {
    score += 35;
  }

  score -= Math.min(nome.length, 160) / 160;
  return score;
}

export async function searchProducts(
  query: string,
  opts: ToolParams = {}
): Promise<ProdottoRicerca[]> {
  const q = (query ?? "").trim();
  if (!q) return [];

  const righe = await cercaProdotti(q, 60);

  const terminiOriginali = terminiSignificativi(q, 10).map(normalizza);
  // Concetti d'intento come FRASI intere (es. "prodotti tipici"): spezzarli in
  // singole parole renderebbe "prodotti"/"tipici" una chiave che matcha mezzo
  // catalogo.
  const concettiQuery = analizzaRichiesta(q).concetti.map(normalizza);
  const pertinenti =
    (terminiOriginali.length > 0
      ? righe.filter((p) => prodottoPertinente(p, terminiOriginali, concettiQuery))
      : righe
    ).filter((p) => prodottoSoddisfaEsclusioni(p, opts?.esclusioni));

  // Filtri in memoria su categoria/sottocategoria/tipo-se-pertinente.
  let filtrate = pertinenti;
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
    .sort((a, b) => {
      const scoreA = punteggioProdottoPino(a, q, terminiOriginali);
      const scoreB = punteggioProdottoPino(b, q, terminiOriginali);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return Number(a.prezzo) - Number(b.prezzo);
    })
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

// ─── Orari (solo lettura) per il follow-up "aperti ora" ──────────────────────
// Gli orari non sono parte di NegozioRicerca (condiviso con la ricerca pubblica):
// li leggiamo a parte, solo per gli id già pertinenti, e solo nel flusso di Pino.
// In caso di errore NON inventiamo nulla: la mappa resta vuota e lo stato
// risulterà non verificabile.
export async function orariPerNegozi(
  ids: string[]
): Promise<Map<string, Orari | null>> {
  const mappa = new Map<string, Orari | null>();
  const unici = Array.from(new Set(ids.filter(Boolean)));
  if (unici.length === 0) return mappa;
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db.from("negozi").select("id,orari").in("id", unici);
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; orari: Orari | null }[]) {
      mappa.set(String(r.id), r.orari ?? null);
    }
  } catch (err) {
    console.warn(
      "[assistente] orari non disponibili:",
      (err as { message?: string })?.message ?? err
    );
  }
  return mappa;
}

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
