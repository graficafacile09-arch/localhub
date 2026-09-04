import type { FonteNotizie } from "./types";

/**
 * FONTI — whitelist statica dell'aggregatore.
 *
 * SOLO queste fonti sono acquisibili: nessun URL arbitrario proveniente
 * dall'utente viene mai accettato (sicurezza SSRF).
 * - FONTI_V1: fonti istituzionali/pubbliche (seed migration
 *   20260903_notizie_aggregatore.sql). V1 escludeva deliberatamente le
 *   testate giornalistiche.
 * - FONTI_DISCOVERY_V2: Google News RSS (seed migration
 *   20260903_notizie_google_discovery.sql), di tipo discovery (`scoperta`):
 *   trovano notizie di testate giornalistiche tramite ricerca. Nessun URL
 *   arbitrario viene mai accettato: anche qui la whitelist è statica.
 *
 * Gli elenchi rispecchiano i seed delle migration e vengono usati come
 * riferimento canonico da acquisitori, filtro e test.
 */

/** Identificativi stabili delle fonti (uguali al seed delle migration). */
export const FONTI_ID = {
  COMUNE: "a0000000-0000-4000-8000-000000000001",
  PROVINCIA: "a0000000-0000-4000-8000-000000000002",
  REGIONE: "a0000000-0000-4000-8000-000000000003",
  POLLINO: "a0000000-0000-4000-8000-000000000004",
  PROTEZIONE_CIVILE: "a0000000-0000-4000-8000-000000000005",
  GOOGLE_NEWS_CV: "a0000000-0000-4000-8000-000000000006",
  GOOGLE_NEWS_COMUNE: "a0000000-0000-4000-8000-000000000007",
} as const;

export const FONTI_V1: FonteNotizie[] = [
  {
    id: FONTI_ID.COMUNE,
    nome: "Comune di Castrovillari",
    tipo: "html",
    urlFeed: null,
    urlLista: "https://comune.castrovillari.cs.it/novita",
    urlBase: "https://comune.castrovillari.cs.it",
    categoriaDefault: "Comune",
    attiva: true,
    scoperta: false,
    frequenzaMinuti: 720,
  },
  {
    id: FONTI_ID.PROVINCIA,
    nome: "Provincia di Cosenza",
    tipo: "rss",
    urlFeed: "https://www.provincia.cs.it/portale/rss2.0.xml",
    urlLista: "https://www.provincia.cs.it/portale/informazione/notizie/",
    urlBase: "https://www.provincia.cs.it",
    categoriaDefault: "Istituzioni",
    attiva: true,
    scoperta: false,
    frequenzaMinuti: 360,
  },
  {
    id: FONTI_ID.REGIONE,
    nome: "Regione Calabria",
    tipo: "rss",
    urlFeed: "https://www.regione.calabria.it/feed/",
    urlLista: null,
    urlBase: "https://www.regione.calabria.it",
    categoriaDefault: "Istituzioni",
    attiva: true,
    scoperta: false,
    frequenzaMinuti: 60,
  },
  {
    id: FONTI_ID.POLLINO,
    nome: "Parco Nazionale del Pollino",
    tipo: "rss",
    urlFeed:
      "https://parconazionalepollino.it/notizie-e-iniziative/notizie-dall-ente?format=feed&type=rss",
    urlLista: null,
    urlBase: "https://parconazionalepollino.it",
    categoriaDefault: "Territorio",
    attiva: true,
    scoperta: false,
    frequenzaMinuti: 720,
  },
  {
    id: FONTI_ID.PROTEZIONE_CIVILE,
    nome: "Protezione Civile Calabria",
    tipo: "rss",
    urlFeed: "https://www.protezionecivilecalabria.it/?feed=rss2",
    urlLista: null,
    urlBase: "https://www.protezionecivilecalabria.it",
    categoriaDefault: "Protezione civile",
    attiva: true,
    scoperta: false,
    frequenzaMinuti: 720,
  },
];

/**
 * Fonti di DISCOVERY V2 (Google News RSS) — speculare al seed della
 * migration 20260903_notizie_google_discovery.sql. url_base è il dominio
 * Google: fa entrare news.google.com nella whitelist SSRF in modo coerente
 * con l'architettura attuale (la whitelist è sempre derivata da url_base).
 */
export const FONTI_DISCOVERY_V2: FonteNotizie[] = [
  {
    id: FONTI_ID.GOOGLE_NEWS_CV,
    nome: "Google News · Castrovillari",
    tipo: "rss",
    urlFeed:
      "https://news.google.com/rss/search?q=%22Castrovillari%22&hl=it&gl=IT&ceid=IT:it",
    urlLista: null,
    urlBase: "https://news.google.com",
    categoriaDefault: "Territorio",
    attiva: true,
    frequenzaMinuti: 60,
    scoperta: true,
  },
  {
    id: FONTI_ID.GOOGLE_NEWS_COMUNE,
    nome: "Google News · Castrovillari Comune",
    tipo: "rss",
    urlFeed:
      "https://news.google.com/rss/search?q=Castrovillari%20Comune&hl=it&gl=IT&ceid=IT:it",
    urlLista: null,
    urlBase: "https://news.google.com",
    categoriaDefault: "Comune",
    attiva: true,
    frequenzaMinuti: 60,
    scoperta: true,
  },
];

/** Tutte le fonti note (V1 + discovery V2). */
export const FONTI_AGGIORNAMENTO: FonteNotizie[] = [
  ...FONTI_V1,
  ...FONTI_DISCOVERY_V2,
];

/** Host consentiti per il fetch (whitelist SSRF, derivata da url_base). */
export const HOST_WHITELIST: ReadonlySet<string> = new Set(
  FONTI_AGGIORNAMENTO.map((f) => {
    try {
      return new URL(f.urlBase).hostname;
    } catch {
      return "";
    }
  }).filter(Boolean)
);

/** Cerca una fonte (V1 o discovery) per id; undefined se non è nota. */
export function getFonteV1(id: string): FonteNotizie | undefined {
  return FONTI_AGGIORNAMENTO.find((f) => f.id === id);
}

/**
 * Converte una riga di notizie_fonti (dal DB) nella configurazione usata
 * dagli acquisitori. I valori del DB hanno la precedenza; se un campo
 * essenziale manca si ripiega sulla whitelist statica.
 */
export function fonteDaDb(riga: {
  id: string;
  nome: string;
  tipo: string;
  url_feed: string | null;
  url_lista: string | null;
  url_base: string | null;
  categoria_default: string | null;
  attiva: boolean;
  frequenza_minuti: number;
  scoperta?: boolean;
  ultima_esecuzione?: string | null;
}): FonteNotizie {
  const statica = FONTI_AGGIORNAMENTO.find((f) => f.id === riga.id);
  return {
    id: riga.id,
    nome: riga.nome || statica?.nome || "Fonte",
    tipo: riga.tipo === "html" ? "html" : "rss",
    urlFeed: riga.url_feed ?? statica?.urlFeed ?? null,
    urlLista: riga.url_lista ?? statica?.urlLista ?? null,
    urlBase:
      riga.url_base ?? statica?.urlBase ?? `https://${new URL(riga.url_feed ?? "").hostname}`,
    categoriaDefault: (riga.categoria_default as FonteNotizie["categoriaDefault"]) ??
      statica?.categoriaDefault ?? "Istituzioni",
    attiva: riga.attiva,
    frequenzaMinuti: riga.frequenza_minuti,
    scoperta: riga.scoperta ?? statica?.scoperta ?? false,
    ultimaEsecuzione: riga.ultima_esecuzione ?? null,
  };
}
