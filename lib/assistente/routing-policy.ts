/**
 * Regole pure e condivise per il routing di Pino.
 * Nessun accesso a rete, database o provider AI: queste decisioni devono
 * essere deterministiche e testabili prima di eseguire i tool.
 */

import { normalizzaQueryCatalogo } from "./understanding";

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

/**
 * Estrae il soggetto di una richiesta diretta di prodotto.
 * In assenza di un riferimento esplicito a negozi/servizi/luoghi, "voglio X"
 * e "I want X" interrogano solo il catalogo prodotti. Non è un fallback
 * verso negozi: zero prodotti significa zero risultati.
 */
export function directProductQuery(query: string): string | null {
  const q = normalizza(query);
  if (!q) return null;
  if (/\\b(?:sotto|sopra|massimo|minimo|budget|under|below|over|above|between|tra|fino a|entro)\\b/.test(q)) return null;
  if (!/\\b(?:voglio|vorrei|cerco|cercando|sto cercando|mi serve|ho bisogno di|trovami|trova|im looking for|i am looking for|i want|i need|find me|show me|looking for)\\b/.test(q)) return null;

  const subject = normalizzaQueryCatalogo(query);
  if (!subject) return null;
  if (/^(?:andare|vai|to go|go|visitare|visit|mangiare|eat|eating|bere|drink|parlare|talk|chat)\\b/.test(subject)) return null;
  if (/\\b(?:negozio|negozi|attivita|shop|shops|store|stores|business|businesses|ristorante|ristoranti|pizzeria|pizzerie|barbiere|parrucchiere|dentista|commercialista|farmacia|farmacie|cinema|teatro|museo|musei)\\b/.test(subject)) return null;
  return subject;
}

/** Richieste generiche in inglese/italiano che chiedono la guida Attrazioni. */
export function isBroadAttractionsRequest(query: string): boolean {
  const q = normalizza(query);
  return /\b(?:cosa vedere|luoghi da vedere|attrazioni?|attractions?|monumenti?|monuments?|visitare|dintorni|borghi?|villages?|turismo|tour|itinerario|things to see|places to visit|tourist attractions?|sights|what to visit|what can i visit|what should i see|surroundings|nearby places|tourism|itinerary)\b/.test(q);
}
