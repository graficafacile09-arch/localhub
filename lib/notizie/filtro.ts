import { FONTI_ID } from "./fonti";
import type { CategoriaNotizia } from "./types";

/**
 * FILTRO EDITORIALE — agricoltura e agroalimentare calabrese.
 *
 * Deterministico, senza IA, facilmente modificabile. Una notizia entra in
 * sezione solo se ha ENTRAMBI:
 *   1. un riferimento esplicito alla Calabria o a un suo territorio;
 *   2. almeno un termine del mondo agricolo/agroalimentare.
 *
 * Il solo "Calabria" non basta (cronaca, politica, sport restano fuori) e il
 * solo "agricoltura" non basta (le notizie nazionali generiche restano
 * fuori). Le notizie dell'ARSAC sono sempre pertinenti: è l'agenzia agricola
 * della Regione e pubblica esclusivamente contenuti di settore.
 *
 * Le liste sono costanti qui: modificarle NON richiede migration.
 */

/** Normalizza il testo per il match: minuscolo + rimozione accenti. */
export function normalizzaTesto(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fonti le cui notizie sono sempre pertinenti (agenzia agricola regionale). */
const SORGENTI_SEMPRE_PERTINENTI: ReadonlySet<string> = new Set([FONTI_ID.ARSAC]);

/**
 * Riferimenti territoriali calabresi. Inclusi solo toponimi non ambigui:
 * niente parole che sono anche nomi comuni o nomi di persona ("Rende",
 * "Paola", "Diamante", "Acri" restano fuori di proposito).
 */
const LUOGHI_CALABRIA: readonly string[] = [
  "calabria", "calabrese", "calabresi", "calabra", "calabro",
  "pollino", "sila", "aspromonte", "piana di gioia tauro",
  "piana di lamezia", "sibari", "corigliano", "rossano", "tropea",
  "bagnara calabra", "scilla", "reggio calabria", "cosenza", "catanzaro",
  "crotone", "vibo valentia", "lamezia terme", "castrovillari",
  "praia a mare", "scalea", "trebisacce", "gioia tauro", "locri",
  "siderno", "cariati", "cirò", "amantea", "cetraro", "soverato",
  "gerace", "altomonte", "morano calabro", "san giovanni in fiore",
  "montalto uffugo", "san marco argentano", "spezzano albanese",
  "cerchiara di calabria", "frascineto", "terranova da sibari",
  "cassano all'ionio", "sellia marina", "botricello", "isola capo rizzuto",
  "petilia policastro", "mesoraca", "caccuri", "santa severina",
  "strongoli", "crucoli", "bovalino", "brancaleone", "africo",
  "melito di porto salvo", "condofuri", "monteleone di calabria",
  "serra san bruno", "polistena", "taurianova", "rosarno", "palmi",
  "mileto", "ricadi", "villapiana", "roseto capo spulico",
  "san lucido", "fuscaldo", "belvedere marittimo", "orsomarso",
  "papasidero", "mormanno",
];

/**
 * Termini FORTI (2 punti): settori e istituti che identificano da soli il
 * mondo agricolo. Confronto per sottostringa (le radici coprono i plurali).
 */
const RADICI_FORTI: readonly string[] = [
  "agricoltur", "agricol", "agroalimentar", "agroindustri",
  "olivicoltur", "viticoltur", "zootecni", "apicoltur", "itticoltur",
  "acquacoltur", "agrumicoltur", "ortofrutta", "filiera",
  "sviluppo rurale", "olio extravergine", "olio evo", "oliveto",
  "frantoio", "frantoian", "oleific", "vendemmia", "vigneto", "vitigno",
  "cantina", "enolog", "spumante", "agrumeto", "bergamotto",
  "clementine", "consorzio di tutela", "denominazione di origine",
  "prodotti tipici", "prodotto tipico", "agrometeorolog", "fitosanitar",
  "campagna agricola", "annata agraria", "azienda agricola",
  "aziende agricole", "cooperativa agricola", "mercato contadino",
  "agricoltori", "agricoltore", "olivicoltori", "viticoltori",
  "allevatori", "pastorizia", "caseificio", "salumificio",
];

/** Parole FORTI da confrontare come parola intera (acronimi e prodotti). */
const PAROLE_FORTI: readonly string[] = [
  "dop", "igp", "doc", "docg", "igt", "pac", "psr", "csr", "feasr",
  "arsac", "agea", "masaf", "crea", "ismea", "gal", "psl",
  "vino", "vini", "olio", "oliva", "olive", "uva", "grano", "miele",
  "formaggio", "formaggi", "salumi", "liquirizia",
];

/**
 * Termini MEDI (1 punto): prodotti, pratiche e mercati. Da soli non bastano
 * (servono almeno due riscontri), così una notizia di cronaca che cita "il
 * mercato" non entra in sezione.
 */
const RADICI_MEDIE: readonly string[] = [
  "vinicol", "bollicin", "mosto", "barric", "molitura", "sansa",
  "aranc", "mandarin", "cedro", "limon", "ortagg", "frutta",
  "cereali", "granoturco", "mais", "legumi", "lenticchi", "fagiol",
  "ceci", "patat", "cipolla", "pomodoro", "peperoncino", "melanzan",
  "latticin", "pecorin", "caciocavall", "ricotta", "prosciutto",
  "biodiversit", "sement", "vivaio", "vivaistic", "irrigazion",
  "biologic", "contribut", "finanziament", "agevolazion", "graduatori",
  "raccolt", "prezzi", "quotazion", "export", "esportazion", "mercato",
  "mercati", "agriturism", "fattoria", "allevament", "pastorizi",
  "essiccatoio", "seminativ", "foragg", "panificazion", "molino",
  "pastificio", "trasformazion", "tracciabilita", "tipicita", "qualita",
  "fiera", "fiere", "sagra", "salone", "vinitaly", "tuttofood",
  "cibus", "macfrut", "eima", "slow food", "presidio", "degustazione",
  "convegno", "seminario", "giornata tecnica", "open day",
];

/** Soglia di pertinenza: almeno un termine forte oppure due medi. */
const SOGLIA_PERTINENZA = 2;

/** Massimo numero di parole di un titolo editoriale accettabile. */
const PAROLE_MAX_TITOLO = 30;

/**
 * Guardia qualità: i titoli lunghissimi sono tipicamente keyword stuffing
 * (es. "... Formazione Obbligatoria sulla Sicurezza sul Lavoro ... Regione
 * Calabria Comune di Gizzeria y10r4T"), non notizie agricole. Restano fuori.
 */
function eTitoloBassaQualita(title: string): boolean {
  const parole = title.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (parole.length > PAROLE_MAX_TITOLO) return true;
  // Una coppia di parole ripetuta è il segno tipico del keyword stuffing.
  const visti = new Set<string>();
  for (let i = 0; i < parole.length - 1; i += 1) {
    const a = parole[i].replace(/[^\p{L}\p{N}]/gu, "");
    const b = parole[i + 1].replace(/[^\p{L}\p{N}]/gu, "");
    if (a.length < 4 || b.length < 4) continue;
    const bigramma = `${a} ${b}`;
    if (visti.has(bigramma)) return true;
    visti.add(bigramma);
  }
  return false;
}

function contieneParola(testo: string, parola: string): boolean {
  return testo.includes(` ${parola} `);
}

/** True se il testo cita la Calabria o un suo territorio. */
export function contieneRiferimentoCalabria(testo: string): boolean {
  const t = ` ${normalizzaTesto(testo)} `;
  return LUOGHI_CALABRIA.some((luogo) => t.includes(normalizzaTesto(luogo)));
}

/** Punteggio del lessico agricolo/agroalimentare (0 se estraneo al settore). */
export function punteggioAgricoltura(testo: string): number {
  const t = ` ${normalizzaTesto(testo)} `;
  let forti = 0;
  for (const radice of RADICI_FORTI) {
    if (t.includes(radice)) forti += 1;
  }
  for (const parola of PAROLE_FORTI) {
    if (contieneParola(t, parola)) forti += 1;
  }
  let medi = 0;
  for (const radice of RADICI_MEDIE) {
    if (t.includes(radice)) medi += 1;
  }
  // Tetto: evita che un testo lunghissimo passi solo per accumulo di parole.
  return Math.min(forti, 2) * 2 + Math.min(medi, 2);
}

/**
 * Decide se un contenuto appartiene alla nuova sezione Notizie.
 * Controlla titolo + estratto (l'estratto è il "contenuto disponibile").
 */
export function isPertinenteAgricoltura(params: {
  fonteId: string;
  title: string;
  excerpt?: string | null;
}): boolean {
  if (SORGENTI_SEMPRE_PERTINENTI.has(params.fonteId)) return true;
  if (eTitoloBassaQualita(params.title)) return false;
  const testo = `${params.title} ${params.excerpt ?? ""}`;
  if (!contieneRiferimentoCalabria(testo)) return false;
  return punteggioAgricoltura(testo) >= SOGLIA_PERTINENZA;
}

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORIA EDITORIALE
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Mappa keyword → categoria. Le prime corrispondenze vincono: gli eventi
 * hanno la precedenza perché nella nuova sezione sono una parte essenziale.
 * Innovazione e mercati stanno PRIMA delle politiche agricole: altrimenti le
 * parole "regione", "assessor" e "investiment" catturano anche le notizie
 * di ricerca e di mercato, lasciando quelle due categorie sempre vuote.
 */
const MAPPA_CATEGORIE: ReadonlyArray<{
  keywords: readonly string[];
  categoria: CategoriaNotizia;
}> = [
  {
    keywords: [
      "fiera", "fiere", "vinitaly", "sagra", "festival", "rassegna",
      "convegno", "seminario", "workshop", "giornata tecnica", "open day",
      "degustazione", "manifestazione", "expo", "salone", "tuttofood",
      "cibus", "macfrut", "eima", "appuntamento", "calendario",
      "presentazione", "incontro",
    ],
    categoria: "Eventi e fiere",
  },
  {
    keywords: [
      "vino", "vini", "vitign", "vignet", "vendemmia", "enolog",
      "cantina", "spumante", "bollicin", "docg", "barric", "mosto",
      "uva", "vinicol",
    ],
    categoria: "Vino e viticoltura",
  },
  {
    keywords: [
      "olio", "oliva", "olive", "oliveto", "olivicol", "frantoio",
      "frantoian", "oleific", "extravergine", "molitura", "sansa",
      "olio nuovo", "raccolta delle olive",
    ],
    categoria: "Olio e olivicoltura",
  },
  {
    keywords: [
      "dop", "igp", "deco", "de.co", "denominazione", "consorzio di tutela",
      "prodotto tipico", "prodotti tipici", "tipicita", "qualita",
      "formaggio", "formaggi", "caciocavallo", "pecorino", "ricotta",
      "salumi", "salume", "miele", "bergamotto", "cipolla", "peperoncino",
      "liquirizia", "nduja", "conserva", "presidio", "slow food",
      "premio", "medaglia", "riconoscimento",
    ],
    categoria: "Prodotti tipici e qualità",
  },
  {
    keywords: [
      "ricerca", "innovazion", "sperimentazion", "tecnologi", "digitale",
      "drone", "satellit", "precision", "crea", "universita",
      "progetto pilota", "startup", "genetica", "biotech", "sensor",
      "blockchain", "intelligenza artificiale", "studio",
    ],
    categoria: "Innovazione e ricerca",
  },
  {
    keywords: [
      "export", "esportazion", "import", "mercato", "mercati", "prezzo",
      "prezzi", "quotazion", "ismea", "consumi", "vendite", "distribuzione",
      "gdo", "horeca", "ice",
    ],
    categoria: "Mercati ed esportazioni",
  },
  {
    keywords: [
      "pac", "psr", "csr", "feasr", "bando", "bandi", "contribut",
      "finanziament", "agevolazion", "incentiv", "graduatori", "regolamento",
      "decreto", "masaf", "agea", "arsac", "regione", "assessor",
      "politica agricola", "fondo", "domanda unica", "gal", "psl",
      "investiment", "risorse",
    ],
    categoria: "Politiche agricole e finanziamenti",
  },
  {
    keywords: [
      "territorio", "paesaggio", "biodiversita", "parco", "sila",
      "aspromonte", "pollino", "aree interne", "montagna", "ambiente",
      "sostenibilita", "clima", "siccita", "dissesto", "suolo",
    ],
    categoria: "Territori e biodiversità",
  },
  {
    keywords: [
      "filiera", "filiere", "produzion", "raccolto", "campagna",
      "coltivazion", "seminativ", "cereali", "grano", "legumi",
      "ortofrutta", "agrum", "frutta", "ortagg", "zootecnia",
      "allevament", "pastorizia", "apicoltur", "itticoltur", "pesca",
    ],
    categoria: "Filiere e produzioni",
  },
];

/** Categoria di un contenuto: keyword prima, poi default della fonte. */
export function assegnaCategoria(
  title: string,
  excerpt: string | null,
  categoriaDefault: CategoriaNotizia
): CategoriaNotizia {
  const t = ` ${normalizzaTesto(`${title} ${excerpt ?? ""}`)} `;
  for (const riga of MAPPA_CATEGORIE) {
    if (riga.keywords.some((k) => t.includes(normalizzaTesto(k)))) {
      return riga.categoria;
    }
  }
  return categoriaDefault;
}

/** True se la stringa è una delle categorie editoriali note. */
export function isCategoriaNotizia(
  valore: string | null | undefined
): valore is CategoriaNotizia {
  if (!valore) return false;
  const note: string[] = [
    ...MAPPA_CATEGORIE.map((riga) => riga.categoria),
    "Agricoltura",
  ];
  return note.includes(valore);
}
