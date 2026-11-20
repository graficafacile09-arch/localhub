import type { RiconoscimentoAi, RicercaWeb } from "./tipi";
import {
  creaRicercaWeb,
  hostPubblico,
  type CandidatoWeb,
  type OpzioniRicercaWeb,
  type ProviderRicercaWeb,
  type RichiestaRicercaWeb,
} from "./web";
import { creaRicercaWebGoogle } from "./web-google";

/**
 * RadiciScan — Tavily Search come provider primario indipendente da Gemini.
 *
 * Tavily restituisce URL, titolo, estratto e metadati di risultati realmente
 * trovati sul web. Le pagine vengono poi aperte dal lettore comune: uno
 * snippet non viene mai presentato come documento letto.
 *
 * Limiti:
 * - massimo 6 query per analisi, una chiamata Search per query;
 * - `search_depth: "basic"` (1 credito per ricerca);
 * - massimo 5 risultati per query, deduplicati per URL;
 * - cache in memoria di 10 minuti, separata per query;
 * - timeout per query e fallback dichiarato.
 *
 * La chiave viene letta solo da `TAVILY_API_KEY`. Se manca, il provider si
 * dichiara non configurato e non esegue né simula alcuna ricerca.
 */

const ENDPOINT = "https://api.tavily.com/search";
const MAX_QUERY_TAVILY = 6;
const MAX_RISULTATI_QUERY = 5;
const MAX_CANDIDATI = 24;
const TIMEOUT_RICERCA_MS = 8_000;
const TTL_CACHE_MS = 10 * 60 * 1000;

export interface OpzioniRicercaTavily extends OpzioniRicercaWeb {
  apiKey?: string;
  maxQuery?: number;
  timeoutRicercaMs?: number;
  /** Provider usato solo se tutte le ricerche Tavily falliscono. */
  fallback?: ProviderRicercaWeb;
}

interface RisultatoTavily {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  score?: unknown;
  published_date?: unknown;
}

interface RispostaTavily {
  results?: unknown;
  usage?: { credits?: unknown };
}

interface EsitoQueryTavily {
  risultati: CandidatoWeb[];
  errore: boolean;
  http: number | null;
  crediti: number;
  cache: boolean;
}

const cache = new Map<string, { scade: number; risultati: CandidatoWeb[] }>();

/** Solo per i test: svuota la cache dei risultati Tavily. */
export function svuotaCacheTavily(): void {
  cache.clear();
}

function daCache(chiave: string, adesso: number): CandidatoWeb[] | null {
  const voce = cache.get(chiave);
  if (!voce) return null;
  if (voce.scade <= adesso) {
    cache.delete(chiave);
    return null;
  }
  return voce.risultati;
}

function inCache(chiave: string, risultati: CandidatoWeb[], adesso: number): void {
  cache.set(chiave, { scade: adesso + TTL_CACHE_MS, risultati });
  if (cache.size > 200) {
    const prima = cache.keys().next().value;
    if (prima) cache.delete(prima);
  }
}

function normalizzaQuery(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dataIso(valore: unknown): string | null {
  if (typeof valore !== "string" || !valore.trim()) return null;
  const data = new Date(valore);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

function urlAmmesso(valore: unknown): string | null {
  if (typeof valore !== "string" || !valore.trim()) return null;
  try {
    const url = new URL(valore.trim());
    if (url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "") return null;
    if (url.port !== "" || url.hash !== "") return null;
    if (!hostPubblico(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function chiaveUrl(valore: string): string {
  try {
    const url = new URL(valore);
    url.hash = "";
    for (const parametro of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|msclkid|ref|source)$/i.test(parametro)) {
        url.searchParams.delete(parametro);
      }
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}${url.search ? `?${url.searchParams.toString()}` : ""}`;
  } catch {
    return valore.trim();
  }
}

/**
 * Query separate per entità. Le prime cinque sono quelle richieste per
 * ricostruire il caso Madeo; la sesta copre il sito ufficiale.
 */
export function costruisciQueryTavily(riconoscimento: RiconoscimentoAi): string[] {
  const produttore = riconoscimento.produttore?.trim() || null;
  const denominazione = riconoscimento.denominazioneProposta?.trim() || null;
  const prodotto = riconoscimento.prodotto.trim();

  const candidati = produttore
    ? [
        produttore,
        denominazione ? `${produttore} ${denominazione}` : `${produttore} ${prodotto}`,
        `Filiera ${produttore} salumi DOP`,
        denominazione
          ? `${denominazione} registro europeo`
          : `${prodotto} registro europeo DOP`,
        `${produttore} certificazioni organismi di controllo`,
        `${produttore} sito ufficiale prodotti`,
      ]
    : [
        prodotto,
        denominazione ? `${denominazione} DOP` : `${prodotto} DOP`,
        `${prodotto} registro europeo DOP`,
        `${prodotto} consorzio di tutela`,
        `${prodotto} certificazioni organismo di controllo`,
        `${prodotto} sito ufficiale`,
      ];

  const viste = new Set<string>();
  const query: string[] = [];
  for (const candidato of candidati) {
    const pulita = candidato.replace(/\s+/g, " ").trim().slice(0, 140);
    const chiave = normalizzaQuery(pulita);
    if (chiave.length < 4 || viste.has(chiave)) continue;
    viste.add(chiave);
    query.push(pulita);
    if (query.length >= MAX_QUERY_TAVILY) break;
  }
  return query;
}

function estraiRisultati(
  payload: RispostaTavily | null,
  query: string
): CandidatoWeb[] {
  const voci = Array.isArray(payload?.results)
    ? (payload.results as RisultatoTavily[])
    : [];
  const visti = new Set<string>();
  const risultati: CandidatoWeb[] = [];

  for (const voce of voci) {
    if (!voce || typeof voce !== "object") continue;
    const url = urlAmmesso(voce.url);
    if (!url) continue;
    const chiave = chiaveUrl(url);
    if (visti.has(chiave)) continue;
    visti.add(chiave);

    const host = new URL(url).hostname;
    const titolo =
      typeof voce.title === "string" && voce.title.trim()
        ? voce.title.trim().slice(0, 220)
        : host;
    const estratto =
      typeof voce.content === "string" && voce.content.trim()
        ? voce.content.replace(/\s+/g, " ").trim().slice(0, 1000)
        : null;
    const punteggio =
      typeof voce.score === "number" && Number.isFinite(voce.score)
        ? voce.score
        : undefined;

    risultati.push({
      titolo,
      url,
      estratto,
      query,
      punteggio,
      dataDocumento: dataIso(voce.published_date),
    });
    if (risultati.length >= MAX_RISULTATI_QUERY) break;
  }

  return risultati;
}

function creditiRisposta(payload: RispostaTavily | null): number {
  const grezzo = payload?.usage?.credits;
  if (typeof grezzo === "number" && Number.isFinite(grezzo) && grezzo >= 0) {
    return grezzo;
  }
  // Una Search basic riuscita costa un credito anche quando non dichiara usage.
  return 1;
}

async function cercaConTavily(
  indice: number,
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  adesso: number,
  signal?: AbortSignal
): Promise<EsitoQueryTavily> {
  const chiave = `q:${normalizzaQuery(query)}`;
  const memorizzato = daCache(chiave, adesso);
  if (memorizzato) {
    console.info(
      `[radiscan][web] motore=tavily indice=${indice + 1} http=cache risultati=${memorizzato.length} crediti=0 esito=cache`
    );
    return {
      risultati: memorizzato,
      errore: false,
      http: null,
      crediti: 0,
      cache: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const annulla = () => controller.abort();
  signal?.addEventListener("abort", annulla, { once: true });
  if (signal?.aborted) controller.abort();

  let http: number | null = null;
  try {
    const risposta = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        chunks_per_source: 3,
        max_results: MAX_RISULTATI_QUERY,
        topic: "general",
        language: "it",
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true,
      }),
      signal: controller.signal,
    });
    http = risposta.status;

    if (!risposta.ok) {
      console.warn(
        `[radiscan][web] motore=tavily indice=${indice + 1} http=${http} risultati=0 crediti=0 esito=non_disponibile`
      );
      return { risultati: [], errore: true, http, crediti: 0, cache: false };
    }

    const payload = (await risposta.json().catch(() => null)) as RispostaTavily | null;
    if (!payload || !Array.isArray(payload.results)) {
      console.warn(
        `[radiscan][web] motore=tavily indice=${indice + 1} http=${http} risultati=0 crediti=0 esito=risposta_non_valida`
      );
      return { risultati: [], errore: true, http, crediti: 0, cache: false };
    }

    const risultati = estraiRisultati(payload, query);
    const crediti = creditiRisposta(payload);
    inCache(chiave, risultati, adesso);
    console.info(
      `[radiscan][web] motore=tavily indice=${indice + 1} http=${http} risultati=${risultati.length} crediti=${crediti} esito=ok`
    );
    return { risultati, errore: false, http, crediti, cache: false };
  } catch {
    console.warn(
      `[radiscan][web] motore=tavily indice=${indice + 1} http=rete risultati=0 crediti=0 esito=rete`
    );
    return { risultati: [], errore: true, http, crediti: 0, cache: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", annulla);
  }
}

function messaggioErrori(
  fallite: Array<{ indice: number; query: string }>,
  totale: number
): string {
  const dettaglio = fallite
    .map((voce) => `indice ${voce.indice + 1}: "${voce.query}"`)
    .join("; ");
  return `Tavily: ${fallite.length}/${totale} ricerche non riuscite (${dettaglio}).`;
}

function creaFallback(opzioni: OpzioniRicercaTavily): ProviderRicercaWeb {
  if (opzioni.fallback) return opzioni.fallback;
  return creaRicercaWebGoogle({
    fetchImpl: opzioni.fetchImpl,
    timeoutQueryMs: opzioni.timeoutQueryMs,
    timeoutPaginaMs: opzioni.timeoutPaginaMs,
    adesso: opzioni.adesso,
    leggiPagineUfficiali: opzioni.leggiPagineUfficiali,
    maxPagine: opzioni.maxPagine,
    maxFonti: opzioni.maxFonti,
  });
}

export function creaRicercaWebTavily(
  opzioni: OpzioniRicercaTavily = {}
): ProviderRicercaWeb {
  const apiKey = (opzioni.apiKey ?? process.env.TAVILY_API_KEY ?? "").trim();
  const fetchImpl = opzioni.fetchImpl ?? fetch;
  const adesso = opzioni.adesso ?? (() => new Date());
  const timeoutRicerca = opzioni.timeoutRicercaMs ?? TIMEOUT_RICERCA_MS;
  const limiteQuery = Math.min(
    Math.max(opzioni.maxQuery ?? MAX_QUERY_TAVILY, 1),
    MAX_QUERY_TAVILY
  );

  return {
    nome: "web-tavily",
    async cerca(input: RichiestaRicercaWeb): Promise<RicercaWeb> {
      const avvio = Date.now();
      const data = adesso();
      const consultataIl = data.toISOString().slice(0, 10);
      const query = costruisciQueryTavily(input.riconoscimento).slice(0, limiteQuery);

      if (!apiKey) {
        console.warn("[radiscan][web] motore=tavily esito=non_configurato");
        return {
          stato: "non_disponibile",
          consultataIl,
          query,
          fonti: [],
          messaggio:
            "Tavily non configurato: TAVILY_API_KEY assente. La ricerca non è stata simulata.",
          durataMs: Date.now() - avvio,
          motore: "tavily",
        };
      }

      if (query.length === 0) {
        return {
          stato: "non_eseguita",
          consultataIl,
          query: [],
          fonti: [],
          messaggio: "Nessun nome utile per una ricerca Tavily.",
          durataMs: 0,
          motore: "tavily",
        };
      }

      const esiti = await Promise.all(
        query.map((voce, indice) =>
          cercaConTavily(
            indice,
            voce,
            apiKey,
            fetchImpl,
            timeoutRicerca,
            data.getTime(),
            input.signal
          )
        )
      );

      const fallite = esiti
        .map((esito, indice) =>
          esito.errore ? { indice, query: query[indice] ?? "" } : null
        )
        .filter((voce): voce is { indice: number; query: string } => voce !== null);
      const crediti = esiti.reduce((totale, esito) => totale + esito.crediti, 0);
      const cacheHit = esiti.filter((esito) => esito.cache).length;
      const visti = new Set<string>();
      const candidati: CandidatoWeb[] = [];

      for (const esito of esiti) {
        for (const candidato of esito.risultati) {
          const chiave = chiaveUrl(candidato.url);
          if (visti.has(chiave)) continue;
          visti.add(chiave);
          candidati.push(candidato);
          if (candidati.length >= MAX_CANDIDATI) break;
        }
        if (candidati.length >= MAX_CANDIDATI) break;
      }

      console.info(
        `[radiscan][web] motore=tavily query=${query.length} fallite=${fallite.length} crediti=${crediti} cache=${cacheHit} esito=${candidati.length > 0 ? "ok" : fallite.length === query.length ? "non_disponibile" : "senza_risultati"}`
      );

      if (fallite.length === query.length) {
        const motivo = messaggioErrori(fallite, query.length);
        const fallback = creaFallback(opzioni);
        try {
          const esitoFallback = await fallback.cerca(input);
          const messaggio = `${motivo} ${
            esitoFallback.messaggio ??
            `Risultati dal provider di riserva ${fallback.nome}.`
          }`.trim();
          return {
            ...esitoFallback,
            stato:
              esitoFallback.fonti.length > 0
                ? esitoFallback.stato
                : "non_disponibile",
            query,
            motore: esitoFallback.motore ?? fallback.nome,
            messaggio,
            durataMs: Date.now() - avvio,
          };
        } catch {
          return {
            stato: "non_disponibile",
            consultataIl,
            query,
            fonti: [],
            messaggio: `${motivo} Anche il provider di riserva non è disponibile.`,
            durataMs: Date.now() - avvio,
            motore: "tavily",
          };
        }
      }

      if (candidati.length === 0) {
        const errore = fallite.length > 0 ? `${messaggioErrori(fallite, query.length)} ` : "";
        return {
          stato: "ok",
          consultataIl,
          query,
          fonti: [],
          messaggio:
            `${errore}Tavily non ha restituito risultati pertinenti: non è una prova di assenza di fonti.`,
          durataMs: Date.now() - avvio,
          motore: "tavily",
        };
      }

      // La lettura effettiva resta nel lettore comune: Tavily fornisce gli URL,
      // non trasforma uno snippet in un documento letto.
      const lettore = creaRicercaWeb(opzioni);
      const esito = await lettore.cerca({ ...input, candidati, query });
      const messaggi: string[] = [];
      if (fallite.length > 0) {
        messaggi.push(messaggioErrori(fallite, query.length));
      }
      if (esito.fonti.length === 0) {
        messaggi.push(
          "Tavily ha restituito URL, ma nessuna pagina pertinente è stata letta: non è una prova di assenza di fonti."
        );
      } else if (esito.messaggio) {
        messaggi.push(esito.messaggio);
      }

      return {
        ...esito,
        motore: "tavily",
        query,
        messaggio: messaggi.length > 0 ? messaggi.join(" ") : null,
        durataMs: Date.now() - avvio,
      };
    },
  };
}
