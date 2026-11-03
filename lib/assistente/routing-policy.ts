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

/**
 * Sottoinsieme INGLESE di `FOOD_PRODUCTS`: sono le stesse parole già presenti
 * nella lista, non un secondo vocabolario. Serve a distinguere una parola
 * singola inglese ("bread") da una parola italiana ("pane"): la prima è già di
 * per sé una richiesta esplicita di quel prodotto, la seconda resta al livello
 * di intento (che cerca anche le attività, come prima).
 */
const ENGLISH_FOOD_PRODUCTS = new Set([
  "bread", "noodles", "cake", "cookies", "cheese", "meat", "fish",
  "vegetables", "fruit", "honey", "flour", "rice", "onion", "tomato",
]);

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

  // Parola singola inglese di alimento: non contiene un verbo, ma non è
  // nemmeno una richiesta di ristorazione (la guardia sopra l'ha già esclusa).
  // Il confronto è per TOKEN ESATTO sul vocabolario già esistente: "bread" sì,
  // "breadsticks" e "breadcrumbs" no (nessuna regex permissiva).
  const parole = q.split(/\s+/).filter(Boolean);
  if (parole.length === 1 && ENGLISH_FOOD_PRODUCTS.has(parole[0])) return true;

  return /\b(?:im looking for|i am looking for|looking for|i want|i need|want|need|find me|show me|can you find|could you find|buy|purchase|shopping for|cerco|cerca|cercando|sto cercando|trovami|trova|compro|comprare|acquistare|vorrei|voglio|mi serve|ho bisogno di)\b/.test(q);
}

/**
 * Richiesta di una sala cinematografica (o di andare al cinema).
 *
 * È un LUOGO/ATTIVITÀ, non un prodotto: deve essere gestita nel dominio
 * attrazioni/servizi e mai trasformata in una ricerca di catalogo. Restano
 * fuori le richieste di eventi/rassegne (già coperte dagli eventi), i prodotti
 * che si usano al cinema (proiettore, TV, DVD..., anche al plurale) e gli
 * abbonamenti.
 */
export function richiestaCinemaPino(query: string): boolean {
  const q = normalizza(query);
  if (!/\b(?:cinema|multisala|movie\s*theat(?:er|re)|movies?)\b/.test(q)) return false;
  // Eventi, rassegne e programmazione seguono il dominio eventi.
  if (/\b(?:eventi|evento|rassegn[ae]|festival|mostr[ae]|concerti?|programma|programmazione|events?)\b/.test(q)) return false;
  // Prodotti e servizi legati al cinema (anche al plurale) e abbonamenti non
  // sono una richiesta di sala: restano nel dominio del catalogo.
  return !/\b(?:proiett\w*|videoproiett\w*|televisor\w*|tv|dvd|blu\s?ray|pellicol[ae]|locandin[ae]|poster|abbonament\w*)\b/.test(q);
}

/** Richieste generiche in inglese/italiano che chiedono la guida Attrazioni. */
export function isBroadAttractionsRequest(query: string): boolean {
  const q = normalizza(query);
  return /\b(?:cosa vedere|luoghi da vedere|attrazioni?|attractions?|monumenti?|monuments?|visitare|dintorni|borghi?|villages?|turismo|tour|itinerario|things to see|places to visit|tourist attractions?|sights|what to visit|what can i visit|what should i see|surroundings|nearby places|tourism|itinerary)\b/.test(q);
}
