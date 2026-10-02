/**
 * LocalHub — Pino Intent Layer v1
 *
 * Classificazione DETERMINISTICA dell'intento dell'utente, PRIMA del recupero.
 * Vive solo nel flusso interno di Pino: non tocca /api/search, la ricerca
 * pubblica, il catalogo, il ranking pubblico, il database né il sistema di
 * sicurezza minori.
 *
 * Tipi: product | food | drink | service | gift | generic
 *
 * Il livello produce:
 *   - `intent`: il tipo riconosciuto (guida risposta e log);
 *   - `dominio`: il settore del soggetto (food/drink/service/gift/nessuno),
 *     usato per scegliere le PRIORITÀ di recupero;
 *   - `terminiPrioritari`: categorie/attività da cercare per prime, coerenti
 *     con l'intento. Valgono solo per i NEGOZI: i prodotti restano vincolati
 *     ai loro gate di pertinenza (un negozio non trasferisce mai rilevanza ai
 *     suoi prodotti);
 *   - `usaNegozi` / `usaProdotti`: quali superfici interrogare;
 *   - `confidence`: "bassa" = nessun segnale forte → lascia decidere il
 *     planner LLM esattamente come prima dell'intent layer.
 *
 * Tutta la classificazione è locale e senza chiamate AI: veloce, a costo zero
 * e verificabile con test.
 *
 * @module lib/assistente/intent
 */

import { analizzaRichiesta } from "@/lib/ricerca-intento";
import { equivalentiMorfologici } from "@/lib/search-tollerante";
import { normalizzaRichiesta } from "./local-intents";

// ─── Tipi pubblici ───────────────────────────────────────────────────────────

export type PinoIntent = "product" | "food" | "drink" | "service" | "gift" | "generic";

export type PinoDominio = "food" | "drink" | "service" | "gift" | "nessuno";

export type PinoConfidence = "alta" | "media" | "bassa";

export type PinoIntentAnalysis = {
  intent: PinoIntent;
  dominio: PinoDominio;
  confidence: PinoConfidence;
  terminiPrioritari: string[];
  usaNegozi: boolean;
  usaProdotti: boolean;
  /** Segnali che hanno prodotto la classificazione (log/debug). */
  segnali: string[];
};

/** Voce del piano di ricerca generato dall'intento. */
export type PinoToolPlan = {
  tool: "searchStores" | "searchProducts";
  query: string;
};

// ─── Priorità per intento ────────────────────────────────────────────────────
// Coerenti con la specifica: food → ristorazione/pizzerie/alimentari/
// gastronomia; drink → bar/bevande; service → attività e servizi; gift → idee
// regalo. Sono cercate PRIMA e passano dagli stessi gate di pertinenza.

// Nota: "alimentari" e "gastronomia" NON sono qui come termini di ricerca.
// Attivano il profilo attività `alimentari` in espandiQueryConSinonimi, che
// riporta dentro ogni bottega/drogheria (e, nel dataset attuale, anche una riga
// di test) per QUALSIASI ricerca di cibo: risulterebbero negozi non pertinenti
// ("pizza" passerebbe da 3 a 6 negozi). Restano comunque raggiungibili dal
// percorso "bisogno" ("ho fame" → concetti alimentari/gastronomia) e dalla
// loro stessa categoria.
const PRIORITA_FOOD: string[] = [
  "ristorante",
  "trattoria",
  "pizzeria",
  "panificio",
  "forno",
  "mangiare",
];

const PRIORITA_DRINK: string[] = ["bar", "caffetteria", "bevande", "enoteca"];

const PRIORITA_GIFT: string[] = ["regalo", "gioielleria", "bomboniere", "artigianato"];

// ─── Lessici (normalizzati: minuscole, senza accenti) ────────────────────────

const L_GIFT: string[] = [
  "regalo",
  "regali",
  "regalare",
  "regalino",
  "regalini",
  "dono",
  "doni",
  "bomboniera",
  "bomboniere",
  "idea regalo",
  "idee regalo",
  "pacchetto regalo",
  "confezione regalo",
];

const RE_GIFT_DESTINATARIO =
  /\bper\s+(mia\s+madre|mia\s+mamma|mio\s+padre|mio\s+papa|un\s+bambino|una\s+bambina|un\s+amico|un'amica|una\s+amica|mia\s+moglie|mio\s+marito|mia\s+sorella|mio\s+fratello)\b/;

const L_SERVICE: string[] = [
  "parrucchiere",
  "parrucchieri",
  "barbiere",
  "barbieri",
  "estetista",
  "estetica",
  "capelli",
  "unghie",
  "manicure",
  "pedicure",
  "centro estetico",
  "medico",
  "dottore",
  "dottoressa",
  "dentista",
  "oculista",
  "otorino",
  "pediatra",
  "ginecologo",
  "cardiologo",
  "dermatologo",
  "veterinario",
  "farmacia",
  "parafarmacia",
  "idraulico",
  "elettricista",
  "falegname",
  "imbianchino",
  "muratore",
  "meccanico",
  "officina",
  "gommista",
  "carrozziere",
  "sartoria",
  "sarto",
  "calzolaio",
  "lavanderia",
  "tintoria",
  "ottico",
  "fotografo",
  "grafico",
  "tipografia",
  "informatico",
  "avvocato",
  "commercialista",
  "notaio",
  "architetto",
  "geometra",
  "ingegnere",
  "consulente",
  "agenzia immobiliare",
  "assicurazione",
  "banca",
  "poste",
  "palestra",
  "personal trainer",
  "hotel",
  "albergo",
  "b&b",
  "bed and breakfast",
  "affittacamere",
  "agriturismo",
  "visita",
];

const L_DRINK_NEED: string[] = ["sete", "bere", "dissetante", "qualcosa da bere", "da bere"];

const L_DRINK: string[] = [
  "bevanda",
  "bevande",
  "bibita",
  "bibite",
  "drink",
  "cocktail",
  "spritz",
  "aperitivo",
  "aperitivi",
  "acqua",
  "vino",
  "birra",
  "birre",
  "caffe",
  "cappuccino",
  "succo",
  "succhi",
  "spremuta",
  "amaro",
  "liquore",
  "digestivo",
  "prosecco",
  "spumante",
  "champagne",
  "enoteca",
  "birreria",
  "vineria",
  "caffetteria",
  "bar",
];

// Bevande "concrete": su queste ha senso cercare anche i PRODOTTI. Un termine
// di ATTIVITÀ ("bar", "enoteca") non è un prodotto: cercarlo tra i prodotti
// restituirebbe voci casuali (es. Nutella per "bar").
const L_DRINK_SOGGETTO: string[] = [
  "bevanda",
  "bevande",
  "bibita",
  "bibite",
  "drink",
  "cocktail",
  "spritz",
  "aperitivo",
  "aperitivi",
  "acqua",
  "vino",
  "vini",
  "birra",
  "birre",
  "caffe",
  "cappuccino",
  "succo",
  "succhi",
  "spremuta",
  "amaro",
  "liquore",
  "prosecco",
  "spumante",
  "champagne",
];

const L_FOOD_NEED: string[] = [
  "fame",
  "mangiare",
  "mangiare qualcosa",
  "cibo",
  "pranzo",
  "pranzi",
  "cena",
  "cene",
  "colazione",
  "spuntino",
  "spuntini",
  "merenda",
  "appetito",
];

const L_FOOD: string[] = [
  // Attività / vetrine
  "ristorante",
  "ristoranti",
  "trattoria",
  "pizzeria",
  "pizzerie",
  "panificio",
  "panifici",
  "panetteria",
  "forno",
  "gastronomia",
  "alimentari",
  "salumeria",
  "macelleria",
  "pescheria",
  "ortofrutta",
  "fruttivendolo",
  "pasticceria",
  "gelateria",
  "rosticceria",
  "tavola calda",
  // Prodotti alimentari concreti
  "pizza",
  "pane",
  "pasta",
  "dolce",
  "dolci",
  "gelato",
  "torta",
  "torte",
  "biscotti",
  "formaggio",
  "salumi",
  "prosciutto",
  "carne",
  "pesce",
  "verdura",
  "frutta",
  "olio",
  "miele",
  "conserve",
  "farina",
  "riso",
  "nutella",
  "cipolla",
  "pomodoro",
];

// Soggetti alimentari "concreti": su questi ha senso cercare anche i PRODOTTI.
const L_FOOD_SOGGETTO: string[] = [
  "pizza",
  "pane",
  "pasta",
  "dolce",
  "dolci",
  "gelato",
  "torta",
  "torte",
  "biscotti",
  "formaggio",
  "salumi",
  "prosciutto",
  "carne",
  "pesce",
  "verdura",
  "frutta",
  "olio",
  "miele",
  "conserve",
  "farina",
  "riso",
  "nutella",
  "cipolla",
  "pomodoro",
];

// Ricerca esplicita di un bene ("cerco pizza", "vorrei comprare una TV").
const RE_RICERCA_ESPLICITA =
  /\b(cerco|cerca|cercando|sto cercando|trovami|trova|comprare|compro|acquistare|acquisto|vorrei|voglio|mi serve|mi servirebbe|ho bisogno di|dove posso comprare)\b/;

// ─── Matching ────────────────────────────────────────────────────────────────

function tokenizza(q: string): string[] {
  return q.split(/[^a-z0-9']+/).filter(Boolean);
}

/**
 * Primo vocabolo presente nella richiesta normalizzata. I vocaboli multi-parola
 * sono cercati come sottostringa; quelli singoli come TOKEN intero (così "bar"
 * non matcha "barone" e "pane" non matcha "pannello").
 */
function contiene(q: string, vocaboli: string[]): string | null {
  const token = tokenizza(q);
  for (const v of vocaboli) {
    if (v.includes(" ")) {
      if (q.includes(v)) return v;
    } else if (token.includes(v)) {
      return v;
    } else if (token.some((t) => equivalentiMorfologici(t, v))) {
      // Plurali e forme colloquiali/diminutive: "birre", "birretta",
      // "telefonini", ecc. devono attivare lo stesso intento del lemma.
      return v;
    }
  }
  return null;
}

/** True se esiste almeno una parola "di contenuto" (≥3 caratteri con vocale). */
function haParoleContenuto(q: string): boolean {
  return tokenizza(q).some((t) => t.length >= 3 && /[aeiou]/.test(t));
}

function unici(termini: string[]): string[] {
  return Array.from(new Set(termini.filter(Boolean)));
}

/** Soggetto alimentare concreto della richiesta (per la ricerca prodotti). */
export function soggettoAlimentare(query: string): string | null {
  return contiene(normalizzaRichiesta(query ?? ""), L_FOOD_SOGGETTO);
}

/** Bevanda concreta della richiesta (per la ricerca prodotti drink). */
export function soggettoBevanda(query: string): string | null {
  return contiene(normalizzaRichiesta(query ?? ""), L_DRINK_SOGGETTO);
}

// ─── Classificazione ─────────────────────────────────────────────────────────

function analisi(
  intent: PinoIntent,
  dominio: PinoDominio,
  confidence: PinoConfidence,
  terminiPrioritari: string[],
  usaNegozi: boolean,
  usaProdotti: boolean,
  segnali: string[]
): PinoIntentAnalysis {
  return {
    intent,
    dominio,
    confidence,
    terminiPrioritari: unici(terminiPrioritari),
    usaNegozi,
    usaProdotti,
    segnali,
  };
}

/**
 * Classifica l'intento della richiesta utente.
 *
 * Ordine delle regole:
 *   1. gift   — segnali espliciti di regalo/destinatario;
 *   2. service — professioni e attività di servizio;
 *   3. drink  — bisogno di bere o bevande;
 *   4. food   — bisogno di mangiare (fame/mangiare/cena/...);
 *   5. ricerca esplicita di un bene → product (il dominio food/drink decide le
 *      priorità di recupero delle attività);
 *   6. alimenti/attività alimentari → food;
 *   7. segnali deboli dell'interprete esistente (analizzaRichiesta);
 *   8. nessuna parola di contenuto → generic (nessuna ricerca forzata);
 *   9. altrimenti product con confidence "bassa" (decide il planner LLM).
 */
export function analizzaIntentoPino(query: string): PinoIntentAnalysis {
  const q = normalizzaRichiesta(query ?? "");

  if (!q) {
    return analisi("generic", "nessuno", "alta", [], false, false, ["vuota"]);
  }

  // 1) REGALO
  const gift = contiene(q, L_GIFT);
  if (gift || RE_GIFT_DESTINATARIO.test(q)) {
    return analisi("gift", "gift", "alta", PRIORITA_GIFT, true, true, [
      gift ? `gift:${gift}` : "gift:destinatario",
    ]);
  }

  // 2) SERVIZI / PROFESSIONI
  const service = contiene(q, L_SERVICE);
  if (service) {
    return analisi("service", "service", "alta", [], true, false, [`service:${service}`]);
  }

  // 3) BERE / BEVANDE
  const drinkNeed = contiene(q, L_DRINK_NEED);
  const drinkNoun = contiene(q, L_DRINK);
  if (drinkNeed || drinkNoun) {
    return analisi("drink", "drink", "alta", PRIORITA_DRINK, true, true, [
      drinkNeed ? `drink-need:${drinkNeed}` : `drink:${drinkNoun}`,
    ]);
  }

  // 4) BISOGNO DI MANGIARE
  const foodNeed = contiene(q, L_FOOD_NEED);
  if (foodNeed) {
    return analisi("food", "food", "alta", PRIORITA_FOOD, true, true, [`food-need:${foodNeed}`]);
  }

  // 5) RICERCA ESPLICITA DI UN BENE
  const foodNoun = contiene(q, L_FOOD);
  if (RE_RICERCA_ESPLICITA.test(q)) {
    const dominioFood = Boolean(foodNoun);
    return analisi(
      "product",
      dominioFood ? "food" : "nessuno",
      "alta",
      dominioFood ? PRIORITA_FOOD : [],
      true,
      true,
      ["ricerca-esplicita", ...(foodNoun ? [`dominio-food:${foodNoun}`] : [])]
    );
  }

  // 6) ALIMENTI / ATTIVITÀ ALIMENTARI
  if (foodNoun) {
    return analisi("food", "food", "media", PRIORITA_FOOD, true, true, [`food:${foodNoun}`]);
  }

  // 7) SEGNALI DELL'INTERPRETE ESISTENTE (bisogno riconosciuto senza dominio)
  const intento = analizzaRichiesta(q);
  if (intento.tipo === "bisogno" && intento.intento) {
    // Mappatura ESPLICITA: un intento non mappato prosegue con le regole
    // successive (mai un default arbitrario).
    switch (intento.intento) {
      case "bere":
        return analisi("drink", "drink", "media", PRIORITA_DRINK, true, true, ["interprete:bere"]);
      case "mangiare":
      case "dolce":
        return analisi("food", "food", "media", PRIORITA_FOOD, true, true, [
          `interprete:${intento.intento}`,
        ]);
      case "regalo":
        return analisi("gift", "gift", "media", PRIORITA_GIFT, true, true, ["interprete:regalo"]);
      case "tipico":
        // "prodotti tipici" (es. "pollino", "calabrese"): ricerca di BENI
        // più che di un servizio: prodotti diretti + attività del territorio.
        return analisi("product", "nessuno", "media", [], true, true, ["interprete:tipico"]);
      case "capelli":
      case "automobile":
      case "riparazione":
      case "servizi professionali":
      case "salute":
      case "cuore":
      case "turismo":
        return analisi("service", "service", "media", [], true, false, [
          `interprete:${intento.intento}`,
        ]);
      default:
        break;
    }
  }

  // 8) NESSUN CONTENUTO → nessuna ricerca forzata.
  if (!haParoleContenuto(q)) {
    return analisi("generic", "nessuno", "alta", [], false, false, ["senza-contenuto"]);
  }

  // 9) Nessun segnale di dominio: il planner LLM decide (come prima).
  return analisi("product", "nessuno", "bassa", [], true, true, ["fallback"]);
}

// ─── Piano di ricerca guidato dall'intento ───────────────────────────────────

/**
 * Costruisce il piano di ricerca coerente con l'intento.
 * `generic` non produce alcuna ricerca (nessuna forzatura).
 */
export function pianoIntento(analisi: PinoIntentAnalysis, query: string): PinoToolPlan[] {
  const q = (query ?? "").trim();
  if (!q) return [];

  const negozi = (termine: string): PinoToolPlan => ({ tool: "searchStores", query: termine });
  const prodotti = (termine: string): PinoToolPlan => ({ tool: "searchProducts", query: termine });

  switch (analisi.intent) {
    case "generic":
      return [];

    case "service":
      return [negozi(q)];

    case "gift":
      // Per il regalo NON cerchiamo la frase intera: l'interprete la espande
      // verso "prodotti tipici" e riempirebbe il risultato di botteghe
      // alimentari. Le categorie del regalo bastano e restano pertinenti.
      return [prodotti(q), ...analisi.terminiPrioritari.map(negozi)].slice(0, 7);

    case "drink": {
      // Come per il cibo: i prodotti si cercano SOLO su una bevanda concreta
      // ("birra", "vino"...), non su termini di attività ("bar"): quelli
      // trascinerebbero prodotti casuali.
      const soggetto = soggettoBevanda(q);
      return [
        negozi(q),
        ...analisi.terminiPrioritari.map(negozi),
        ...(soggetto ? [prodotti(q)] : []),
      ].slice(0, 7);
    }

    case "food": {
      const soggetto = soggettoAlimentare(q);
      const termini = unici([...(soggetto ? [soggetto] : []), ...PRIORITA_FOOD]).slice(0, 7);
      return termini.flatMap((t) => [
        negozi(t),
        // I prodotti si cercano SOLO sul soggetto alimentare concreto: i
        // termini generici da attività (panificio, forno, ristorante...) non
        // devono diventare query prodotto (trascinerebbero prodotti casuali).
        ...(soggetto && t === soggetto ? [prodotti(t)] : []),
      ]);
    }

    case "product": {
      if (analisi.dominio === "food") {
        const soggetto = soggettoAlimentare(q);
        const termini = unici([...(soggetto ? [soggetto] : []), ...PRIORITA_FOOD]).slice(0, 7);
        return [prodotti(q), ...termini.map(negozi)];
      }
      return [prodotti(q), negozi(q)];
    }
  }
}

/** Etichetta breve dell'intento, per il prompt del planner e i log. */
export function descriviIntento(analisi: PinoIntentAnalysis): string {
  const dominio = analisi.dominio !== "nessuno" ? ` (dominio: ${analisi.dominio})` : "";
  return `${analisi.intent}${dominio}, confidenza ${analisi.confidence}`;
}
