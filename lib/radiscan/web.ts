import { estraiTestoPdf } from "./pdf";
import type {
  AttendibilitaFonte,
  DichiarazioneFonte,
  FonteWeb,
  NaturaFonteWeb,
  ProvaDocumentale,
  RicercaWeb,
  RiconoscimentoAi,
  SintesiFontiWeb,
  SintesiVerificaWeb,
} from "./tipi";

/**
 * RadiciScan — ricerca web multifonte.
 *
 * Il motore primario è Tavily (`web-tavily`); Google grounding e i motori
 * keyless (DuckDuckGo HTML, Bing HTML e Wikipedia) restano riserve. Qui vive
 * tutta la parte comune:
 * - query separate per denominazione, produttore, marchio, prodotto,
 *   consorzio e organismo di controllo;
 * - deduplica degli URL e filtro di pertinenza;
 * - lettura effettiva delle pagine, comprese quelle dei produttori;
 * - un solo livello di collegamenti interni pertinenti;
 * - classificazione della fonte e distinzione fra dichiarazione aziendale e
 *   verifica indipendente;
 * - sintesi separata delle cinque verifiche A-E.
 *
 * Sicurezza: si leggono solo URL https pubblici restituiti da una ricerca,
 * senza credenziali, porte, IP letterali o host interni. Nessun URL viene
 * costruito da input libero e nessuna pagina viene presentata come fonte se
 * non è stata effettivamente recuperata.
 */

const HOST_DDG = "html.duckduckgo.com";
const HOST_BING = "www.bing.com";
const MAX_RISPOSTA_RICERCA = 600_000;
const MAX_PAGINA = 500_000;
const MAX_QUERY = 8;
const MAX_RISULTATI_QUERY = 7;
const MAX_FONTI = 16;
const MAX_PAGINE = 8;
const MAX_PAGINE_DOMINIO = 2;
const MAX_CARATTERI_PAGINA = 6_000;
const TIMEOUT_QUERY_MS = 6_000;
const TIMEOUT_PAGINA_MS = 6_000;
const TTL_CACHE_MS = 10 * 60 * 1000;

const PAROLE_TERRITORIO = new Set([
  "calabria",
  "italia",
  "italiano",
  "italiana",
  "regione",
  "provincia",
  "comune",
  "dop",
  "igp",
  "stg",
  "doc",
  "docg",
  "igt",
  "pat",
  "prodotto",
  "prodotti",
  "salume",
  "salumi",
]);

const PAROLE_SOCIETARIE = new Set([
  "salumificio",
  "caseificio",
  "oleificio",
  "pastificio",
  "azienda",
  "agricola",
  "societa",
  "srl",
  "srls",
  "spa",
  "snc",
  "sas",
]);

const STOPWORD = new Set([
  "della",
  "delle",
  "degli",
  "dello",
  "dalla",
  "dalle",
  "dagli",
  "dello",
  "come",
  "cosa",
  "quali",
  "sono",
  "con",
  "per",
  "del",
  "dei",
  "delle",
  "una",
  "uno",
  "gli",
  "che",
  "non",
  "piu",
  "anche",
  "sul",
  "sulla",
  "nel",
  "nella",
  "this",
  "that",
  "with",
]);

export interface CandidatoWeb {
  titolo: string;
  url: string;
  estratto: string | null;
  query: string;
  /** Punteggio di pertinenza dichiarato dal motore, se disponibile. */
  punteggio?: number;
  /** Data del documento dichiarata dal motore, normalizzata ISO. */
  dataDocumento?: string | null;
}

export interface OpzioniRicercaWeb {
  fetchImpl?: typeof fetch;
  timeoutQueryMs?: number;
  timeoutPaginaMs?: number;
  adesso?: () => Date;
  /** Mantenuto per compatibilità: false disattiva la lettura delle pagine. */
  leggiPagineUfficiali?: boolean;
  maxPagine?: number;
  maxFonti?: number;
}

export interface RichiestaRicercaWeb {
  riconoscimento: RiconoscimentoAi;
  signal?: AbortSignal;
  /** Risultati già ottenuti da un motore (es. Google grounding). */
  candidati?: CandidatoWeb[];
  /** Query effettivamente usate dal motore, se disponibili. */
  query?: string[];
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

function tokenizza(valore: string): Set<string> {
  return new Set(
    normalizza(valore)
      .split(" ")
      .filter((parola) => parola.length >= 3 && !STOPWORD.has(parola))
  );
}

function copre(testo: string, frase: string): boolean {
  const attesi = [...tokenizza(frase)];
  if (attesi.length === 0) return false;
  const presenti = attesi.filter((parola) => testo.includes(parola)).length;
  return presenti / attesi.length >= 0.7;
}

/**
 * La ragione sociale contiene forme societarie e il tipo di stabilimento
 * ("Salumificio Madeo S.r.l."): per collegare le fonti serve il nome
 * distintivo, non l'intera etichetta legale.
 */
function paroleDistintiveProduttore(produttore: string): string[] {
  const tutte = [...tokenizza(produttore)];
  const distintive = tutte.filter((parola) => !PAROLE_SOCIETARIE.has(parola));
  return distintive.length > 0 ? distintive : tutte;
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

/** Host pubblico, senza credenziali, porte o destinazioni interne. */
export function hostPubblico(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (host === "metadata.google.internal" || host.endsWith(".localhost")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
  // I domini dei motori non sono contenuto: non vanno letti come fonti.
  if (
    host === "google.com" ||
    host.endsWith(".google.com") ||
    host === "bing.com" ||
    host.endsWith(".bing.com") ||
    host === "duckduckgo.com" ||
    host.endsWith(".duckduckgo.com") ||
    host === "search.yahoo.com"
  ) {
    return false;
  }
  return true;
}

function urlPubblico(valore: string | null | undefined): boolean {
  if (typeof valore !== "string" || valore.trim() === "") return false;
  let url: URL;
  try {
    url = new URL(valore.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" || url.hash !== "") return false;
  return hostPubblico(url.hostname);
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

function hostDa(valore: string): string {
  try {
    return new URL(valore).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function classeNatura(
  host: string,
  titolo: string,
  url: string,
  produttore: string | null
): { natura: NaturaFonteWeb; attendibilita: AttendibilitaFonte; dichiarazione: DichiarazioneFonte } {
  const dominio = host.toLowerCase().replace(/\.$/, "");
  const etichetta = normalizza(`${titolo} ${url}`);

  if (
    dominio === "ec.europa.eu" ||
    hostUgualeOSottoDominio(dominio, "europa.eu") ||
    dominio === "eur-lex.europa.eu"
  ) {
    return { natura: "ufficiale_eu", attendibilita: "alta", dichiarazione: "indipendente" };
  }
  if (hostUgualeOSottoDominio(dominio, "gov.it")) {
    return { natura: "ufficiale_it", attendibilita: "alta", dichiarazione: "indipendente" };
  }
  if (hostUgualeOSottoDominio(dominio, "regione.calabria.it")) {
    return { natura: "regionale", attendibilita: "alta", dichiarazione: "indipendente" };
  }
  if (dominio === "arsacweb.it" || dominio === "www.arsacweb.it") {
    return { natura: "regionale", attendibilita: "alta", dichiarazione: "indipendente" };
  }
  if (
    hostUgualeOSottoDominio(dominio, "rina.org") ||
    /agroqualita|certificazione|organism[oi]\s+di\s+controllo/i.test(etichetta)
  ) {
    return { natura: "certificazione", attendibilita: "alta", dichiarazione: "indipendente" };
  }
  // Un dominio che si chiama "consorzio" non è automaticamente un consorzio
  // riconosciuto: senza un elenco verificato resta una fonte informativa.
  // La distinzione evita di attribuire autorevolezza a un sito autoproclamato.

  // Il produttore si riconosce dal dominio, non dal titolo: un rivenditore
  // può intitolare la pagina "Salumificio Madeo" senza essere il produttore.
  if (produttore) {
    const chiaveProduttore = normalizza(produttore);
    const etichettaHost = normalizza(dominio);
    if (
      chiaveProduttore.length >= 4 &&
      tokenizza(produttore).size > 0 &&
      [...tokenizza(produttore)].some((parola) => etichettaHost.includes(parola))
    ) {
      return { natura: "produttore", attendibilita: "media", dichiarazione: "aziendale" };
    }
  }
  if (/salumificio|caseificio|oleificio|pastificio|azienda\s+agricola/i.test(dominio)) {
    return { natura: "produttore", attendibilita: "media", dichiarazione: "aziendale" };
  }

  if (hostUgualeOSottoDominio(dominio, "openfoodfacts.org")) {
    return { natura: "database_prodotti", attendibilita: "media", dichiarazione: "informativa" };
  }
  if (/wikipedia|wikidata/.test(dominio)) {
    return { natura: "informativo", attendibilita: "media", dichiarazione: "indipendente" };
  }
  if (/(shop|store|acquista|prezzo|vendita|amazon|ebay|eataly)/i.test(url)) {
    return { natura: "commerciale", attendibilita: "bassa", dichiarazione: "informativa" };
  }
  return { natura: "informativo", attendibilita: "bassa", dichiarazione: "informativa" };
}

function validaUrlFinale(finale: URL): string | null {
  if (finale.protocol !== "https:") return null;
  if (finale.username !== "" || finale.password !== "") return null;
  if (finale.port !== "" || finale.hash !== "") return null;
  if (!hostPubblico(finale.hostname)) return null;
  return finale.toString();
}

/** Decodifica il redirect Bing (`/ck/a?...&u=a1<base64url>`). */
export function urlBing(valore: string): string | null {
  try {
    const iniziale = new URL(valore, `https://${HOST_BING}`);
    if (iniziale.hostname === HOST_BING && iniziale.pathname.startsWith("/ck/a")) {
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

/** Estrae l'URL reale da un redirect DuckDuckGo e applica i controlli SSRF. */
export function urlRisultato(valore: string): string | null {
  try {
    const iniziale = new URL(valore, `https://${HOST_DDG}`);
    let finale = iniziale;
    if (
      iniziale.hostname === "duckduckgo.com" ||
      iniziale.hostname.endsWith(".duckduckgo.com")
    ) {
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

/** Parser della pagina risultati DuckDuckGo HTML (`result__a`). */
export function estraiRisultatiDdg(html: string): RisultatoGrezzo[] {
  const risultati: RisultatoGrezzo[] = [];

  for (const collegamento of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributi = collegamento[1] ?? "";
    if (!/class=["'][^"']*result__a/i.test(attributi)) continue;
    const href = /href=["']([^"']+)["']/i.exec(attributi)?.[1];
    if (!href) continue;
    const url = urlRisultato(decodificaEntita(href));
    if (!url) continue;
    const titolo = soloTesto(collegamento[2] ?? "").slice(0, 200);
    if (!titolo) continue;

    const posizione = (collegamento.index ?? 0) + collegamento[0].length;
    const snippetMatch =
      /class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|td)>/i.exec(
        html.slice(posizione, posizione + 3000)
      );
    risultati.push({
      titolo,
      url,
      estratto: snippetMatch ? soloTesto(snippetMatch[1]).slice(0, 500) : null,
    });
    if (risultati.length >= MAX_RISULTATI_QUERY) break;
  }

  return risultati;
}

/** Parser tollerante della vecchia pagina DuckDuckGo Lite. */
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
    risultati.push({
      titolo,
      url,
      estratto: snippetMatch
        ? soloTesto(snippetMatch[1]).replace(/\s+/g, " ").trim().slice(0, 500)
        : null,
    });
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

interface CollegamentoPagina {
  url: string;
  testo: string;
}

interface PaginaLetta {
  estratto: string;
  pagineLette: number | null;
  completo: boolean;
  titolo: string | null;
  collegamenti: CollegamentoPagina[];
}

function estraiCollegamenti(html: string, base: URL): CollegamentoPagina[] {
  const collegamenti: CollegamentoPagina[] = [];
  const visti = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodificaEntita(match[1] ?? "").trim();
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.hostname !== base.hostname) continue;
    if (!urlPubblico(url.toString())) continue;
    const chiave = chiaveUrl(url.toString());
    if (visti.has(chiave)) continue;
    const testo = soloTesto(match[2] ?? "").replace(/\s+/g, " ").trim();
    if (testo.length < 3 || testo.length > 180) continue;
    visti.add(chiave);
    collegamenti.push({ url: url.toString(), testo });
    if (collegamenti.length >= 30) break;
  }
  return collegamenti;
}

/** Legge una pagina pubblica: HTML o PDF. Non lancia mai. */
async function leggiPagina(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<PaginaLetta | null> {
  if (!urlPubblico(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!risposta.ok) return null;

    // Se il server ha seguito un redirect, la destinazione deve restare
    // pubblica. Una Response sintetica dei test non espone `url`.
    if (risposta.url && !urlPubblico(risposta.url)) return null;

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
          titolo: null,
          collegamenti: [],
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
        titolo: null,
        collegamenti: [],
      };
    }

    const html = new TextDecoder("utf-8").decode(bytes);
    const titoloHtml = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    const testo = soloTesto(html);
    return {
      estratto: testo.slice(0, MAX_CARATTERI_PAGINA),
      pagineLette: null,
      completo: testo.length <= MAX_CARATTERI_PAGINA,
      titolo: titoloHtml ? soloTesto(titoloHtml).slice(0, 220) : null,
      collegamenti: estraiCollegamenti(html, parsed),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", annulla);
  }
}

async function scaricaHtml(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal,
  hostAmmessi: readonly string[] = []
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
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!risposta.ok) return null;
    if (risposta.url && hostAmmessi.length > 0) {
      const host = new URL(risposta.url).hostname;
      if (!hostAmmessi.includes(host)) return null;
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

  const testo = await scaricaHtml(url.toString(), fetchImpl, timeoutMs, signal, [
    "it.wikipedia.org",
  ]);
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

function paroleFortiProdotto(riconoscimento: RiconoscimentoAi): Set<string> {
  return new Set(
    [
      ...tokenizza(riconoscimento.prodotto),
      ...tokenizza(riconoscimento.denominazioneProposta ?? ""),
    ].filter((parola) => !PAROLE_TERRITORIO.has(parola))
  );
}

function haProdottoInTesto(
  testo: string,
  riconoscimento: RiconoscimentoAi
): boolean {
  const normalizzato = normalizza(testo);
  return [...paroleFortiProdotto(riconoscimento)].some((parola) =>
    normalizzato.includes(parola)
  );
}

function pertinenteAlQuery(
  risultato: RisultatoGrezzo | CandidatoWeb,
  query: string,
  riconoscimento: RiconoscimentoAi
): boolean {
  const testo = normalizza(
    `${risultato.titolo} ${risultato.estratto ?? ""} ${risultato.url}`
  );
  const paroleProduttore = tokenizza(riconoscimento.produttore ?? "");
  const queryNorm = normalizza(query);
  const host = normalizza(hostDa(risultato.url));

  // Il solo territorio non identifica il prodotto: "Calabria" non rende
  // pertinente una pagina su Curinga o sulla provincia di Cosenza.
  const haProdotto = haProdottoInTesto(testo, riconoscimento);
  const haProduttore = [...paroleProduttore].some((parola) =>
    testo.includes(parola)
  );
  const hostGrezzo = hostDa(risultato.url);
  const hostDelProduttore = [...paroleProduttore].some((parola) =>
    host.includes(parola)
  );
  const queryChiedeProduttore = [...paroleProduttore].some((parola) =>
    queryNorm.includes(parola)
  );

  if (haProdotto) return true;

  // RINA/Agroqualità pubblica pagine generali sui prodotti DOP: sono
  // pertinenti come organismo di controllo anche senza il nome del salume.
  if (
    (/(^|\.)rina\.org$/.test(hostGrezzo) ||
      /(^|\.)arsacweb\.it$/.test(hostGrezzo) ||
      host.includes("agroqualita")) &&
    /dop|igp|salumi|prodotti tipici|certificaz/.test(testo)
  ) {
    return true;
  }

  // La homepage di un produttore può non ripetere il nome del prodotto nello
  // snippet: la si ammette e si verifica il contenuto dopo la lettura.
  if (paroleProduttore.size > 0 && (hostDelProduttore || queryChiedeProduttore && haProduttore)) {
    return true;
  }

  return false;
}

async function cercaQuery(
  query: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  adesso: number,
  signal?: AbortSignal
): Promise<{ risultati: RisultatoGrezzo[]; errore: boolean; motore: string | null }> {
  const chiave = `q:${normalizza(query)}`;
  const inMemoria = daCache<RisultatoGrezzo[]>(chiave, adesso);
  if (inMemoria) {
    return { risultati: inMemoria, errore: false, motore: "cache" };
  }

  const urlDdg = new URL(`https://${HOST_DDG}/html/`);
  urlDdg.searchParams.set("q", query);
  const htmlDdg = await scaricaHtml(
    urlDdg.toString(),
    fetchImpl,
    timeoutMs,
    signal,
    [HOST_DDG]
  );
  let risultati = htmlDdg ? estraiRisultatiDdg(htmlDdg) : [];
  // Compatibilità con il vecchio markup DuckDuckGo Lite (`result-link`):
  // alcuni mirror e risposte di prova usano ancora quella forma.
  if (risultati.length === 0 && htmlDdg) risultati = estraiRisultati(htmlDdg);
  let motore: string | null = risultati.length > 0 ? "duckduckgo" : null;
  let trasportoOk = htmlDdg !== null;

  if (risultati.length === 0) {
    const urlBing = new URL(`https://${HOST_BING}/search`);
    urlBing.searchParams.set("q", query);
    urlBing.searchParams.set("setlang", "it");
    urlBing.searchParams.set("cc", "IT");
    const htmlBing = await scaricaHtml(
      urlBing.toString(),
      fetchImpl,
      timeoutMs,
      signal,
      [HOST_BING]
    );
    trasportoOk = trasportoOk || htmlBing !== null;
    if (htmlBing) {
      const daBing = estraiRisultatiBing(htmlBing);
      if (daBing.length > 0) {
        risultati = daBing;
        motore = "bing";
      }
    }
  }

  // Ultimo fallback strutturato: Wikipedia risponde anche quando i motori
  // generalisti bloccano gli IP dei data center. Resta una fonte informativa.
  if (risultati.length === 0) {
    const daWikipedia = await cercaWikipedia(query, fetchImpl, timeoutMs, signal);
    if (daWikipedia.length > 0) {
      risultati = daWikipedia;
      motore = "wikipedia";
      trasportoOk = true;
    }
  }

  if (risultati.length > 0) inCache(chiave, risultati, adesso);
  return { risultati, errore: !trasportoOk, motore };
}

/**
 * Query separate per entità. Non si usa una sola stringa: il nome del
 * produttore non deve restringere la ricerca della denominazione nel registro,
 * e viceversa.
 */
export function costruisciQuery(riconoscimento: RiconoscimentoAi): string[] {
  const produttore = riconoscimento.produttore?.trim() || null;
  const denominazione = riconoscimento.denominazioneProposta?.trim() || null;
  const prodotto = riconoscimento.prodotto.trim();
  const territorio = riconoscimento.territorioProposto?.trim() || null;

  const candidati = [
    produttore && prodotto ? `${produttore} ${prodotto}` : null,
    produttore && denominazione ? `${produttore} ${denominazione}` : null,
    produttore ? `${produttore} salumi` : null,
    denominazione ? `${denominazione} registro DOP` : null,
    territorio ? `${prodotto} ${territorio}` : prodotto,
    `${prodotto} consorzio di tutela`,
    `${prodotto} organismo di controllo`,
    produttore ? `${produttore} sito ufficiale prodotti` : `${prodotto} sito ufficiale`,
  ];

  const viste = new Set<string>();
  const query: string[] = [];
  for (const candidato of candidati) {
    if (!candidato) continue;
    const pulita = candidato.replace(/\s+/g, " ").trim().slice(0, 90);
    const chiave = normalizza(pulita);
    if (chiave.length < 4 || viste.has(chiave)) continue;
    viste.add(chiave);
    query.push(pulita);
    if (query.length >= MAX_QUERY) break;
  }
  return query;
}

function creaFonte(
  risultato: RisultatoGrezzo | CandidatoWeb,
  query: string,
  consultataIl: string,
  indice: number,
  riconoscimento: RiconoscimentoAi
): FonteWeb {
  const host = hostDa(risultato.url);
  const { natura, attendibilita, dichiarazione } = classeNatura(
    host,
    risultato.titolo,
    risultato.url,
    riconoscimento.produttore ?? null
  );
  const testo = normalizza(
    `${risultato.titolo} ${risultato.estratto ?? ""} ${risultato.url}`
  );
  const attesi = new Set([
    ...tokenizza(riconoscimento.prodotto),
    ...tokenizza(riconoscimento.denominazioneProposta ?? ""),
    ...tokenizza(riconoscimento.produttore ?? ""),
  ]);
  const comuni = [...attesi].filter((parola) => testo.includes(parola)).length;
  const rilevanza: FonteWeb["rilevanza"] =
    attendibilita === "alta" && comuni > 0
      ? "alta"
      : comuni >= 2
        ? "alta"
        : comuni === 1
          ? "media"
          : "bassa";

  return {
    id: `web:${indice + 1}`,
    titolo: risultato.titolo,
    ente: host,
    url: risultato.url,
    dominio: host,
    natura,
    attendibilita,
    consultataIl,
    dataDocumento:
      "dataDocumento" in risultato ? risultato.dataDocumento ?? null : null,
    estratto: risultato.estratto,
    riferimentoNormativo: null,
    pagineLette: null,
    lettoIntegralmente: false,
    relazione: `Trovata con la query "${query}".`,
    dichiarazione,
    rilevanza,
  };
}

function pesoNatura(natura: NaturaFonteWeb): number {
  const peso: Record<NaturaFonteWeb, number> = {
    ufficiale_eu: 0,
    ufficiale_it: 1,
    regionale: 2,
    certificazione: 3,
    consorzio: 4,
    produttore: 5,
    database_prodotti: 6,
    informativo: 7,
    commerciale: 8,
  };
  return peso[natura];
}

async function completaFonti(
  riconoscimento: RiconoscimentoAi,
  candidati: CandidatoWeb[],
  consultataIl: string,
  opzioni: OpzioniRicercaWeb,
  fetchImpl: typeof fetch,
  timeoutPagina: number,
  signal?: AbortSignal
): Promise<FonteWeb[]> {
  const visti = new Set<string>();
  const fonti: FonteWeb[] = [];

  for (const candidato of candidati) {
    if (!urlPubblico(candidato.url)) continue;
    const chiave = chiaveUrl(candidato.url);
    if (visti.has(chiave)) continue;
    if (!pertinenteAlQuery(candidato, candidato.query, riconoscimento)) continue;
    visti.add(chiave);
    fonti.push(
      creaFonte(candidato, candidato.query, consultataIl, fonti.length, riconoscimento)
    );
  }

  fonti.sort((a, b) => {
    const peso = pesoNatura(a.natura) - pesoNatura(b.natura);
    if (peso !== 0) return peso;
    const rilevanza = { alta: 0, media: 1, bassa: 2 };
    return rilevanza[a.rilevanza ?? "bassa"] - rilevanza[b.rilevanza ?? "bassa"];
  });

  const limiteFonti = opzioni.maxFonti ?? MAX_FONTI;
  const scelte = fonti.slice(0, limiteFonti);

  if (opzioni.leggiPagineUfficiali === false) return scelte;

  const limitePagine = opzioni.maxPagine ?? MAX_PAGINE;
  const conteggioDominio = new Map<string, number>();
  const daLeggere: FonteWeb[] = [];
  for (const fonte of scelte) {
    if (daLeggere.length >= limitePagine) break;
    const conteggio = conteggioDominio.get(fonte.dominio) ?? 0;
    if (conteggio >= MAX_PAGINE_DOMINIO) continue;
    conteggioDominio.set(fonte.dominio, conteggio + 1);
    daLeggere.push(fonte);
  }

  const collegamentiDaSeguire: Array<{ url: string; testo: string; da: FonteWeb }> = [];
  await Promise.all(
    daLeggere.map(async (fonte) => {
      const letta = await leggiPagina(fonte.url, fetchImpl, timeoutPagina, signal);
      if (!letta) return;
      if (letta.titolo && (!fonte.titolo || fonte.titolo === fonte.dominio)) {
        fonte.titolo = letta.titolo;
      }
      fonte.estratto = letta.estratto || fonte.estratto;
      fonte.pagineLette = letta.pagineLette;
      fonte.lettoIntegralmente = letta.completo;
      fonte.metodoLettura = "http";
      fonte.relazione = `Pagina letta (${letta.completo ? "integralmente" : "parzialmente"}) dopo la query "${fonte.relazione.match(/query "([^"]+)"/)?.[1] ?? ""}".`;
      for (const collegamento of letta.collegamenti) {
        collegamentiDaSeguire.push({ ...collegamento, da: fonte });
      }
    })
  );

  // Un solo livello di collegamenti interni pertinenti, entro il budget.
  const paroleChiave = new Set([
    ...tokenizza(riconoscimento.prodotto),
    ...tokenizza(riconoscimento.denominazioneProposta ?? ""),
    ...tokenizza(riconoscimento.produttore ?? ""),
  ]);
  const giaPresenti = new Set(scelte.map((fonte) => chiaveUrl(fonte.url)));
  for (const collegamento of collegamentiDaSeguire) {
    if (scelte.length >= limiteFonti) break;
    const chiave = chiaveUrl(collegamento.url);
    if (giaPresenti.has(chiave) || !urlPubblico(collegamento.url)) continue;
    const pertinente = [...paroleChiave].some((parola) =>
      normalizza(`${collegamento.testo} ${collegamento.url}`).includes(parola)
    );
    if (!pertinente) continue;

    const letta = await leggiPagina(collegamento.url, fetchImpl, timeoutPagina, signal);
    if (!letta) continue;
    giaPresenti.add(chiave);
    const host = hostDa(collegamento.url);
    const { natura, attendibilita, dichiarazione } = classeNatura(
      host,
      collegamento.testo,
      collegamento.url,
      riconoscimento.produttore ?? null
    );
    scelte.push({
      id: `web:${scelte.length + 1}`,
      titolo: letta.titolo ?? collegamento.testo,
      ente: host,
      url: collegamento.url,
      dominio: host,
      natura,
      attendibilita,
      consultataIl,
      dataDocumento: null,
      estratto: letta.estratto,
      riferimentoNormativo: null,
      pagineLette: letta.pagineLette,
      lettoIntegralmente: letta.completo,
      metodoLettura: "http",
      relazione: `Collegamento pertinente seguito dalla pagina ${collegamento.da.url}.`,
      dichiarazione,
      rilevanza: "media",
    });
  }

  // Dopo la lettura, una pagina generica (un omonimo, un comune) non resta
  // una fonte solo perché lo snippet contiene il prodotto o il territorio.
  // Se l'etichetta indica un produttore, una fonte non istituzionale deve
  // citarlo: altrimenti non è una fonte su quel produttore.
  const paroleProduttore = tokenizza(riconoscimento.produttore ?? "");
  return scelte.filter((fonte) => {
    const ufficiale =
      fonte.natura === "ufficiale_eu" ||
      fonte.natura === "ufficiale_it" ||
      fonte.natura === "regionale" ||
      fonte.natura === "certificazione" ||
      fonte.natura === "consorzio";
    const testo = `${fonte.titolo} ${fonte.estratto ?? ""}`;
    const haProd = haProdottoInTesto(testo, riconoscimento);
    const haProduttore = [...paroleProduttore].some((parola) =>
      normalizza(testo).includes(parola)
    );

    if (paroleProduttore.size > 0 && !ufficiale && !haProduttore) return false;
    // Anche una pagina istituzionale non leggibile resta un risultato utile,
    // ma non viene presentata come documento letto.
    if (fonte.pagineLette === null && !fonte.lettoIntegralmente) {
      return ufficiale || haProd;
    }
    return ufficiale || haProd;
  });
}

function statoWeb(
  stato: SintesiVerificaWeb["stato"],
  testo: string,
  fonti: Array<{ url: string }>
): SintesiVerificaWeb {
  return {
    stato,
    testo,
    fonti: [...new Set(fonti.map((fonte) => fonte.url))].slice(0, 6),
  };
}

/**
 * Sintesi deterministica delle cinque verifiche. Non usa il testo generato
 * dal modello: ogni affermazione deriva da una pagina letta o dalla prova
 * ufficiale eAmbrosia. La confezione resta sempre non verificabile.
 */
export function sintetizzaFontiWeb(
  riconoscimento: RiconoscimentoAi,
  fonti: readonly FonteWeb[],
  proveUfficiali: readonly ProvaDocumentale[] = []
): SintesiFontiWeb {
  const produttore = riconoscimento.produttore?.trim() || null;
  const denominazione = riconoscimento.denominazioneProposta?.trim() || null;
  const prodotto = riconoscimento.prodotto.trim();

  const testoFonte = (fonte: FonteWeb) =>
    normalizza(`${fonte.titolo} ${fonte.estratto ?? ""} ${fonte.url}`);

  const fontiDenominazione = fonti.filter(
    (fonte) =>
      denominazione &&
      copre(testoFonte(fonte), denominazione) &&
      /dop|igp|stg|registrat|denominazione/i.test(testoFonte(fonte))
  );
  const fontiProdotto = fonti.filter((fonte) => copre(testoFonte(fonte), prodotto));
  const paroleProduttore = produttore
    ? paroleDistintiveProduttore(produttore)
    : [];
  const fontiProduttore =
    paroleProduttore.length > 0
      ? fonti.filter((fonte) =>
          paroleProduttore.some((parola) => testoFonte(fonte).includes(parola))
        )
      : [];
  const fontiProduttoreCollegate = fontiProduttore.filter(
    (fonte) =>
      (prodotto && copre(testoFonte(fonte), prodotto)) ||
      (denominazione && copre(testoFonte(fonte), denominazione)) ||
      /dop|igp|salum|produz|prodott/i.test(testoFonte(fonte))
  );
  const fontiIndipendenti = fontiProduttoreCollegate.filter(
    (fonte) => fonte.dichiarazione === "indipendente"
  );
  const fontiAziendali = fontiProduttoreCollegate.filter(
    (fonte) => fonte.dichiarazione === "aziendale"
  );

  const prova = proveUfficiali.find(
    (voce) =>
      voce.tipo === "ufficiale" &&
      voce.stato === "registrata" &&
      (!denominazione ||
        copre(normalizza(voce.denominazione), denominazione) ||
        copre(normalizza(denominazione), voce.denominazione))
  );

  const denominazioneSintesi: SintesiVerificaWeb = prova
    ? statoWeb(
        "registrata",
        `Denominazione registrata nel registro ufficiale eAmbrosia (${prova.denominazione}). La registrazione riguarda la denominazione, non la confezione.`,
        [prova, ...fontiDenominazione]
      )
    : fontiDenominazione.some(
          (fonte) =>
            fonte.natura === "ufficiale_eu" ||
            fonte.natura === "ufficiale_it" ||
            fonte.natura === "regionale"
        )
      ? statoWeb(
          "menzionata",
          "La denominazione è citata da una fonte istituzionale letta, ma la registrazione non è stata confermata dal registro ufficiale in questa analisi.",
          fontiDenominazione
        )
      : statoWeb(
          "non_confermata",
          "Le fonti lette non confermano la registrazione della denominazione. L'assenza di riscontro non dimostra che la denominazione non esista.",
          fontiDenominazione
        );

  const produttoreSintesi: SintesiVerificaWeb =
    fontiIndipendenti.length > 0
      ? statoWeb(
          "supportata",
          `Il collegamento produttore-denominazione è sostenuto da ${fontiIndipendenti.length} fonte/i indipendente/i letta/e. Resta distinto dall'autenticità della confezione.`,
          [...fontiIndipendenti, ...fontiAziendali]
        )
      : fontiAziendali.length > 0
        ? statoWeb(
            "dichiarata",
            "Il sito del produttore dichiara il collegamento con il prodotto/denominazione. È una dichiarazione aziendale, non una verifica indipendente.",
            fontiAziendali
          )
        : statoWeb(
            "non_confermata",
            "Nessuna fonte letta collega in modo esplicito il produttore alla denominazione. L'assenza di riscontro non è una prova contraria.",
            fontiProduttore
          );

  const marchioSintesi: SintesiVerificaWeb = produttore
    ? fontiProduttore.length > 0
      ? statoWeb(
          "menzionata",
          `Il marchio/produttore "${produttore}" è citato dalle fonti lette; non è il nome della denominazione protetta.`,
          fontiProduttore
        )
      : statoWeb(
          "non_confermata",
          `Il marchio/produttore "${produttore}" non è stato trovato nelle fonti lette.`,
          []
        )
    : statoWeb(
        "non_verificabile",
        "Nessun marchio o produttore è stato letto in etichetta: la ricerca non può attribuire il prodotto a un'azienda.",
        []
      );

  const prodottoSintesi: SintesiVerificaWeb =
    fontiProdotto.length > 0
      ? statoWeb(
          "menzionata",
          `Il prodotto "${prodotto}" è citato da ${fontiProdotto.length} fonte/i letta/e.`,
          fontiProdotto
        )
      : statoWeb(
          "non_confermata",
          `Il prodotto "${prodotto}" non compare nelle pagine lette. La ricerca non è una prova di assenza.`,
          []
        );

  return {
    denominazione: denominazioneSintesi,
    produttore: produttoreSintesi,
    marchio: marchioSintesi,
    prodotto: prodottoSintesi,
    confezione: {
      stato: "non_verificabile",
      testo:
        "La ricerca web non autentica la singola confezione, il lotto o il produttore. Servono etichetta, identificativi e certificazione dell'organismo di controllo: nessuna pagina può sostituirli.",
    },
  };
}

export function creaRicercaWeb(opzioni: OpzioniRicercaWeb = {}): ProviderRicercaWeb {
  const fetchImpl = opzioni.fetchImpl ?? fetch;
  const adesso = opzioni.adesso ?? (() => new Date());
  const timeoutQuery = opzioni.timeoutQueryMs ?? TIMEOUT_QUERY_MS;
  const timeoutPagina = opzioni.timeoutPaginaMs ?? TIMEOUT_PAGINA_MS;

  return {
    nome: "web",
    async cerca({ riconoscimento, signal, candidati, query: queryForzate }) {
      const avvio = Date.now();
      const data = adesso();
      const consultataIl = data.toISOString().slice(0, 10);
      const queryCandidates = queryForzate?.length
        ? queryForzate
        : costruisciQuery(riconoscimento);

      if (!candidati?.length && queryCandidates.length === 0) {
        return {
          stato: "non_eseguita",
          consultataIl,
          query: queryCandidates,
          fonti: [],
          messaggio: "Nessun nome utile per una ricerca web.",
          durataMs: 0,
        };
      }

      let candidatiFinali: CandidatoWeb[] = candidati ?? [];
      let errori = 0;
      const motori = new Set<string>();

      if (!candidati?.length) {
        const esiti = await Promise.all(
          queryCandidates.map((voce) =>
            cercaQuery(voce, fetchImpl, timeoutQuery, data.getTime(), signal)
          )
        );
        errori = esiti.filter((esito) => esito.errore).length;
        for (let indice = 0; indice < esiti.length; indice += 1) {
          const esito = esiti[indice];
          if (esito.motore) motori.add(esito.motore);
          for (const risultato of esito.risultati) {
            const query = queryCandidates[indice] ?? queryCandidates[0] ?? "";
            if (!pertinenteAlQuery(risultato, query, riconoscimento)) continue;
            candidatiFinali.push({ ...risultato, query });
          }
        }
      }

      if (!candidati?.length && errori === queryCandidates.length) {
        return {
          stato: "non_disponibile",
          consultataIl,
          query: queryCandidates,
          fonti: [],
          messaggio:
            "La ricerca web non è stata completata: nessun motore ha risposto. L'assenza di risultati non dimostra l'assenza di fonti.",
          durataMs: Date.now() - avvio,
          motore: "nessuno",
        };
      }

      const fonti = await completaFonti(
        riconoscimento,
        candidatiFinali,
        consultataIl,
        opzioni,
        fetchImpl,
        timeoutPagina,
        signal
      );

      return {
        stato: "ok",
        consultataIl,
        query: queryCandidates,
        fonti,
        messaggio:
          fonti.length === 0
            ? "Nessuna fonte pertinente è stata reperita dopo query alternative: non è una prova di assenza di fonti."
            : errori > 0
              ? "Alcune ricerche web non hanno risposto: sono mostrate le fonti recuperate."
              : null,
        durataMs: Date.now() - avvio,
        motore: candidati?.length
          ? "google_grounding"
          : motori.size > 0
            ? [...motori].join("+")
            : "motori_keyless",
        sintesi: sintetizzaFontiWeb(riconoscimento, fonti),
      };
    },
  };
}

export type { RisultatoGrezzo };
export type { FonteWeb };
