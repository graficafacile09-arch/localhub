import type { FonteWeb, RiconoscimentoAi, RicercaWeb } from "./tipi";
import {
  costruisciQuery,
  creaRicercaWeb,
  hostPubblico,
  sintetizzaFontiWeb,
  type CandidatoWeb,
  type OpzioniRicercaWeb,
  type ProviderRicercaWeb,
  type RichiestaRicercaWeb,
} from "./web";
import { creaRicercaWebGoogle } from "./web-google";

/**
 * RadiciScan — Tavily Search come secondo livello indipendente da Gemini.
 *
 * Tavily restituisce URL, titolo, estratto e metadati di risultati realmente
 * trovati sul web. Le pagine vengono poi aperte dal lettore comune: uno
 * snippet non viene mai presentato come documento letto.
 *
 * Limiti:
 * - massimo 4 query nel percorso di rinforzo, una chiamata Search per query;
 * - `search_depth: "fast"` (1 credito per ricerca);
 * - massimo 5 risultati per query, deduplicati per URL;
 * - cache in memoria di 10 minuti, separata per query;
 * - timeout per query e fallback dichiarato.
 *
 * La chiave viene letta solo da `TAVILY_API_KEY`. Se manca, il provider si
 * dichiara non configurato e non esegue né simula alcuna ricerca.
 */

const ENDPOINT = "https://api.tavily.com/search";
const ENDPOINT_ESTRAZIONE = "https://api.tavily.com/extract";
const MAX_QUERY_TAVILY = 2;
const MAX_RISULTATI_QUERY = 5;
const MAX_CANDIDATI = 10;
const MAX_ESTRAZIONE = 1;
const MAX_CARATTERI_ESTRATTO = 6_000;
const TIMEOUT_RICERCA_MS = 5_000;
const TIMEOUT_ESTRAZIONE_MS = 5_000;
const TTL_CACHE_MS = 10 * 60 * 1000;
// Una 401 indica una chiave Tavily non autorizzata: non ripetere due query
// identiche né riprovare a ogni scansione finché la configurazione non cambia.
const COOLDOWN_AUTORIZZAZIONE_MS = 10 * 60 * 1000;
let tavilyNonAutorizzatoFino = 0;

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

interface RispostaEstrazione {
  results?: unknown;
  failed_results?: unknown;
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

  const schemaProtetto = /DOP|IGP|STG/i.test(
    `${riconoscimento.schemaProposto ?? ""} ${denominazione ?? ""}`
  );
  const area = riconoscimento.territorioProposto?.trim() || "Calabria";
  const candidati = [
    produttore && prodotto ? `${produttore} ${prodotto}` : `${prodotto} produttore ${area}`,
    `${denominazione ?? prodotto} ARSAC RINA organismo di controllo`,
    produttore ? `${produttore} sito ufficiale prodotti catalogo` : `${prodotto} ${area} produttori`,
    `${prodotto} ${area} filiera produzione origine`,
    produttore ? `${produttore} ${area} azienda produzione` : `${prodotto} ${area} consorzio associazione`,
    schemaProtetto && denominazione ? `${denominazione} registro europeo DOP IGP` : null,
    `${prodotto} Regione Calabria ARSAC produzione`,
  ];

  const viste = new Set<string>();
  const query: string[] = [];
  for (const candidato of candidati) {
    if (!candidato) continue;
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
  // Per la query dedicata agli organismi di controllo si limita il dominio:
  // è il modo più affidabile per far emergere ARSAC e RINA senza affidarsi
  // alla sola ranking del motore generalista.
  const dominiIstituzionali = /ARSAC RINA|RINA Agroqualità/i.test(query)
    ? ["arsacweb.it", "www.arsacweb.it", "rina.org", "www.rina.org", "masaf.gov.it", "www.masaf.gov.it", "regione.calabria.it", "www.regione.calabria.it", "ec.europa.eu"]
    : null;
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
        search_depth: "fast",
        chunks_per_source: 1,
        max_results: MAX_RISULTATI_QUERY,
        topic: "general",
        language: "it",
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true,
        ...(dominiIstituzionali ? { include_domains: dominiIstituzionali } : {}),
      }),
      signal: controller.signal,
    });
    http = risposta.status;

    if (!risposta.ok) {
      if (http === 401 || http === 403) {
        tavilyNonAutorizzatoFino = Date.now() + COOLDOWN_AUTORIZZAZIONE_MS;
      }
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

interface EsitoEstrazione {
  crediti: number;
  estratte: number;
  fallite: number;
}

function estrattoRilevante(
  contenuto: string,
  riconoscimento: RiconoscimentoAi
): string | null {
  const minuscolo = contenuto.toLocaleLowerCase("it");
  const chiavi = [
    riconoscimento.prodotto,
    riconoscimento.denominazioneProposta ?? "",
    riconoscimento.produttore ?? "",
  ]
    .map((voce) => voce.toLocaleLowerCase("it").trim())
    .filter((voce) => voce.length >= 4);

  let posizione = -1;
  for (const chiave of chiavi) {
    const trovata = minuscolo.indexOf(chiave);
    if (trovata >= 0 && (posizione < 0 || trovata < posizione)) {
      posizione = trovata;
    }
  }

  // Se il contenuto estratto non parla del prodotto o del produttore, meglio
  // conservare lo snippet pertinente del motore che mostrare un menu cookie.
  if (posizione < 0) return null;
  // Pochi caratteri di contesto prima della parola chiave: l'estratto
  // mostrato in UI deve contenere subito il dato pertinente, non il menu.
  const inizio = posizione > 80 ? posizione - 80 : 0;
  return contenuto.slice(inizio, inizio + 1_800).trim();
}

/**
 * Tavily Extract completa la lettura quando il fetch diretto della pagina
 * fallisce (403, timeout, pagina resa solo lato client). Non sostituisce la
 * lettura: il contenuto estratto è marcato come tale e resta distinto dalla
 * certificazione della singola confezione.
 */
async function estraiPagine(
  fonti: FonteWeb[],
  riconoscimento: RiconoscimentoAi,
  apiKey: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<EsitoEstrazione> {
  const selezionate = fonti.slice(0, MAX_ESTRAZIONE);
  const urls = selezionate.map((fonte) => fonte.url);
  if (urls.length === 0) return { crediti: 0, estratte: 0, fallite: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_ESTRAZIONE_MS);
  const annulla = () => controller.abort();
  signal?.addEventListener("abort", annulla, { once: true });
  if (signal?.aborted) controller.abort();

  try {
    const risposta = await fetchImpl(ENDPOINT_ESTRAZIONE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        urls,
        extract_depth: "basic",
        format: "markdown",
        include_usage: true,
        timeout: 5,
      }),
      signal: controller.signal,
    });

    if (!risposta.ok) {
      console.warn(
        `[radiscan][web] motore=tavily-estract richieste=${urls.length} http=${risposta.status} estratte=0 crediti=0 esito=non_disponibile`
      );
      return { crediti: 0, estratte: 0, fallite: urls.length };
    }

    const payload = (await risposta.json().catch(() => null)) as RispostaEstrazione | null;
    const voci = Array.isArray(payload?.results)
      ? payload.results
      : [];
    const perUrl = new Map(
      selezionate.map((fonte) => [chiaveUrl(fonte.url), fonte] as const)
    );
    let estratte = 0;

    for (const voce of voci) {
      if (!voce || typeof voce !== "object") continue;
      const record = voce as {
        url?: unknown;
        raw_content?: unknown;
        published_date?: unknown;
      };
      if (typeof record.url !== "string") continue;
      const fonte = perUrl.get(chiaveUrl(record.url));
      if (!fonte) continue;
      const contenuto =
        typeof record.raw_content === "string" ? record.raw_content.trim() : "";
      if (contenuto.length < 20) continue;
      const rilevante = estrattoRilevante(contenuto, riconoscimento);
      if (rilevante) fonte.estratto = rilevante;
      fonte.lettoIntegralmente = contenuto.length <= MAX_CARATTERI_ESTRATTO;
      fonte.pagineLette = null;
      fonte.metodoLettura = "tavily_extract";
      fonte.relazione =
        "Pagina estratta con Tavily Extract dopo la ricerca web: contenuto recuperato, non certificazione della confezione.";
      fonte.dataDocumento = dataIso(record.published_date) ?? fonte.dataDocumento;
      estratte += 1;
    }

    const fallite = Array.isArray(payload?.failed_results)
      ? payload.failed_results.length
      : Math.max(0, urls.length - estratte);
    const dichiarati =
      typeof payload?.usage?.credits === "number" &&
      Number.isFinite(payload.usage.credits) &&
      payload.usage.credits > 0
        ? payload.usage.credits
        : 0;
    // La documentazione Tavily segnala che `usage.credits` può essere 0
    // finché non si raggiungono 5 estrazioni: si contabilizza comunque il
    // blocco basic (1 credito per 5 URL).
    const crediti = dichiarati > 0 ? dichiarati : Math.ceil(estratte / 5);
    console.info(
      `[radiscan][web] motore=tavily-estract richieste=${urls.length} estratte=${estratte} fallite=${fallite} crediti=${crediti} esito=${estratte > 0 ? "ok" : "senza_contenuto"}`
    );
    return { crediti, estratte, fallite };
  } catch {
    console.warn(
      `[radiscan][web] motore=tavily-estract richieste=${urls.length} http=rete estratte=0 crediti=0 esito=rete`
    );
    return { crediti: 0, estratte: 0, fallite: urls.length };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", annulla);
  }
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
          consumi: {
            provider: "tavily",
            query: query.length,
            cache: 0,
            creditiRicerca: 0,
            creditiEstrazione: 0,
            creditiTotali: 0,
            pagineEstratte: 0,
          },
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
          consumi: {
            provider: "tavily",
            query: 0,
            cache: 0,
            creditiRicerca: 0,
            creditiEstrazione: 0,
            creditiTotali: 0,
            pagineEstratte: 0,
          },
        };
      }

      if (tavilyNonAutorizzatoFino > Date.now()) {
        const fallback = creaFallback(opzioni);
        const esitoFallback = await fallback.cerca(input);
        return {
          ...esitoFallback,
          query,
          motore: esitoFallback.motore ?? fallback.nome,
          messaggio: `Tavily temporaneamente escluso dopo una risposta 401/403: verificare TAVILY_API_KEY. ${esitoFallback.messaggio ?? ""}`.trim(),
          durataMs: Date.now() - avvio,
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
        `[radiscan][web] motore=tavily query=${query.length} fallite=${fallite.length} crediti_ricerca=${crediti} cache=${cacheHit} esito=${candidati.length > 0 ? "ok" : fallite.length === query.length ? "non_disponibile" : "senza_risultati"}`
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
            consumi: {
              provider: "tavily",
              query: query.length,
              cache: cacheHit,
              creditiRicerca: crediti,
              creditiEstrazione: 0,
              creditiTotali: crediti,
              pagineEstratte: 0,
            },
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
          consumi: {
            provider: "tavily",
            query: query.length,
            cache: cacheHit,
            creditiRicerca: crediti,
            creditiEstrazione: 0,
            creditiTotali: crediti,
            pagineEstratte: 0,
          },
        };
      }

      // La lettura effettiva resta nel lettore comune: Tavily fornisce gli URL,
      // non trasforma uno snippet in un documento letto.
      const lettore = creaRicercaWeb(opzioni);
      const esito = await lettore.cerca({ ...input, candidati, query });

      // Il lettore HTTP può essere bloccato da un sito. Extract recupera il
      // contenuto delle sole pagine pertinenti rimaste non lette, senza
      // trasformare uno snippet in un documento letto.
      const daEstrarre = esito.fonti
        .filter(
          (fonte) =>
            fonte.pagineLette === null &&
            !fonte.lettoIntegralmente &&
            (fonte.rilevanza !== "bassa" ||
              fonte.natura === "certificazione" ||
              fonte.natura === "ufficiale_it" ||
              fonte.natura === "regionale")
        )
        .slice(0, MAX_ESTRAZIONE);
      const estrazione: EsitoEstrazione =
        daEstrarre.length > 0
          ? await estraiPagine(
              daEstrarre,
              input.riconoscimento,
              apiKey,
              fetchImpl,
              input.signal
            )
          : { crediti: 0, estratte: 0, fallite: 0 };
      const creditiTotali = crediti + estrazione.crediti;
      console.info(
        `[radiscan][web] motore=tavily totale_crediti=${creditiTotali} crediti_ricerca=${crediti} crediti_estrazione=${estrazione.crediti} pagine_estratte=${estrazione.estratte} pagine_fallite=${estrazione.fallite}`
      );
      esito.sintesi = sintetizzaFontiWeb(input.riconoscimento, esito.fonti);

      const messaggi: string[] = [];
      if (fallite.length > 0) {
        messaggi.push(messaggioErrori(fallite, query.length));
      }
      if (estrazione.fallite > 0) {
        messaggi.push(
          `Tavily Extract non ha recuperato ${estrazione.fallite} pagina/e: restano risultati non letti.`
        );
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
        consumi: {
          provider: "tavily",
          query: query.length,
          cache: cacheHit,
          creditiRicerca: crediti,
          creditiEstrazione: estrazione.crediti,
          creditiTotali,
          pagineEstratte: estrazione.estratte,
        },
      };
    },
  };
}


/**
 * Motore web a priorità costo/velocità:
 * 1) ricerca keyless rapida su DuckDuckGo + Bing in parallelo;
 * 2) Tavily viene interrogato soltanto se le fonti gratuite non bastano;
 * 3) le fonti dei due passaggi vengono deduplicate e valutate insieme.
 *
 * "Sufficiente" significa almeno due domini indipendenti con fonti pertinenti,
 * includendo un produttore e una fonte istituzionale/di filiera, oppure due
 * fonti istituzionali. Un solo snippet commerciale non basta.
 */
function fontiKeylessSufficienti(fonti: readonly FonteWeb[]): boolean {
  const ammesse = fonti.filter(
    (fonte) =>
      (fonte.metodoLettura === "http" || fonte.metodoLettura === "tavily_extract") &&
      fonte.rilevanza !== "bassa" &&
      [
        "produttore",
        "ufficiale_eu",
        "ufficiale_it",
        "regionale",
        "certificazione",
        "consorzio",
      ].includes(fonte.natura)
  );
  const domini = new Set(ammesse.map((fonte) => fonte.dominio));
  if (domini.size < 2) return false;

  const produttori = ammesse.some((fonte) => fonte.natura === "produttore");
  const istituzionali = ammesse.filter((fonte) =>
    ["ufficiale_eu", "ufficiale_it", "regionale", "certificazione", "consorzio"].includes(
      fonte.natura
    )
  );
  return (produttori && istituzionali.length > 0) || istituzionali.length >= 2;
}

/** Tavily è un secondo livello, mai un prerequisito per ottenere una ricerca web. */
export function creaRicercaWebIbrida(
  opzioni: OpzioniRicercaTavily = {}
): ProviderRicercaWeb {
  const fetchImpl = opzioni.fetchImpl ?? fetch;
  const apiKey = (opzioni.apiKey ?? process.env.TAVILY_API_KEY ?? "").trim();
  const keyless = creaRicercaWeb({
    ...opzioni,
    fetchImpl,
    timeoutQueryMs: Math.min(opzioni.timeoutQueryMs ?? 3_500, 3_500),
    timeoutPaginaMs: Math.min(opzioni.timeoutPaginaMs ?? 3_500, 3_500),
    maxPagine: Math.min(opzioni.maxPagine ?? 3, 3),
    maxFonti: Math.min(opzioni.maxFonti ?? 8, 8),
    seguiCollegamentiInterni: false,
    usaWikipedia: false,
  });
  const tavily = creaRicercaWebTavily({
    ...opzioni,
    fetchImpl,
    maxQuery: Math.min(opzioni.maxQuery ?? 2, 2),
    timeoutRicercaMs: Math.min(opzioni.timeoutRicercaMs ?? 5_000, 5_000),
    maxPagine: Math.min(opzioni.maxPagine ?? 3, 3),
    maxFonti: Math.min(opzioni.maxFonti ?? 8, 8),
    seguiCollegamentiInterni: false,
  });

  return {
    nome: "web-ibrida",
    async cerca(input: RichiestaRicercaWeb): Promise<RicercaWeb> {
      const avvio = Date.now();
      const queryRapide = costruisciQuery(input.riconoscimento).slice(0, 2);
      const rapido = await keyless.cerca({
        ...input,
        query: queryRapide,
      });

      if (fontiKeylessSufficienti(rapido.fonti)) {
        return {
          ...rapido,
          motore: `keyless:${rapido.motore ?? "web"}`,
          durataMs: Date.now() - avvio,
          messaggio: rapido.messaggio,
        };
      }

      // Senza chiave Tavily si conserva comunque il risultato gratuito:
      // non si blocca l'analisi e non si simula una ricerca a pagamento.
      if (!apiKey) {
        return {
          ...rapido,
          motore: rapido.motore ?? "keyless",
          durataMs: Date.now() - avvio,
        };
      }

      const approfondito = await tavily.cerca(input);
      const perUrl = new Map<string, FonteWeb>();
      for (const fonte of [...rapido.fonti, ...approfondito.fonti]) {
        const esistente = perUrl.get(fonte.url);
        if (
          !esistente ||
          (!esistente.lettoIntegralmente && fonte.lettoIntegralmente)
        ) {
          perUrl.set(fonte.url, fonte);
        }
      }
      const fonti = [...perUrl.values()].map((fonte, indice) => ({
        ...fonte,
        id: `web:${indice + 1}`,
      }));

      if (fonti.length === 0) {
        return {
          ...approfondito,
          fonti: [],
          query: [...new Set([...queryRapide, ...approfondito.query])],
          durataMs: Date.now() - avvio,
          motore: approfondito.motore ?? "keyless+tavily",
        };
      }

      return {
        ...approfondito,
        stato: "ok",
        consultataIl: approfondito.consultataIl ?? rapido.consultataIl,
        query: [...new Set([...queryRapide, ...approfondito.query])],
        fonti,
        messaggio:
          approfondito.messaggio && rapido.fonti.length > 0
            ? `${approfondito.messaggio} Conservate anche le fonti della ricerca keyless iniziale.`
            : approfondito.messaggio,
        durataMs: Date.now() - avvio,
        motore: `keyless+tavily:${approfondito.motore ?? "tavily"}`,
        sintesi: sintetizzaFontiWeb(input.riconoscimento, fonti),
      };
    },
  };
}
