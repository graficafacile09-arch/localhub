import { estraiTestoPdf } from "./pdf";
import type {
  AttendibilitaFonte,
  FonteWeb,
  NaturaFonteWeb,
  RicercaWeb,
  RiconoscimentoAi,
} from "./tipi";

/**
 * RadiciScan — ricerca web multifonte.
 *
 * Motore generale: DuckDuckGo Lite (HTML pubblico, nessuna chiave API). Non
 * si usa un endpoint inventato: la forma delle risposte è verificata e il
 * parser è tollerante, ma un risultato senza URL https valido viene scartato.
 *
 * Ogni fonte è classificata per natura e attendibilità:
 * - ufficiale_eu / ufficiale_it / regionale: domini istituzionali, attendibilità alta;
 * - consorzio: sito di un consorzio di tutela, attendibilità media;
 * - database_prodotti: OpenFoodFacts e simili, attendibilità media;
 * - produttore / commerciale / informativo: attendibilità bassa o media,
 *   mai sufficiente per una certificazione.
 *
 * Sicurezza: si interrogano solo host fissi; le pagine vengono lette solo da
 * un'allowlist di domini istituzionali, con redirect rifiutati, tetto di byte,
 * timeout e controllo di protocollo/porta/credenziali. Nessun URL di pagina
 * viene costruito da input libero.
 */

const HOST_RICERCA = "lite.duckduckgo.com";
const HOST_RICERCA_BING = "www.bing.com";
/**
 * DuckDuckGo Lite può rispondere 202 (challenge) dagli IP dei data center:
 * in quel caso si usa Bing HTML come secondo motore, senza chiavi API.
 * Se anche il secondo motore fallisce, la ricerca è dichiarata non
 * disponibile, mai "nessuna fonte".
 */
const ABILITA_FALLBACK_BING = true;
const MAX_RISPOSTA_RICERCA = 500_000;
const MAX_PAGINA = 400_000;
const MAX_QUERY = 4;
const MAX_RISULTATI_QUERY = 5;
const MAX_FONTI = 14;
const TIMEOUT_QUERY_MS = 6_000;
const TIMEOUT_PAGINA_MS = 5_000;
const TTL_CACHE_MS = 10 * 60 * 1000;
const MAX_CARATTERI_PAGINA = 20_000;

const HOST_LETTURA_UFFICIALE = new Set([
  "ec.europa.eu",
  "eur-lex.europa.eu",
  "www.masaf.gov.it",
  "masaf.gov.it",
  "www.regione.calabria.it",
  "regione.calabria.it",
  "www.arsacweb.it",
  "arsacweb.it",
]);

export interface OpzioniRicercaWeb {
  fetchImpl?: typeof fetch;
  timeoutQueryMs?: number;
  timeoutPaginaMs?: number;
  adesso?: () => Date;
  leggiPagineUfficiali?: boolean;
}

export interface RichiestaRicercaWeb {
  riconoscimento: RiconoscimentoAi;
  signal?: AbortSignal;
}

export interface ProviderRicercaWeb {
  nome: string;
  cerca(input: RichiestaRicercaWeb): Promise<RicercaWeb>;
}

const cache = new Map<string, { scade: number; valore: unknown }>();

/** Solo per i test: svuota la cache di modulo. */
export function svuotaCacheWeb(): void {
  cache.clear();
}

function daCache<T>(chiave: string, adesso: number): T | null {
  const voce = cache.get(chiave);
  if (!voce) return null;
  if (voce.scade <= adesso) {
    cache.delete(chiave);
    return null;
  }
  return voce.valore as T;
}

function inCache(chiave: string, valore: unknown, adesso: number): void {
  cache.set(chiave, { scade: adesso + TTL_CACHE_MS, valore });
  if (cache.size > 200) {
    const prima = cache.keys().next().value;
    if (prima) cache.delete(prima);
  }
}

function normalizza(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function decodificaEntita(testo: string): string {
  const mappa: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&nbsp;": " ",
    "&agrave;": "à",
    "&egrave;": "è",
    "&eacute;": "é",
    "&igrave;": "ì",
    "&ograve;": "ò",
    "&ugrave;": "ù",
  };
  return testo
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/gi, (entita) => mappa[entita.toLowerCase()] ?? entita);
}

function soloTesto(html: string): string {
  return decodificaEntita(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function hostUgualeOSottoDominio(host: string, dominio: string): boolean {
  const normalizzato = host.toLowerCase().replace(/\.$/, "");
  return normalizzato === dominio || normalizzato.endsWith(`.${dominio}`);
}

function classeNatura(
  host: string,
  titolo: string,
  url: string
): { natura: NaturaFonteWeb; attendibilita: AttendibilitaFonte } {
  const dominio = host.toLowerCase().replace(/\.$/, "");
  if (
    dominio === "ec.europa.eu" ||
    hostUgualeOSottoDominio(dominio, "europa.eu") ||
    dominio === "eur-lex.europa.eu"
  ) {
    return { natura: "ufficiale_eu", attendibilita: "alta" };
  }
  if (hostUgualeOSottoDominio(dominio, "gov.it")) {
    return { natura: "ufficiale_it", attendibilita: "alta" };
  }
  if (hostUgualeOSottoDominio(dominio, "regione.calabria.it")) {
    return { natura: "regionale", attendibilita: "alta" };
  }
  // ARSAC: dominio ufficiale esatto. Non basta che il testo dell'host
  // contenga la stringa "arsac" (es. arsac-falso.example).
  if (dominio === "arsacweb.it" || dominio === "www.arsacweb.it") {
    return { natura: "regionale", attendibilita: "alta" };
  }
  if (
    dominio === "openfoodfacts.org" ||
    hostUgualeOSottoDominio(dominio, "openfoodfacts.org")
  ) {
    return { natura: "database_prodotti", attendibilita: "media" };
  }
  // Il nome o il titolo non dimostrano che un sito appartenga a un
  // consorzio riconosciuto: la fonte resta informativa finché non esiste
  // una allowlist verificata di domini consortili.
  if (host.includes("wikipedia") || host.includes("wikidata")) {
    return { natura: "informativo", attendibilita: "media" };
  }
  if (
    /(azienda agricola|caseificio|oleificio|salumificio|pastificio|produttore|produttori)/i.test(
      `${titolo} ${url}`
    )
  ) {
    return { natura: "produttore", attendibilita: "media" };
  }
  if (/(shop|store|acquista|prezzo|vendita|amazon|ebay|fromi|eataly)/i.test(url)) {
    return { natura: "commerciale", attendibilita: "bassa" };
  }
  return { natura: "informativo", attendibilita: "bassa" };
}

/** Valida un URL finale già decodificato (https, senza credenziali/porta/IP). */
function validaUrlFinale(finale: URL): string | null {
  if (finale.protocol !== "https:") return null;
  if (finale.username !== "" || finale.password !== "") return null;
  if (finale.port !== "") return null;
  if (finale.hash !== "") return null;
  if (finale.hostname === "duckduckgo.com" || finale.hostname.endsWith(".duckduckgo.com")) {
    return null;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(finale.hostname) || finale.hostname.includes(":")) {
    return null;
  }
  return finale.toString();
}

/** Decodifica il redirect Bing (`/ck/a?...&u=a1<base64url>`). */
export function urlBing(valore: string): string | null {
  try {
    const iniziale = new URL(valore, "https://www.bing.com");
    if (iniziale.hostname === HOST_RICERCA_BING && iniziale.pathname.startsWith("/ck/a")) {
      const u = iniziale.searchParams.get("u");
      if (!u || !u.startsWith("a1")) return null;
      const base64 = u
        .slice(2)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      return validaUrlFinale(new URL(Buffer.from(padded, "base64").toString("utf8")));
    }
    return validaUrlFinale(iniziale);
  } catch {
    return null;
  }
}

/** Parser dei risultati Bing (`li.b_algo`). */
export function estraiRisultatiBing(html: string): RisultatoGrezzo[] {
  const risultati: RisultatoGrezzo[] = [];
  for (const blocco of html.split(/<li class=["']b_algo["'][^>]*>/i).slice(1)) {
    const link = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(blocco);
    if (!link) continue;
    const url = urlBing(decodificaEntita(link[1]));
    if (!url) continue;
    const titolo = soloTesto(link[2]).slice(0, 200);
    if (!titolo) continue;
    const snippet = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(blocco);
    risultati.push({
      titolo,
      url,
      estratto: snippet ? soloTesto(snippet[1]).slice(0, 500) : null,
    });
    if (risultati.length >= MAX_RISULTATI_QUERY) break;
  }
  return risultati;
}

function puoLeggerePagina(host: string): boolean {
  const pulito = host.toLowerCase().replace(/\.$/, "");
  return (
    HOST_LETTURA_UFFICIALE.has(pulito) ||
    pulito.endsWith(".gov.it") ||
    pulito.endsWith(".europa.eu")
  );
}

/** Estrae URL reale da un redirect DuckDuckGo e applica i controlli SSRF. */
export function urlRisultato(valore: string): string | null {
  try {
    const iniziale = new URL(valore, "https://lite.duckduckgo.com");
    let finale = iniziale;
    if (iniziale.hostname === "duckduckgo.com" || iniziale.hostname.endsWith(".duckduckgo.com")) {
      const uddg = iniziale.searchParams.get("uddg");
      if (!uddg) return null;
      finale = new URL(uddg);
    }

    return validaUrlFinale(finale);
  } catch {
    return null;
  }
}

interface RisultatoGrezzo {
  titolo: string;
  url: string;
  estratto: string | null;
}

/** Parser tollerante della pagina risultati di DuckDuckGo Lite. */
export function estraiRisultati(html: string): RisultatoGrezzo[] {
  const risultati: RisultatoGrezzo[] = [];
  const collegamenti = [
    ...html.matchAll(
      /href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi
    ),
  ];

  for (const collegamento of collegamenti) {
    const url = urlRisultato(decodificaEntita(collegamento[1]));
    if (!url) continue;
    const titolo = soloTesto(collegamento[2]).slice(0, 200);
    if (!titolo) continue;

    const posizione = (collegamento.index ?? 0) + collegamento[0].length;
    const snippetMatch = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i.exec(
      html.slice(posizione, posizione + 4000)
    );
    const estratto = snippetMatch
      ? soloTesto(snippetMatch[1]).replace(/\s+/g, " ").trim().slice(0, 500)
      : null;

    risultati.push({ titolo, url, estratto: estratto || null });
    if (risultati.length >= MAX_RISULTATI_QUERY) break;
  }

  return risultati;
}

async function leggiBytesLimitati(risposta: Response, max: number): Promise<Uint8Array | null> {
  if (!risposta.body) {
    const bytes = new Uint8Array(await risposta.arrayBuffer());
    return bytes.byteLength > max ? null : bytes;
  }
  const lettore = risposta.body.getReader();
  const parti: Uint8Array[] = [];
  let totale = 0;
  try {
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      if (!value) continue;
      totale += value.byteLength;
      if (totale > max) {
        await lettore.cancel();
        return null;
      }
      parti.push(value);
    }
  } finally {
    lettore.releaseLock();
  }
  const bytes = new Uint8Array(totale);
  let posizione = 0;
  for (const parte of parti) {
    bytes.set(parte, posizione);
    posizione += parte.byteLength;
  }
  return bytes;
}

/** Legge una pagina istituzionale: HTML o PDF. Non lancia mai. */
async function leggiPaginaUfficiale(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ estratto: string; pagineLette: number | null; completo: boolean } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !puoLeggerePagina(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const annulla = () => controller.abort();
  signal?.addEventListener("abort", annulla, { once: true });
  if (signal?.aborted) controller.abort();

  try {
    const risposta = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "text/html, application/pdf;q=0.9, text/plain;q=0.5",
        "Accept-Language": "it-IT,it;q=0.9",
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!risposta.ok) return null;

    const dichiarata = Number(risposta.headers.get("content-length") ?? "");
    if (Number.isFinite(dichiarata) && dichiarata > MAX_PAGINA) return null;

    const bytes = await leggiBytesLimitati(risposta, MAX_PAGINA);
    if (!bytes || bytes.byteLength === 0) return null;

    const tipo = (risposta.headers.get("content-type") ?? "").toLowerCase();
    if (
      tipo.includes("pdf") ||
      String.fromCharCode(...bytes.subarray(0, 4)) === "%PDF"
    ) {
      const pdf = estraiTestoPdf(bytes);
      if (pdf.pagine.length === 0) {
        return {
          estratto: "Documento PDF senza testo estraibile (scansione): non è stato letto.",
          pagineLette: 0,
          completo: false,
        };
      }
      const testo = pdf.pagine
        .map((pagina) => pagina.testo)
        .join("\n")
        .replace(/\s+/g, " ")
        .trim();
      return {
        estratto: testo.slice(0, MAX_CARATTERI_PAGINA),
        pagineLette: pdf.pagine.length,
        completo:
          testo.length <= MAX_CARATTERI_PAGINA &&
          pdf.pagineSenzaTesto.length === 0,
      };
    }

    const html = new TextDecoder("utf-8").decode(bytes);
    const testo = soloTesto(html);
    return {
      estratto: testo.slice(0, MAX_CARATTERI_PAGINA),
      pagineLette: null,
      completo: testo.length <= MAX_CARATTERI_PAGINA,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", annulla);
  }
}

export function costruisciQuery(riconoscimento: RiconoscimentoAi): string[] {
  const candidati = [
    riconoscimento.denominazioneProposta,
    riconoscimento.prodotto,
    riconoscimento.produttore ?? null,
    riconoscimento.territorioProposto
      ? `${riconoscimento.prodotto} ${riconoscimento.territorioProposto}`
      : null,
    `${riconoscimento.prodotto} Calabria`,
  ];

  const viste = new Set<string>();
  const query: string[] = [];
  for (const candidato of candidati) {
    if (!candidato) continue;
    const pulita = candidato.replace(/\s+/g, " ").trim().slice(0, 80);
    const chiave = normalizza(pulita);
    if (chiave.length < 4 || viste.has(chiave)) continue;
    viste.add(chiave);
    query.push(pulita);
    if (query.length >= MAX_QUERY) break;
  }
  return query;
}

async function scaricaHtml(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal,
  seguiRedirect = false
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const annulla = () => controller.abort();
  signal?.addEventListener("abort", annulla, { once: true });
  if (signal?.aborted) controller.abort();

  try {
    const risposta = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.6",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      },
      redirect: seguiRedirect ? "follow" : "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!risposta.ok) return null;
    if (seguiRedirect && risposta.url) {
      // Il redirect è ammesso solo verso gli host dei motori: nessuna
      // destinazione arbitraria viene seguita. `Response` sintetiche (test)
      // non espongono `url`: in quel caso non c'è un redirect da validare.
      const host = new URL(risposta.url).hostname;
      if (
        host !== HOST_RICERCA &&
        host !== HOST_RICERCA_BING &&
        host !== "it.wikipedia.org"
      ) {
        return null;
      }
    }
    const bytes = await leggiBytesLimitati(risposta, MAX_RISPOSTA_RICERCA);
    if (!bytes) return null;
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", annulla);
  }
}

interface RispostaWikipedia {
  query?: { search?: Array<{ title?: unknown; snippet?: unknown }> };
}

/** Wikipedia è una fonte informativa strutturata, non una certificazione. */
async function cercaWikipedia(
  query: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<RisultatoGrezzo[]> {
  const url = new URL("https://it.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "3",
    format: "json",
    utf8: "1",
  }).toString();

  const testo = await scaricaHtml(url.toString(), fetchImpl, timeoutMs, signal, true);
  if (!testo) return [];
  try {
    const payload = JSON.parse(testo) as RispostaWikipedia;
    const voci = payload.query?.search ?? [];
    return voci
      .map((voce) => {
        if (typeof voce.title !== "string" || !voce.title.trim()) return null;
        const titolo = voce.title.trim();
        return {
          titolo: `Wikipedia — ${titolo}`,
          url: `https://it.wikipedia.org/wiki/${encodeURIComponent(titolo.replace(/ /g, "_"))}`,
          estratto:
            typeof voce.snippet === "string"
              ? soloTesto(voce.snippet).slice(0, 500)
              : null,
        };
      })
      .filter((voce): voce is RisultatoGrezzo => voce !== null);
  } catch {
    return [];
  }
}

async function cercaQuery(
  query: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  adesso: number,
  signal?: AbortSignal
): Promise<{ risultati: RisultatoGrezzo[]; errore: boolean }> {
  const chiave = `q:${normalizza(query)}`;
  const inMemoria = daCache<RisultatoGrezzo[]>(chiave, adesso);
  if (inMemoria) return { risultati: inMemoria, errore: false };

  const urlDdg = new URL(`https://${HOST_RICERCA}/`);
  urlDdg.searchParams.set("q", query);
  const htmlDdg = await scaricaHtml(urlDdg.toString(), fetchImpl, timeoutMs, signal);
  let risultati = htmlDdg ? estraiRisultati(htmlDdg) : [];
  let errore = htmlDdg === null;

  if (ABILITA_FALLBACK_BING && risultati.length === 0) {
    const urlBing = new URL(`https://${HOST_RICERCA_BING}/search`);
    urlBing.searchParams.set("q", query);
    urlBing.searchParams.set("setlang", "it");
    urlBing.searchParams.set("cc", "IT");
    const htmlBing = await scaricaHtml(
      urlBing.toString(),
      fetchImpl,
      timeoutMs,
      signal,
      true
    );
    if (htmlBing) {
      const daBing = estraiRisultatiBing(htmlBing);
      if (daBing.length > 0) {
        risultati = daBing;
        errore = false;
      } else if (htmlDdg === null) {
        errore = true;
      }
    }
  }

  // Ultimo fallback strutturato: Wikipedia risponde anche quando i motori
  // generalisti bloccano gli IP dei data center. Resta una fonte informativa.
  if (risultati.length === 0) {
    const daWikipedia = await cercaWikipedia(query, fetchImpl, timeoutMs, signal);
    if (daWikipedia.length > 0) {
      risultati = daWikipedia;
      errore = false;
    }
  }

  if (risultati.length > 0) inCache(chiave, risultati, adesso);
  return { risultati, errore };
}

export function creaRicercaWeb(opzioni: OpzioniRicercaWeb = {}): ProviderRicercaWeb {
  const fetchImpl = opzioni.fetchImpl ?? fetch;
  const adesso = opzioni.adesso ?? (() => new Date());
  const timeoutQuery = opzioni.timeoutQueryMs ?? TIMEOUT_QUERY_MS;
  const timeoutPagina = opzioni.timeoutPaginaMs ?? TIMEOUT_PAGINA_MS;

  return {
    nome: "web",
    async cerca({ riconoscimento, signal }) {
      const avvio = Date.now();
      const data = adesso();
      const consultataIl = data.toISOString().slice(0, 10);
      const query = costruisciQuery(riconoscimento);

      if (query.length === 0) {
        return {
          stato: "non_eseguita",
          consultataIl,
          query,
          fonti: [],
          messaggio: "Nessun nome utile per una ricerca web.",
          durataMs: 0,
        };
      }

      const esiti = await Promise.all(
        query.map((voce) =>
          cercaQuery(voce, fetchImpl, timeoutQuery, data.getTime(), signal)
        )
      );

      const errori = esiti.filter((esito) => esito.errore).length;
      if (errori === esiti.length) {
        return {
          stato: "non_disponibile",
          consultataIl,
          query,
          fonti: [],
          messaggio:
            "La ricerca web non è stata completata: nessun risultato è stato letto. " +
            "L'assenza di risultati non dimostra l'assenza di fonti.",
          durataMs: Date.now() - avvio,
        };
      }

      const visti = new Set<string>();
      const fonti: FonteWeb[] = [];
      for (let indice = 0; indice < esiti.length; indice += 1) {
        for (const risultato of esiti[indice].risultati) {
          if (visti.has(risultato.url)) continue;
          visti.add(risultato.url);

          const { hostname } = new URL(risultato.url);
          const { natura, attendibilita } = classeNatura(
            hostname,
            risultato.titolo,
            risultato.url
          );
          fonti.push({
            id: `web:${fonti.length + 1}`,
            titolo: risultato.titolo,
            ente: hostname,
            url: risultato.url,
            dominio: hostname,
            natura,
            attendibilita,
            consultataIl,
            dataDocumento: null,
            estratto: risultato.estratto,
            riferimentoNormativo: null,
            pagineLette: null,
            lettoIntegralmente: false,
            relazione: `Risultato della ricerca web per "${query[indice]}".`,
          });
        }
      }

      const peso: Record<NaturaFonteWeb, number> = {
        ufficiale_eu: 0,
        ufficiale_it: 1,
        regionale: 2,
        consorzio: 3,
        database_prodotti: 4,
        produttore: 5,
        informativo: 6,
        commerciale: 7,
      };
      fonti.sort((a, b) => peso[a.natura] - peso[b.natura]);
      const scelte = fonti.slice(0, MAX_FONTI);

      // Lettura delle prime due fonti istituzionali: contenuto reale, non
      // solo il frammento del motore di ricerca.
      if (opzioni.leggiPagineUfficiali !== false) {
        const daLeggere = scelte
          .filter(
            (fonte) =>
              fonte.natura === "ufficiale_eu" ||
              fonte.natura === "ufficiale_it" ||
              fonte.natura === "regionale"
          )
          .slice(0, 2);

        await Promise.all(
          daLeggere.map(async (fonte) => {
            const chiave = `p:${fonte.url}`;
            const letta = daCache<{
              estratto: string;
              pagineLette: number | null;
              completo: boolean;
            }>(chiave, data.getTime());
            const contenuto =
              letta ??
              (await leggiPaginaUfficiale(fonte.url, fetchImpl, timeoutPagina, signal));
            if (!contenuto) return;
            if (!letta) inCache(chiave, contenuto, data.getTime());
            fonte.estratto = contenuto.estratto || fonte.estratto;
            fonte.pagineLette = contenuto.pagineLette;
            fonte.lettoIntegralmente = contenuto.completo;
          })
        );
      }

      return {
        stato: "ok",
        consultataIl,
        query,
        fonti: scelte,
        messaggio:
          errori > 0
            ? "Alcune ricerche web non hanno risposto: sono mostrati i risultati recuperati."
            : scelte.length === 0
              ? "Nessun risultato web pertinente: non è una prova di assenza di fonti."
              : null,
        durataMs: Date.now() - avvio,
      };
    },
  };
}
