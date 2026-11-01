/**
 * Regole pure e condivise per il routing di Pino.
 * Nessun accesso a rete, database o provider AI: queste decisioni devono
 * essere deterministiche e testabili prima di eseguire i tool.
 */

const FOOD_PRODUCTS = [
  "pasta", "pane", "pizza", "dolce", "dolci", "gelato", "torta", "torte",
  "biscotti", "formaggio", "salumi", "prosciutto", "carne", "pesce",
  "verdura", "frutta", "olio", "miele", "conserve", "farina", "riso",
  "nutella", "cipolla", "pomodoro", "bread", "noodles", "cake", "cookies", "cheese", "meat", "fish", "vegetables", "fruit", "honey", "flour", "rice", "onion", "tomato",
];

function normalizza(testo: string): string {
  return String(testo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Richiesta esplicita di un alimento come bene da cercare nel catalogo. */
export function isExplicitFoodProductRequest(query: string): boolean {
  const q = normalizza(query);
  if (!q) return false;

  const token = new Set(q.split(/\s+/));
  const hasFoodSubject = FOOD_PRODUCTS.some((term) => token.has(term));
  if (!hasFoodSubject) return false;

  // Una richiesta di ristorazione/consumo non va confusa con un acquisto.
  if (/\b(?:eat|eating|hungry|lunch|dinner|breakfast|snack|mangiare|fame|pranzo|cena|colazione)\b/.test(q)) {
    return false;
  }

  return /\b(?:im looking for|i am looking for|looking for|i want|i need|want|need|find me|show me|can you find|could you find|buy|purchase|shopping for|cerco|cerca|cercando|sto cercando|trovami|trova|compro|comprare|acquistare|vorrei|voglio|mi serve|ho bisogno di)\b/.test(q);
}

/** Richieste generiche in inglese/italiano che chiedono la guida Attrazioni. */
export function isBroadAttractionsRequest(query: string): boolean {
  const q = normalizza(query);
  return /\b(?:cosa vedere|luoghi da vedere|attrazioni?|monumenti?|visitare|dintorni|borghi?|turismo|tour|itinerario|things to see|places to visit|tourist attractions?|sights|what to visit|what can i visit|what should i see|surroundings|nearby places|tourism|itinerary)\b/.test(q);
}
