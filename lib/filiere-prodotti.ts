/**
 * Collegamento tra i prodotti dei negozi e le dieci filiere della homepage.
 *
 * Le categorie dei negozi sono merceologiche e larghe («Alimentari»): da sole
 * tengono insieme miele, pasta e salumi. Qui ogni prodotto viene ricondotto
 * alla filiera di appartenenza usando prima la categoria del negozio (quando è
 * specifica) e poi le parole chiave del nome.
 *
 * Le chiavi sono ricavate dai prodotti elencati nelle schede di
 * `components/home/HomepageFiliereShowcase.tsx` e dai prodotti del catalogo:
 * nessuna filiera inventata. I prodotti che non rientrano in nessuna delle
 * dieci restano fuori dalle schede (nessun elenco mescolato).
 */

export const ALTRI_PRODOTTI = "Altri prodotti";

export type RegolaFiliera = {
  /** Nome della filiera, identico a quello della vetrina. */
  nome: string;
  /** Categorie merceologiche che appartengono con certezza alla filiera. */
  categorie?: RegExp;
  /** Parole chiave cercate in nome e slug del prodotto. */
  chiavi: string[];
};

/**
 * Ordine in cui le filiere vengono presentate (quello della vetrina).
 * È separato dall'ordine di riconoscimento qui sotto, che mette le filiere più
 * specifiche per prime: «Alicette al peperoncino» è ittica, non ortofrutta.
 */
export const ORDINE_FILIERE = [
  "Filiera olivicola",
  "Filiera agrumicola",
  "Filiera vitivinicola",
  "Filiera cerealicola e pasta",
  "Filiera zootecnica e lattiero-casearia",
  "Filiera delle carni e dei salumi",
  "Filiera ortofrutticola",
  "Filiera della liquirizia",
  "Filiera dei fichi e della dolciaria",
  "Filiera ittica",
];

/** Ordine di RICONOSCIMENTO (dal più specifico al più generico). */
export const FILIERE_PRODOTTI: RegolaFiliera[] = [
  {
    nome: "Filiera ittica",
    categorie: /^(pesce|pescheria|ittica|conserva ittica)/,
    chiavi: [
      "pesce",
      "pescato",
      "alici",
      "alice",
      "acciugh",
      "sardin",
      "tonno",
      "bottarga",
      "branzin",
      "orata",
      "calamar",
      "vongol",
      "cozze",
      "ittic",
      "stoccafisso",
      "stocco",
      "baccala",
      "salmone",
      "polpo",
    ],
  },
  {
    nome: "Filiera delle carni e dei salumi",
    categorie: /^(salumi|carni|macelleria|norcineria)/,
    chiavi: [
      "soppressat",
      "salsicc",
      "capocollo",
      "pancetta",
      "guanciale",
      "prosciutt",
      "nduja",
      "salum",
      "carne",
      "carni",
      "suino",
      "maiale",
      "cinghiale",
      "mortadella",
      "spianata",
      "ventricina",
    ],
  },
  {
    nome: "Filiera zootecnica e lattiero-casearia",
    categorie: /^(formaggi|latticini|caseificio)/,
    chiavi: [
      "formagg",
      "pecorin",
      "caciocavall",
      "cacioricotta",
      "ricotta",
      "provola",
      "burro",
      "butirro",
      "latte",
      "yogurt",
      "cacio",
      "caprin",
      "felciata",
      "canestrato",
      "giuncata",
      "mozzarell",
      "primo sale",
      "toma",
    ],
  },
  {
    nome: "Filiera agrumicola",
    categorie: /agrum/,
    chiavi: [
      "agrum",
      "aranc",
      "limon",
      "clementin",
      "bergamott",
      "mandarin",
      "cedro",
      "pompelmo",
      "chinotto",
    ],
  },
  {
    nome: "Filiera olivicola",
    categorie: /^ol[il]/,
    chiavi: ["olio", "oliva", "olive", "frantoio", "oleific", "olivicol"],
  },
  {
    nome: "Filiera vitivinicola",
    categorie: /^(vini|vino|enoteca|cantina|liquori)/,
    chiavi: [
      "vino",
      "vini",
      "cantina",
      "enoteca",
      "spumante",
      "prosecco",
      "passito",
      "liquoros",
      "grappa",
      "liquore",
      "amaro",
      "vermouth",
      "gaglioppo",
      "magliocco",
      "moscato",
      "rosato",
      "nerello",
      "pecorello",
      "ferrocinto",
      "terre di cosenza",
    ],
  },
  {
    nome: "Filiera cerealicola e pasta",
    categorie: /^(pasta|farine|pane|prodotti da forno|riso)/,
    chiavi: [
      "pasta",
      "maccheron",
      "stroncatur",
      "ferrett",
      "fileja",
      "strascinat",
      "lagan",
      "farina",
      "semola",
      "grano",
      "riso",
      "pane",
      "forno",
      "tarall",
      "frisell",
      "cavatell",
      "orecchiett",
      "gnocchi",
      "fregola",
    ],
  },
  {
    nome: "Filiera ortofrutticola",
    categorie: /^(ortofrutta|frutta|verdura|orticola)/,
    chiavi: [
      "cipoll",
      "patat",
      "finocchi",
      "peperon",
      "crusco",
      "ortagg",
      "verdur",
      "frutta",
      "legum",
      "fagiol",
      "lenticchi",
      "ceci",
      "piselli",
      "melanzan",
      "zucchin",
      "pomodor",
      "asparag",
      "carciof",
      "funghi",
      "porcini",
      "tartuf",
      "origano",
    ],
  },
  {
    nome: "Filiera della liquirizia",
    categorie: /liquiriz/,
    chiavi: ["liquiriz"],
  },
  {
    nome: "Filiera dei fichi e della dolciaria",
    categorie: /^(dolci|dolciumi|pasticceria|torron)/,
    chiavi: [
      "fico",
      "fich",
      "torron",
      "mostarda",
      "confettur",
      "marmellat",
      "mandorl",
      "piparell",
      "ciotaredd",
      "cannaritol",
      "bocconotto",
      "mpigliata",
      "dolcett",
      "biscott",
      "cannolo",
      "cassat",
    ],
  },
];

const FILIERA_DOLCIARIA = "Filiera dei fichi e della dolciaria";

/**
 * Il miele non ha una delle dieci filiere: si presenta con la dolciaria, dove
 * stanno torrone, confetture e frutta secca. Va riconosciuto prima delle altre
 * chiavi, così un «miele di castagno» non finisce tra l'ortofrutta.
 */
const CHIAVI_MIELE = ["miele", "polline", "propoli", "apicol", "apiario"];

/** Minuscolo, senza accenti: «’Nduja» → «'nduja», «Caffè» → «caffe». */
function normalizza(testo: string) {
  return testo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[\u2018\u2019`]/g, "'");
}

/**
 * I prodotti sott'olio (pomodori, melanzane, giardiniera) sono conserve
 * ortofrutticole: la parola «olio» non deve portarli tra gli oli.
 */
function senzaSottOlio(testo: string) {
  // Negli slug la forma è «sott-olio», nel nome «sott'olio» o «sott olio».
  return testo.replace(/sott[\s'\u2019_-]*olio/g, " ");
}

/**
 * Filiera di un prodotto. Le `categorie` dei negozi hanno la precedenza (una
 * categoria «Vini» è una certezza), poi contano le parole chiave di nome e
 * slug; `null` quando il prodotto non appartiene a nessuna delle dieci.
 */
export function classificaProdottoPerFiliera(prodotto: {
  nome?: unknown;
  categoria?: unknown;
  slug?: unknown;
}): string | null {
  const nome = normalizza(typeof prodotto.nome === "string" ? prodotto.nome : "");
  const slug = normalizza(typeof prodotto.slug === "string" ? prodotto.slug : "");
  const categoria = normalizza(
    typeof prodotto.categoria === "string" ? prodotto.categoria : ""
  ).trim();

  if (CHIAVI_MIELE.some((chiave) => nome.includes(chiave) || slug.includes(chiave))) {
    return FILIERA_DOLCIARIA;
  }

  for (const regola of FILIERE_PRODOTTI) {
    if (regola.categorie?.test(categoria)) return regola.nome;
  }

  const testo = senzaSottOlio(`${nome} ${slug}`);
  for (const regola of FILIERE_PRODOTTI) {
    if (regola.chiavi.some((chiave) => testo.includes(chiave))) return regola.nome;
  }

  return null;
}

/** Posizione della filiera nell'ordine della vetrina. */
export function posizioneFiliera(nome: string) {
  const indice = ORDINE_FILIERE.indexOf(nome);
  return indice === -1 ? ORDINE_FILIERE.length : indice;
}

/**
 * Prodotti raggruppati per filiera (chiave = nome della filiera).
 * I prodotti senza filiera restano fuori: nessuna scheda «mista».
 * I duplicati (stesso id, o stesso slug) vengono contati una volta sola.
 */
export function raggruppaProdottiPerFiliera(
  prodotti: Record<string, unknown>[]
): Record<string, Record<string, unknown>[]> {
  const visti = new Set<string>();
  const gruppi: Record<string, Record<string, unknown>[]> = {};

  for (const prodotto of prodotti) {
    const chiave = String(prodotto.id ?? prodotto.slug ?? "");
    if (chiave && visti.has(chiave)) continue;
    if (chiave) visti.add(chiave);

    const filiera = classificaProdottoPerFiliera(prodotto);
    if (!filiera) continue;
    gruppi[filiera] = gruppi[filiera] ?? [];
    gruppi[filiera].push(prodotto);
  }

  return gruppi;
}
