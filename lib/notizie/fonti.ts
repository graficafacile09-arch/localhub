import type { FonteNotizie } from "./types";

/**
 * FONTI V1 — whitelist statica dell'aggregatore.
 *
 * SOLO queste fonti istituzionali/pubbliche sono acquisibili: nessun URL
 * arbitrario proveniente dall'utente viene mai accettato (sicurezza SSRF).
 * L'elenco rispecchia il seed della migration 20260903_notizie_aggregatore.sql
 * e viene usato come riferimento canonico da acquisitori, filtro e test.
 *
 * V1 ESCLUDE deliberatamente: testate giornalistiche (ABM Report, LaC News24,
 * Paese24, Corriere della Calabria, …) e fonti che richiedono autorizzazione.
 */

/** Identificativi stabili delle fonti V1 (uguali al seed della migration). */
export const FONTI_ID = {
  COMUNE: "a0000000-0000-4000-8000-000000000001",
  PROVINCIA: "a0000000-0000-4000-8000-000000000002",
  REGIONE: "a0000000-0000-4000-8000-000000000003",
  POLLINO: "a0000000-0000-4000-8000-000000000004",
  PROTEZIONE_CIVILE: "a0000000-0000-4000-8000-000000000005",
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
    frequenzaMinuti: 720,
  },
];

/** Host consentiti per il fetch (whitelist SSRF, derivata da url_base). */
export const HOST_WHITELIST: ReadonlySet<string> = new Set(
  FONTI_V1.map((f) => {
    try {
      return new URL(f.urlBase).hostname;
    } catch {
      return "";
    }
  }).filter(Boolean)
);

/** Cerca una fonte V1 per id; undefined se non è una fonte nota. */
export function getFonteV1(id: string): FonteNotizie | undefined {
  return FONTI_V1.find((f) => f.id === id);
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
  ultima_esecuzione?: string | null;
}): FonteNotizie {
  const statica = FONTI_V1.find((f) => f.id === riga.id);
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
    ultimaEsecuzione: riga.ultima_esecuzione ?? null,
  };
}