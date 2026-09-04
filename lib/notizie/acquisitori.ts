import { XMLParser } from "fast-xml-parser";
import type { FonteNotizie } from "./types";

/**
 * ACQUISITORI — prelevano le voci dalle fonti V1.
 *
 * - HTTP: SOLO https, timeout 8s (AbortController), User-Agent esplicito,
 *   limite body ~1MB, redirect consentiti SOLO verso host whitelistati.
 * - RSS/XML: parser affidabile (fast-xml-parser), decodifica del charset
 *   dichiarato (alcuni feed sono iso-8859-1, non UTF-8).
 * - HTML: parser dedicato per la piattaforma "Design Comuni" (Comune) e
 *   per il portale ColdFusion (Provincia, fallback).
 * - BEST-EFFORT: una fonte irraggiungibile/rotta restituisce [] senza mai
 *   lanciare eccezioni fuori dai casi di programmazione.
 */

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024; // ~1 MB
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 IncittaNotizie/1.0";

/*
 * Google News RSS (fonti discovery) può rispondere HTTP 200 con un channel
 * VALIDO ma SENZA item (rate limit/cache intermittente osservata in analisi).
 * Un feed vuoto non va interpretato come "nessuna notizia": si ritenta con
 * backoff prima di arrendersi (best-effort, come tutte le altre fonti).
 */
const GOOGLE_TENTATIVI_MAX = 4;
const GOOGLE_BACKOFF_MS_BASE = 1500;

/** Pausa tra un tentativo e il successivo (retry con backoff). */
function attesa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Voce acquisita grezza da una fonte, prima della normalizzazione. */
export interface VoceAcquisita {
  title: string;
  /** URL assoluto della notizia originale. */
  url: string;
  excerpt: string | null;
  /** Data ISO o null se non disponibile. */
  data: string | null;
  /** Identificativo stabile presso la fonte (guid/id) o null. */
  externalId: string | null;
  /**
   * Nome della testata originale (solo item Google News discovery, dal tag
   * RSS `<source>`). Le fonti V1 non lo valorizzano: si usa fonte.nome.
   */
  source?: string | null;
}

/** Errore interno non fatale (fonte non raggiungibile, formato inatteso). */
export class ErroreFonte extends Error {}

/** Estrae il charset dalla dichiarazione XML o dal Content-Type. */
function estraiCharset(xml: string, contentType: string | null): string {
  const m = xml.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
  if (m) return m[1].toLowerCase();
  const ct = contentType?.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  return ct ?? "utf-8";
}

/**
 * Scarica una risorsa in modo sicuro. Consente SOLO:
 * - protocollo https;
 * - host dentro l'allowlist passata (whitelist SSRF);
 * - redirect verso host nella stessa whitelist;
 * - risposta ≤ 1 MB.
 * MAI throw: in ogni caso di errore lancia ErroreFonte con messaggio.
 */
export async function scaricaTesto(
  url: string,
  hostConsentiti: ReadonlySet<string>,
  soloTesto = true
): Promise<{ testo: string; contentType: string | null; urlFinale: string }> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new ErroreFonte(`URL non valido: ${url}`);
  }
  if (target.protocol !== "https:") {
    throw new ErroreFonte(`protocollo non https: ${target.protocol}`);
  }
  if (!hostConsentiti.has(target.hostname)) {
    throw new ErroreFonte(`host non autorizzato: ${target.hostname}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(target, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store",
    });

    // Segue al massimo 3 redirect, solo verso host whitelistati.
    for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
      const loc = res.headers.get("location");
      if (!loc) throw new ErroreFonte(`redirect senza location (${res.status})`);
      const next = new URL(loc, target);
      if (next.protocol !== "https:" || !hostConsentiti.has(next.hostname)) {
        throw new ErroreFonte(`redirect verso host non autorizzato: ${next.hostname}`);
      }
      res = await fetch(next, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
      });
    }

    if (!res.ok) {
      throw new ErroreFonte(`HTTP ${res.status} da ${target.hostname}`);
    }
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BYTES) {
      throw new ErroreFonte(`risposta troppo grande (${contentLength} byte)`);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      throw new ErroreFonte(`risposta troppo grande (${buf.byteLength} byte)`);
    }

    const contentType = res.headers.get("content-type");
    let testo: string;
    if (soloTesto) {
      // Decodifica rispettando il charset dichiarato (UTF-8 di default).
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      const charset = estraiCharset(raw, contentType);
      testo =
        charset === "utf-8" || charset === "utf8"
          ? raw
          : new TextDecoder(charset, { fatal: false }).decode(buf);
    } else {
      testo = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    }

    return { testo, contentType, urlFinale: res.url || target.href };
  } catch (err) {
    if (err instanceof ErroreFonte) throw err;
    const motivo =
      (err as Error)?.name === "AbortError"
        ? `timeout dopo ${TIMEOUT_MS}ms`
        : ((err as Error)?.message ?? "errore sconosciuto");
    throw new ErroreFonte(`fetch fallito: ${motivo}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Pulisce un testo HTML in un excerpt breve e leggibile. */
export function estraiTestoPulito(html: string | null | undefined, max = 320): string | null {
  if (!html) return null;
  const senzaTag = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!senzaTag) return null;
  return senzaTag.length > max ? `${senzaTag.slice(0, max).trimEnd()}…` : senzaTag;
}

/** Normalizza una data testuale (RFC822/RSS o italiana) in ISO, o null. */
export function normalizzaData(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  // Formati italiani: "23 mag 2026", "03 settembre 2026", "23/05/2026".
  const mesiIt: Record<string, number> = {
    gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5, lug: 6, ago: 7,
    set: 8, ott: 9, nov: 10, dic: 11,
    gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
    luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
  };
  const mIt = value.toLowerCase().match(
    /(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)[a-z]*\s+(\d{4})/
  );
  if (mIt) {
    // Date-only: Date.UTC evita lo sfasamento di giorno dovuto al fuso locale.
    const d2 = new Date(Date.UTC(Number(mIt[3]), mesiIt[mIt[2]], Number(mIt[1])));
    if (!Number.isNaN(d2.getTime())) return d2.toISOString();
  }
  const mNum = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mNum) {
    const d3 = new Date(Date.UTC(Number(mNum[3]), Number(mNum[2]) - 1, Number(mNum[1])));
    if (!Number.isNaN(d3.getTime())) return d3.toISOString();
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   PARSER RSS / XML
   ═══════════════════════════════════════════════════════════════════════ */

/** Parsa un feed RSS 2.0 (o Atom di base) in voci acquisite. */
export function parseRss(
  xml: string,
  urlBase: string
): VoceAcquisita[] {
  let parsed: unknown;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      removeNSPrefix: true,
      isArray: (name) => name === "item" || name === "entry",
      trimValues: true,
      processEntities: true,
      htmlEntities: true,
    });
    parsed = parser.parse(xml);
  } catch {
    throw new ErroreFonte("XML non valido");
  }

  const root = (parsed as { rss?: { channel?: unknown } })?.rss?.channel ??
    (parsed as { feed?: unknown })?.feed;
  const items = Array.isArray((root as { item?: unknown[] })?.item)
    ? ((root as { item: unknown[] }).item)
    : Array.isArray((root as { entry?: unknown[] })?.entry)
      ? ((root as { entry: unknown[] }).entry)
      : [];

  const voci: VoceAcquisita[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const title = String(it.title ?? "").trim();
    let link = String(it.link ?? "").trim();
    if (!title && !link) continue;
    if (!/^https?:/i.test(link)) link = new URL(link, urlBase).href;

    const guid =
      typeof it.guid === "string"
        ? it.guid.trim()
        : (it.guid as { "#text"?: string })?.["#text"]?.trim();
    const dataRaw = String(it.pubDate ?? it["dc:date"] ?? it.updated ?? "").trim();
    const desc = String(it.description ?? it.summary ?? "").trim();

    voci.push({
      title: title || (estraiTestoPulito(desc) ?? link),
      url: link,
      excerpt: estraiTestoPulito(desc),
      data: normalizzaData(dataRaw),
      externalId: guid || link,
    });
  }
  return voci;
}

/* ═══════════════════════════════════════════════════════════════════════
   PARSER GOOGLE NEWS RSS — fonti di discovery (V2)
   ═══════════════════════════════════════════════════════════════════════ */

/** Rimuove dal link Google News il parametro di navigazione `oc` (es. ?oc=5). */
export function linkGooglePulito(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname !== "news.google.com") return raw;
    u.searchParams.delete("oc");
    u.hash = "";
    return u.href;
  } catch {
    // Best-effort: se l'URL non è parsabile toglie solo il suffisso noto.
    return raw.replace(/\?oc=\d+$/, "");
  }
}

/**
 * Rimuove dal titolo Google News il suffisso ` - <nome testata>` (il feed
 * lo appende a quasi tutti i titoli). Il confronto è case-insensitive e
 * SOLO se la coda corrisponde davvero al `<source>` dell'item.
 */
export function titoloSenzaSuffissoFonte(
  title: string,
  sourceName: string | null | undefined
): string {
  const t = title.trim();
  const fonte = sourceName?.trim();
  if (!fonte) return t;
  const suffisso = ` - ${fonte}`;
  if (t.length > suffisso.length && t.toLowerCase().endsWith(suffisso.toLowerCase())) {
    return t.slice(0, -suffisso.length).trim();
  }
  return t;
}

/**
 * Parsa un feed RSS di Google News in voci acquisite.
 *
 * Per ogni item:
 * - title: ripulito dal suffisso finale " - <testata>" (il feed lo appende);
 * - source: nome della testata originale (tag `<source>`);
 * - url: link Google News pulito da `?oc=5` (redirector verso l'articolo);
 * - excerpt: NULL (la `<description>` Google duplica solo titolo+fonte);
 * - externalId: il `<guid>` (token stabile dell'articolo);
 * - data: dal `<pubDate>` (RFC822).
 */
export function parseGoogleNewsRss(xml: string): VoceAcquisita[] {
  let parsed: unknown;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      removeNSPrefix: true,
      isArray: (name) => name === "item" || name === "entry",
      trimValues: true,
      processEntities: true,
      htmlEntities: true,
    });
    parsed = parser.parse(xml);
  } catch {
    throw new ErroreFonte("XML Google News non valido");
  }

  const root = (parsed as { rss?: { channel?: unknown } })?.rss?.channel;
  const items = Array.isArray((root as { item?: unknown[] })?.item)
    ? ((root as { item: unknown[] }).item)
    : [];

  const voci: VoceAcquisita[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const titleRaw = String(it.title ?? "").trim();
    const linkRaw = String(it.link ?? "").trim();
    if (!titleRaw && !linkRaw) continue;

    // Nome della testata dal tag <source url="...">Nome</source>.
    const srcEl = it.source as
      | string
      | { "#text"?: string; "@_url"?: string }
      | undefined;
    const sourceName =
      typeof srcEl === "string"
        ? srcEl.trim()
        : String(srcEl?.["#text"] ?? "").trim() || null;

    const title = titoloSenzaSuffissoFonte(titleRaw, sourceName) || titleRaw;
    const url = linkRaw ? linkGooglePulito(linkRaw) : "";
    if (!title && !url) continue;

    const guid =
      typeof it.guid === "string"
        ? it.guid.trim()
        : (it.guid as { "#text"?: string })?.["#text"]?.trim();
    const dataRaw = String(it.pubDate ?? "").trim();

    voci.push({
      title,
      url: url || linkRaw,
      excerpt: null, // Google News non fornisce un riassunto: solo titolo+fonte.
      data: normalizzaData(dataRaw),
      externalId: guid || url || null,
      source: sourceName,
    });
  }
  return voci;
}

/* ═══════════════════════════════════════════════════════════════════════
   PARSER HTML — Comune di Castrovillari (piattaforma "Design Comuni")
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Estrae le notizie dalla pagina /novita del Comune. La piattaforma
 * "Design Comuni" (Bootstrap Italia) usa card con:
 *   <div class="card-wrapper ... cmp-list-card-img cmp-list-card-img-hr">
 *     <div class="card no-after rounded"><div class="card-body">
 *       <span class="...">Novità</span>
 *       <span class="data">23 mag 2026</span>
 *       <a href="https://comune.castrovillari.cs.it/notizie/ID/slug" title="...">
 *         <h3 class="text-break">Titolo</h3>
 *       </a>
 *       <p class="cmp-list-card-img__body-description ...">Descrizione</p>
 */
export function parseComuneNovita(html: string, urlBase: string): VoceAcquisita[] {
  const blocchi = html.split(
    'class="card-wrapper border border-light rounded shadow-sm cmp-list-card-img cmp-list-card-img-hr"'
  );
  blocchi.shift();

  const voci: VoceAcquisita[] = [];
  for (const blocco of blocchi) {
    const linkMatch = blocco.match(/<a\s+href="([^"]+)"[^>]*title="[^"]*">/);
    const url = linkMatch?.[1];
    if (!url || !/^https?:/i.test(url)) continue;

    const titoloMatch = blocco.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const titolo = titoloMatch?.[1]
      ?.replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!titolo) continue;

    const dataMatch = blocco.match(/<span class="data">([^<]+)<\/span>/);
    const descMatch = blocco.match(
      /<p class="cmp-list-card-img__body-description[^"]*">([\s\S]*?)<\/p>/
    );

    voci.push({
      title: titolo,
      url: new URL(url, urlBase).href,
      excerpt: estraiTestoPulito(descMatch?.[1] ?? null),
      data: normalizzaData(dataMatch?.[1]?.trim() ?? null),
      externalId: url,
    });
  }
  return voci;
}

/* ═══════════════════════════════════════════════════════════════════════
   PARSER HTML — Provincia di Cosenza (fallback, portale ColdFusion)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Fallback HTML per la Provincia: estrae i link `view.cfm?ID` della pagina
 * notizie. Usato SOLO se il feed RSS non è raggiungibile o è vuoto.
 */
export function parseProvinciaNotizie(html: string, urlBase: string): VoceAcquisita[] {
  const voci: VoceAcquisita[] = [];
  const regex =
    /<a\s+href="([^"]*view\.cfm\?(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const url = m[1];
    const id = m[2];
    const titolo = m[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!titolo || voci.some((v) => v.externalId === id)) continue;
    voci.push({
      title: titolo,
      url: new URL(url, urlBase).href,
      excerpt: null,
      data: null,
      externalId: id,
    });
  }
  return voci;
}

/* ═══════════════════════════════════════════════════════════════════════
   DISPACCIATORE PER FONTE
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Acquisisce una fonte Google News (discovery). Ritenta con backoff sia gli
 * errori di rete sia il caso HTTP 200 con feed vuoto (rate limit osservato).
 * MAI throw: dopo i tentativi ritorna [] (best-effort, come le altre fonti).
 */
export async function acquisisciGoogleNews(
  fonte: FonteNotizie,
  hostConsentiti: ReadonlySet<string>
): Promise<VoceAcquisita[]> {
  if (!fonte.urlFeed) return [];

  for (let tentativo = 1; tentativo <= GOOGLE_TENTATIVI_MAX; tentativo++) {
    try {
      const { testo } = await scaricaTesto(fonte.urlFeed, hostConsentiti);
      const voci = parseGoogleNewsRss(testo);
      // Feed HTTP 200 ma SENZA item: ritenta (non significa "nessuna notizia").
      if (voci.length > 0) return voci;
      console.warn(
        `[notizie] ${fonte.nome}: feed valido ma vuoto (tentativo ${tentativo}/${GOOGLE_TENTATIVI_MAX}), retry`
      );
    } catch (err) {
      console.error(
        `[notizie] ${fonte.nome}: fetch fallito (tentativo ${tentativo}/${GOOGLE_TENTATIVI_MAX}):`,
        (err as Error)?.message
      );
    }
    if (tentativo < GOOGLE_TENTATIVI_MAX) {
      // Backoff esponenziale, con tetto per non allungare troppo il job.
      const ms = Math.min(
        GOOGLE_BACKOFF_MS_BASE * 2 ** (tentativo - 1),
        10_000
      );
      await attesa(ms);
    }
  }
  return [];
}

/**
 * Acquisisce le voci di una fonte. Per le fonti RSS con url_lista (es.
 * Provincia) tenta prima il feed e in caso di errore/vuoto ripiega
 * sull'HTML. Le fonti di discovery (Google News) hanno un percorso dedicato
 * con retry/backoff. MAI throw: ritorna [] se la fonte è irraggiungibile.
 */
export async function acquisisciFonte(
  fonte: FonteNotizie,
  hostConsentiti: ReadonlySet<string>
): Promise<VoceAcquisita[]> {
  // Fonti discovery V2 (Google News): feed RSS con retry sui vuoti.
  if (fonte.scoperta) {
    return acquisisciGoogleNews(fonte, hostConsentiti);
  }

  const base = fonte.urlBase;

  if (fonte.tipo === "rss") {
    if (!fonte.urlFeed) return [];
    try {
      const { testo } = await scaricaTesto(fonte.urlFeed, hostConsentiti);
      const voci = parseRss(testo, base);
      if (voci.length > 0) return voci;
    } catch (err) {
      console.error(`[notizie] feed ${fonte.nome} non disponibile:`, (err as Error)?.message);
    }
    // Fallback HTML (es. Provincia) se configurato.
    if (fonte.urlLista) {
      try {
        const { testo } = await scaricaTesto(fonte.urlLista, hostConsentiti);
        const voci = parseProvinciaNotizie(testo, base);
        if (voci.length > 0) return voci;
      } catch (err) {
        console.error(`[notizie] fallback HTML ${fonte.nome} fallito:`, (err as Error)?.message);
      }
    }
    return [];
  }

  // tipo === 'html' → pagina lista (Comune).
  if (!fonte.urlLista) return [];
  try {
    const { testo } = await scaricaTesto(fonte.urlLista, hostConsentiti);
    return parseComuneNovita(testo, base);
  } catch (err) {
    console.error(`[notizie] pagina ${fonte.nome} non disponibile:`, (err as Error)?.message);
    return [];
  }
}