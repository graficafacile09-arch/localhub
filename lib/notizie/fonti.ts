import type { FonteNotizie } from "./types";

/**
 * FONTI — whitelist statica dell'aggregatore.
 *
 * SOLO queste fonti sono acquisibili: nessun URL arbitrario proveniente
 * dall'utente viene mai accettato (sicurezza SSRF).
 *
 * Linea editoriale agricola/agroalimentare calabrese:
 * - FONTI_ISTITUZIONALI: ARSAC (agenzia agricola della Regione Calabria) e
 *   il feed istituzionale di Regione Calabria (filtrato sul settore).
 * - FONTI_DISCOVERY: Google News RSS, di tipo discovery (`scoperta`): non
 *   producono contenuti propri ma trovano articoli di testate e istituzioni
 *   tramite ricerca tematica. Nessun URL arbitrario: la whitelist è statica.
 *
 * Le query sono VOLUTAMENTE a tema singolo e vincolate al titolo
 * (`intitle:Calabria`): verificato il 14/11/2026 che le ricerche con molti OR
 * restituiscono feed poveri o vuoti e che senza il vincolo sul titolo
 * arrivano articoli nazionali che citano la Calabria solo nel corpo, scartati
 * comunque dal filtro (che lavora su titolo ed estratto). La selezione vera
 * avviene in lib/notizie/filtro.ts.
 *
 * Le vecchie fonti di cronaca cittadina (Comune, Provincia, Protezione
 * Civile, Parco del Pollino, Google News Castrovillari) restano nel database
 * con `attiva = false`: le righe storiche continuano a puntare a una fonte
 * valida, ma non vengono più aggiornate né mostrate.
 */

/** Identificativi stabili delle fonti (stessi UUID del seed delle migration). */
export const FONTI_ID = {
  // Storiche, disattivate: mantenute per compatibilità di righe e test.
  COMUNE: "a0000000-0000-4000-8000-000000000001",
  PROVINCIA: "a0000000-0000-4000-8000-000000000002",
  REGIONE: "a0000000-0000-4000-8000-000000000003",
  POLLINO: "a0000000-0000-4000-8000-000000000004",
  PROTEZIONE_CIVILE: "a0000000-0000-4000-8000-000000000005",
  GOOGLE_NEWS_CV: "a0000000-0000-4000-8000-000000000006",
  GOOGLE_NEWS_COMUNE: "a0000000-0000-4000-8000-000000000007",
  // Nuova linea editoriale agricola.
  ARSAC: "b0000000-0000-4000-8000-000000000001",
  GOOGLE_AGRICOLTURA: "b0000000-0000-4000-8000-000000000002",
  GOOGLE_OLIO: "b0000000-0000-4000-8000-000000000003",
  GOOGLE_VINO: "b0000000-0000-4000-8000-000000000004",
  GOOGLE_AGRUMI: "b0000000-0000-4000-8000-000000000005",
  GOOGLE_QUALITA: "b0000000-0000-4000-8000-000000000006",
  GOOGLE_CSR: "b0000000-0000-4000-8000-000000000007",
  GOOGLE_PAC: "b0000000-0000-4000-8000-000000000008",
  GOOGLE_FIERE: "b0000000-0000-4000-8000-000000000009",
  GOOGLE_SAGRE: "b0000000-0000-4000-8000-000000000010",
  GOOGLE_VINITALY: "b0000000-0000-4000-8000-000000000011",
  GOOGLE_EXPORT: "b0000000-0000-4000-8000-000000000012",
  GOOGLE_ARSAC: "b0000000-0000-4000-8000-000000000013",
  GOOGLE_INNOVAZIONE: "b0000000-0000-4000-8000-000000000014",
  GOOGLE_BIODIVERSITA: "b0000000-0000-4000-8000-000000000015",
  GOOGLE_PARCO: "b0000000-0000-4000-8000-000000000016",
  GOOGLE_ORTOFRUTTA: "b0000000-0000-4000-8000-000000000017",
  GOOGLE_ZOOTECNIA: "b0000000-0000-4000-8000-000000000018",
  GOOGLE_BIOLOGICO: "b0000000-0000-4000-8000-000000000019",
  GOOGLE_PREZZI: "b0000000-0000-4000-8000-000000000020",
  GOOGLE_AGROALIMENTARE: "b0000000-0000-4000-8000-000000000021",
  GOOGLE_AGRITURISMO: "b0000000-0000-4000-8000-000000000022",
} as const;

/** Fonti ufficiali/specializzate del settore. */
export const FONTI_ISTITUZIONALI: FonteNotizie[] = [
  {
    id: FONTI_ID.ARSAC,
    nome: "ARSAC Servizi in Agricoltura Calabria",
    tipo: "rss",
    urlFeed: "https://www.arsacweb.it/feed/",
    urlLista: null,
    urlBase: "https://www.arsacweb.it",
    categoriaDefault: "Agricoltura",
    attiva: true,
    scoperta: false,
    frequenzaMinuti: 720,
  },
  {
    id: FONTI_ID.REGIONE,
    nome: "Regione Calabria",
    tipo: "rss",
    urlFeed: "https://www.regione.calabria.it/feed/",
    urlLista: null,
    urlBase: "https://www.regione.calabria.it",
    categoriaDefault: "Politiche agricole e finanziamenti",
    attiva: true,
    scoperta: false,
    frequenzaMinuti: 360,
  },
];

const BASE_GOOGLE_NEWS =
  "https://news.google.com/rss/search?hl=it&gl=IT&ceid=IT:it&q=";

/** Query tematiche (una per area editoriale, tutte su base regionale). */
const QUERY_DISCOVERY = {
  agricoltura: "intitle:Calabria+agricoltura",
  olio: "intitle:Calabria+olio",
  vino: "intitle:Calabria+vino",
  agrumi: "intitle:Calabria+agrumi",
  qualita: "intitle:Calabria+DOP",
  csr: "intitle:Calabria+CSR",
  pac: "intitle:Calabria+PAC",
  fiere: "intitle:Calabria+fiera",
  sagre: "intitle:Calabria+sagra",
  vinitaly: "intitle:Calabria+Vinitaly",
  export: "intitle:Calabria+export",
  arsac: "intitle:Calabria+ARSAC",
  // Copertura delle categorie editoriali rimaste scoperte (verificato il
  // 14/11/2026: ogni query restituisce fra 5 e 65 item).
  innovazione: "intitle:Calabria+innovazione",
  biodiversita: "intitle:Calabria+biodiversit%C3%A0",
  parco: "intitle:Calabria+parco",
  ortofrutta: "intitle:Calabria+ortofrutta",
  zootecnia: "intitle:Calabria+zootecnia",
  biologico: "intitle:Calabria+biologico",
  prezzi: "intitle:Calabria+prezzi",
  agroalimentare: "intitle:Calabria+agroalimentare",
  agriturismo: "intitle:Calabria+agriturismo",
} as const;

function fonteDiscovery(
  id: string,
  nome: string,
  query: keyof typeof QUERY_DISCOVERY,
  categoriaDefault: FonteNotizie["categoriaDefault"]
): FonteNotizie {
  return {
    id,
    nome,
    tipo: "rss",
    urlFeed: `${BASE_GOOGLE_NEWS}${QUERY_DISCOVERY[query]}`,
    urlLista: null,
    urlBase: "https://news.google.com",
    categoriaDefault,
    attiva: true,
    scoperta: true,
    frequenzaMinuti: 240,
  };
}

/** Fonti di discovery (Google News RSS) — una per area tematica. */
export const FONTI_DISCOVERY: FonteNotizie[] = [
  fonteDiscovery(
    FONTI_ID.GOOGLE_INNOVAZIONE,
    "Google News · Innovazione e ricerca agricola",
    "innovazione",
    "Innovazione e ricerca"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_BIODIVERSITA,
    "Google News · Biodiversità e territori",
    "biodiversita",
    "Territori e biodiversità"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_PARCO,
    "Google News · Parchi e aree protette",
    "parco",
    "Territori e biodiversità"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_ORTOFRUTTA,
    "Google News · Ortofrutta e produzioni",
    "ortofrutta",
    "Filiere e produzioni"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_ZOOTECNIA,
    "Google News · Zootecnia e allevamenti",
    "zootecnia",
    "Filiere e produzioni"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_BIOLOGICO,
    "Google News · Agricoltura biologica",
    "biologico",
    "Filiere e produzioni"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_PREZZI,
    "Google News · Prezzi e mercati agricoli",
    "prezzi",
    "Mercati ed esportazioni"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_AGROALIMENTARE,
    "Google News · Agroalimentare e mercati",
    "agroalimentare",
    "Mercati ed esportazioni"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_AGRITURISMO,
    "Google News · Agriturismo e territori rurali",
    "agriturismo",
    "Territori e biodiversità"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_AGRICOLTURA,
    "Google News · Agricoltura Calabria",
    "agricoltura",
    "Agricoltura"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_OLIO,
    "Google News · Olio e olivicoltura",
    "olio",
    "Olio e olivicoltura"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_VINO,
    "Google News · Vino e viticoltura",
    "vino",
    "Vino e viticoltura"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_AGRUMI,
    "Google News · Agrumi e ortofrutta",
    "agrumi",
    "Filiere e produzioni"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_QUALITA,
    "Google News · DOP e prodotti tipici",
    "qualita",
    "Prodotti tipici e qualità"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_CSR,
    "Google News · CSR e sviluppo rurale",
    "csr",
    "Politiche agricole e finanziamenti"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_PAC,
    "Google News · PAC e finanziamenti agricoli",
    "pac",
    "Politiche agricole e finanziamenti"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_FIERE,
    "Google News · Fiere agricole",
    "fiere",
    "Eventi e fiere"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_SAGRE,
    "Google News · Sagre e manifestazioni",
    "sagre",
    "Eventi e fiere"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_VINITALY,
    "Google News · Vinitaly e vino italiano",
    "vinitaly",
    "Eventi e fiere"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_EXPORT,
    "Google News · Export agroalimentare",
    "export",
    "Mercati ed esportazioni"
  ),
  fonteDiscovery(
    FONTI_ID.GOOGLE_ARSAC,
    "Google News · ARSAC e ricerca agricola",
    "arsac",
    "Innovazione e ricerca"
  ),
];

/** Tutte le fonti note. */
export const FONTI_AGGIORNAMENTO: FonteNotizie[] = [
  ...FONTI_ISTITUZIONALI,
  ...FONTI_DISCOVERY,
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

/** Cerca una fonte per id; undefined se non è nota. */
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
      statica?.categoriaDefault ?? "Agricoltura",
    attiva: riga.attiva,
    frequenzaMinuti: riga.frequenza_minuti,
    scoperta: riga.scoperta ?? statica?.scoperta ?? false,
    ultimaEsecuzione: riga.ultima_esecuzione ?? null,
  };
}
