/**
 * Pino — Lessico unico dei soggetti di catalogo.
 *
 * Era il punto debole del sistema: la stessa conoscenza (birra/birretta,
 * cipolla, telefono/cellulare, …) era ripetuta in cinque posti — piano locale,
 * vocabolario dei refusi, routing alimentare, ponti concettuali e gate di
 * pertinenza — così ogni parola nuova andava aggiunta (o dimenticata) in più
 * file. Qui vive UNA volta sola e ogni strato la deriva:
 *
 *   - `CANONICI_CATALOGO_PINO`   → fast path e piano locale (`semantica.ts`)
 *   - `VOCABOLARIO_REFUSI_PINO`  → correzione refusi (`semantica.ts`)
 *   - `SOGGETTI_ALIMENTARI_PINO` → routing acquisto vs visita (`routing-policy.ts`)
 *   - `PONTI_CONCETTUALI_PINO`, `SOGGETTI_GENERICI_PINO` → gate prodotti (`tools.ts`)
 *
 * Le equivalenze che NON dipendono dal nome (forma compatta «extravergine ≡
 * extra vergine», sigle «evo ≡ Extra Vergine di Oliva») sono affrontate
 * strutturalmente da `lib/text-utils.ts`: il lessico resta la fonte dei nomi,
 * non il sostituto del confronto.
 *
 * Per coprire un nuovo soggetto basta aggiungere una voce qui: nessun altro
 * file va toccato.
 *
 * @module lib/assistente/lexicon
 */
import type { PinoIntent } from "./intent.ts";
import { normalizza } from "../text-utils.ts";

export type SoggettoCatalogoPino = {
  /** Forma canonica usata nella query di retrieval. */
  termine: string;
  /** Tutte le forme riconosciute: singolari, plurali, vezzeggiativi, inglese. */
  forme: readonly string[];
  intent: PinoIntent;
  /** Soggetto del piano locale veloce (fast path) e della correzione refusi. */
  piano: boolean;
  /** Target della correzione refusi quando differisce dal termine (scarpe → scarpa). */
  refuso?: string;
  /** Nome generico di alimento: distingue un acquisto da una visita/consumo. */
  alimentare?: boolean;
};

/**
 * Soggetti noti al catalogo. Le forme sono confrontate come parole intere
 * (`\b`), quindi «vino» non aggancia «divino».
 */
export const SOGGETTI_CATALOGO_PINO: readonly SoggettoCatalogoPino[] = [
  { termine: "birra", forme: ["birra", "birre", "birretta", "birrette", "birrettina", "birrettine"], intent: "drink", piano: true, alimentare: true },
  { termine: "vino", forme: ["vino", "vini", "vinello", "vinelli"], intent: "drink", piano: true, alimentare: true },
  { termine: "acqua", forme: ["acqua", "acque"], intent: "drink", piano: true, alimentare: true },
  { termine: "pizza", forme: ["pizza", "pizze", "pizzetta", "pizzette"], intent: "food", piano: true, alimentare: true },
  { termine: "panino", forme: ["panino", "panini", "paninetto", "paninetti"], intent: "food", piano: true, alimentare: true },
  // Generi alimentari comuni: canonizza singolare/plurale senza trasformare
  // un alimento in un altro (nessuna espansione trasversale che crei falsi positivi).
  { termine: "cipolla", forme: ["cipolla", "cipolle"], intent: "food", piano: true, alimentare: true },
  { termine: "patata", forme: ["patata", "patate"], intent: "food", piano: true, alimentare: true },
  { termine: "pomodoro", forme: ["pomodoro", "pomodori"], intent: "food", piano: true, alimentare: true },
  { termine: "aglio", forme: ["aglio"], intent: "food", piano: true, alimentare: true },
  { termine: "carota", forme: ["carota", "carote"], intent: "food", piano: true, alimentare: true },
  { termine: "zucchina", forme: ["zucchina", "zucchine"], intent: "food", piano: true, alimentare: true },
  { termine: "melanzana", forme: ["melanzana", "melanzane"], intent: "food", piano: true, alimentare: true },
  { termine: "peperone", forme: ["peperone", "peperoni"], intent: "food", piano: true, alimentare: true },
  { termine: "insalata", forme: ["insalata", "insalate"], intent: "food", piano: true, alimentare: true },
  { termine: "mela", forme: ["mela", "mele"], intent: "food", piano: true, alimentare: true },
  { termine: "pera", forme: ["pera", "pere"], intent: "food", piano: true, alimentare: true },
  { termine: "arancia", forme: ["arancia", "arance"], intent: "food", piano: true, alimentare: true },
  { termine: "limone", forme: ["limone", "limoni"], intent: "food", piano: true, alimentare: true },
  { termine: "banana", forme: ["banana", "banane"], intent: "food", piano: true, alimentare: true },
  { termine: "telefono", forme: ["telefono", "telefoni", "telefonino", "telefonini", "cellulare", "cellulari", "smartphone"], intent: "product", piano: true, refuso: "telefono" },
  { termine: "scarpe", forme: ["scarpa", "scarpe", "scarpina", "scarpine"], intent: "product", piano: true, refuso: "scarpa" },
  { termine: "maglia", forme: ["maglia", "maglie", "maglietta", "magliette"], intent: "product", piano: true, refuso: "maglia" },
  // Vocabolario dei refusi senza piano veloce: "orologio" non deve cambiare il
  // fast path, ma resta un bersaglio legittimo della correzione refusi.
  { termine: "orologio", forme: ["orologio", "orologi"], intent: "product", piano: false, refuso: "orologio" },
];

const escapeRegex = (testo: string): string =>
  testo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pattern a parole intere per un gruppo di forme. */
export function patternSoggettoPino(forme: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${forme.map(escapeRegex).join("|")})\\b`, "i");
}

/**
 * Nomi di ATTIVITÀ (vetrine, non prodotti). Non sono soggetti di catalogo: la
 * stessa parola non deve diventare un prodotto tramite il piano veloce
 * ("pizzeria" non è "pizza", "bar" non è una bevanda). Servono a scegliere la
 * superficie `stores` prima di qualsiasi planner.
 */
const ATTIVITA_BASE_PINO: ReadonlyArray<{
  termine: string;
  forme: readonly string[];
  intent: PinoIntent;
}> = [
  { termine: "pizzeria", forme: ["pizzeria", "pizzerie"], intent: "food" },
  { termine: "ristorante", forme: ["ristorante", "ristoranti"], intent: "food" },
  { termine: "trattoria", forme: ["trattoria", "trattorie"], intent: "food" },
  { termine: "panificio", forme: ["panificio", "panifici"], intent: "food" },
  { termine: "panetteria", forme: ["panetteria", "panetterie"], intent: "food" },
  { termine: "forno", forme: ["forno", "forni"], intent: "food" },
  { termine: "gastronomia", forme: ["gastronomia", "gastronomie"], intent: "food" },
  { termine: "macelleria", forme: ["macelleria", "macellerie"], intent: "food" },
  { termine: "salumeria", forme: ["salumeria", "salumerie"], intent: "food" },
  { termine: "pescheria", forme: ["pescheria", "pescherie"], intent: "food" },
  { termine: "ortofrutta", forme: ["ortofrutta"], intent: "food" },
  { termine: "fruttivendolo", forme: ["fruttivendolo", "fruttivendoli"], intent: "food" },
  { termine: "pasticceria", forme: ["pasticceria", "pasticcerie"], intent: "food" },
  { termine: "gelateria", forme: ["gelateria", "gelaterie"], intent: "food" },
  { termine: "rosticceria", forme: ["rosticceria", "rosticcerie"], intent: "food" },
  { termine: "tavola calda", forme: ["tavola calda"], intent: "food" },
  { termine: "alimentari", forme: ["alimentari"], intent: "food" },
  { termine: "bar", forme: ["bar"], intent: "drink" },
  { termine: "enoteca", forme: ["enoteca", "enoteche"], intent: "drink" },
  { termine: "birreria", forme: ["birreria", "birrerie"], intent: "drink" },
  { termine: "vineria", forme: ["vineria", "vinerie"], intent: "drink" },
  { termine: "caffetteria", forme: ["caffetteria", "caffetterie"], intent: "drink" },
  { termine: "negozio", forme: ["negozio", "negozi"], intent: "generic" },
];

export const ATTIVITA_CATALOGO_PINO: ReadonlyArray<{
  termine: string;
  forme: readonly string[];
  intent: PinoIntent;
  pattern: RegExp;
}> = ATTIVITA_BASE_PINO.map((attivita) => ({
  ...attivita,
  pattern: patternSoggettoPino(attivita.forme),
}));

/**
 * Attività che vendono cibo pronto o fresco da asporto. Sono l'alternativa
 * reale a "ho fame" quando il catalogo non ha ristoranti o pizzerie: la
 * risposta le mostra per quello che sono (panificio, gastronomia, alimentari),
 * senza spacciarle per locali con servizio al tavolo.
 */
export const ATTIVITA_CIBO_PRONTO_PINO: readonly string[] = [
  "gastronomia",
  "panificio",
  "alimentari",
];

/**
 * Soggetti del piano locale / fast path. Derivati: nessuna seconda lista da
 * mantenere allineata con `SOGGETTI_CATALOGO_PINO`.
 */
export const CANONICI_CATALOGO_PINO: ReadonlyArray<{
  pattern: RegExp;
  termine: string;
  intent: PinoIntent;
}> = SOGGETTI_CATALOGO_PINO.filter((soggetto) => soggetto.piano).map((soggetto) => ({
  pattern: patternSoggettoPino(soggetto.forme),
  termine: soggetto.termine,
  intent: soggetto.intent,
}));

// Parole che non descrivono un prodotto del catalogo ma un attributo: il loro
// refuso non deve spingere una parola italiana valida verso un altro soggetto.
const REFUSI_EXTRA: ReadonlyArray<readonly [string, string]> = [
  ["analcolica", "analcolica"],
  ["analcolico", "analcolica"],
];

/**
 * Vocabolario dei refusi di Pino (token → termine canonico). Derivato dai
 * soggetti: ogni forma punta al proprio canonico, o al `refuso` dichiarato
 * quando il singolare è la forma di riferimento.
 */
export const VOCABOLARIO_REFUSI_PINO: ReadonlyArray<readonly [string, string]> = [
  ...SOGGETTI_CATALOGO_PINO.flatMap((soggetto) =>
    soggetto.forme.map(
      (forma) => [forma, soggetto.refuso ?? soggetto.termine] as const
    )
  ),
  ...REFUSI_EXTRA,
];

/**
 * Soggetti alimentari generici usati dal routing: distinguono «vorrei la
 * pasta» (acquisto) da «voglio mangiare» (ristorazione) e da una visita.
 * L'elenco è deliberatamente invariato rispetto al comportamento storico.
 */
export const SOGGETTI_ALIMENTARI_PINO: readonly string[] = [
  "pasta", "pane", "pizza", "dolce", "dolci", "gelato", "torta", "torte",
  "biscotti", "formaggio", "pecorino", "salumi", "prosciutto", "carne", "pesce",
  "verdura", "frutta", "olio", "miele", "conserve", "farina", "riso",
  "nutella", "cipolla", "pomodoro",
];

/**
 * Sottoinsieme INGLESE dei soggetti alimentari: sono le stesse parole italiane
 * già presenti nella lista, non un secondo vocabolario. Serve a distinguere una
 * parola singola inglese ("bread") da una parola italiana ("pane").
 */
export const SOGGETTI_ALIMENTARI_INGLESI_PINO: readonly string[] = [
  "bread", "noodles", "cake", "cookies", "cheese", "meat", "fish",
  "vegetables", "fruit", "honey", "flour", "rice", "onion", "tomato",
];

/**
 * Soggetto alimentare riconosciuto nella query: la prima parola alimentare del
 * testo. È la stessa regola usata dal gate prodotti (acquisto vs visita).
 * Restituisce `null` quando la richiesta non riguarda un alimento.
 */
export function soggettoAlimentarePino(query: string): string | null {
  const q = String(query ?? "").toLowerCase();
  if (!q.trim()) return null;
  const pattern = new RegExp(
    `\\b(${SOGGETTI_ALIMENTARI_PINO.map(escapeRegex).join("|")})\\b`,
    "i"
  );
  return q.match(pattern)?.[1] ?? null;
}

/**
 * Ponti concettuali ad alta precisione: il soggetto della richiesta può non
 * comparire nel nome del prodotto ("luce" → "Lampada da esterno"). Non è un
 * secondo motore di sinonimi: sono pochi gruppi curati, usati SOLO come seconda
 * verifica quando la corrispondenza diretta non ha trovato nulla.
 */
export const PONTI_CONCETTUALI_PINO: Readonly<Record<string, readonly string[]>> = {
  luce: ["lampada", "lampadario", "lampadina", "illuminazione", "faretto", "faretti"],
  illuminazione: ["lampada", "lampadario", "illuminazione", "faretto", "faretti"],
  riscaldamento: ["stufa", "termosifone", "caldaia", "radiatore"],
  pulizia: ["detergente", "detersivo", "sapone", "panno", "scopa"],
};

/**
 * Soggetti generici: senza un oggetto concreto il gate non ha nulla da
 * verificare e non deve restringere la ricerca ("qualcosa di dolce").
 */
export const SOGGETTI_GENERICI_PINO: ReadonlySet<string> = new Set([
  "qualcosa", "qualche", "cosa", "cose", "idea", "idee", "regalo", "regali",
  "prodotto", "prodotti", "dolce", "dolci", "salato", "salata", "altro",
  "altra", "altri", "altre", "simile", "simili",
]);
