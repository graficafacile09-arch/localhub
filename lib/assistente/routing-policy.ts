/**
 * Regole pure e condivise per il routing di Pino.
 * Nessun accesso a rete, database o provider AI: queste decisioni devono
 * essere deterministiche e testabili prima di eseguire i tool.
 */

// I soggetti alimentari (italiani e inglesi) vivono in `lexicon.ts`: un solo
// posto da estendere per tutte le decisioni di routing di Pino.
import { SOGGETTI_ALIMENTARI_PINO, SOGGETTI_ALIMENTARI_INGLESI_PINO } from "./lexicon.ts";

const FOOD_PRODUCTS: readonly string[] = [
  ...SOGGETTI_ALIMENTARI_PINO,
  ...SOGGETTI_ALIMENTARI_INGLESI_PINO,
];

/**
 * Sottoinsieme INGLESE di `FOOD_PRODUCTS`: sono le stesse parole già presenti
 * nella lista, non un secondo vocabolario. Serve a distinguere una parola
 * singola inglese ("bread") da una parola italiana ("pane"): la prima è già di
 * per sé una richiesta esplicita di quel prodotto, la seconda resta al livello
 * di intento (che cerca anche le attività, come prima).
 */
const ENGLISH_FOOD_PRODUCTS = new Set(SOGGETTI_ALIMENTARI_INGLESI_PINO);

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
/**
 * Richiesta di ristorazione: "dove si mangia", "vorrei mangiare qualcosa",
 * "ho fame", "where can I eat". È un bisogno di posti/attività, non una
 * ricerca di prodotti alimentari: senza questa guardia il planner può
 * ripiegare su panifici o studi medici che non rispondono alla domanda.
 */
export function richiestaRistorazionePino(query: string): boolean {
  const q = normalizza(String(query ?? ""));
  if (!q) return false;
  return (
    /\b(?:dove|posto|consigli(?:ami|atemi)?|qual(?:e|i))\b[\s\S]{0,40}\b(?:mangiare|mangia|mangiarsi)\b/.test(q) ||
    /\b(?:dove si mangia|dove mangiare|posto dove mangiare)\b/.test(q) ||
    /\b(?:vorrei|voglio|mi va di|possiamo)\s+mangiare\s+(?:qualcosa|qualche cosa)\b/.test(q) ||
    /\bcosa\s+(?:posso|si\s+puo|si\s+può|potrei)\s+mangiare\b/.test(q) ||
    /\bcosa\s+mangio\b|\bcosa\s+si\s+mangia\b/.test(q) ||
    /\b(?:ho fame|qualcosa da mangiare)\b/.test(q) ||
    /\b(?:where (?:can|should|do) i (?:eat|get something to eat)|where to eat|something to eat|a place to eat)\b/.test(q) ||
    /\b(?:i (?:want|would like) to eat|i m hungry|im hungry|i am hungry)\b/.test(q)
  );
}

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
 * Richiesta commerciale di un prodotto alimentare («Avete l'olio del Pollino?»).
 *
 * Il toponimo da solo non basta a trasformare un acquisto in una visita
 * turistica: senza questa guardia «Avete l'olio extravergine del Pollino?»
 * finiva nella guida Attrazioni e l'utente riceveva il Parco invece dei
 * prodotti. Nessun verbo di acquisto (o nessun soggetto di prodotto) = nessuna
 * esclusione: «Vorrei visitare il Parco Nazionale del Pollino» resta un luogo.
 */
export function richiestaProdottoCommercialePino(query: string): boolean {
  // L'apostrofo diventa spazio: in «l'olio» il soggetto è «olio» e senza
  // questa normalizzazione il token sarebbe «lolio» (nessun prodotto trovato).
  const q = normalizza(String(query ?? "").replace(/[’']/g, " "));
  if (!q) return false;

  const haSoggettoProdotto = FOOD_PRODUCTS.some((term) =>
    new RegExp(`\\b${term}\\b`).test(q)
  );
  if (!haSoggettoProdotto) return false;

  return /\b(?:avete|avete voi|vendete|comprate|cercate|cerco|sto cercando|trovami|mi serve|mi servirebbe|comprare|acquistare|acquisto|ordinare|ordino|prezzo|prezzi|quanto costa|quanto costano|costo|disponibile|disponibili|in vendita|sapete se avete|do you have|do you sell|how much|price|i need|i want|i'm looking for|im looking for)\b/.test(q);
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

// ─── Tabella di routing ──────────────────────────────────────────────────────

/** Domini in cui una richiesta può finire prima di toccare i tool. */
export type DominioRoutingPino =
  | "cinema"
  | "attrazioni"
  | "eventi"
  | "prodotti";

/**
 * Richiesta esplicita di eventi/rassegne: non è una richiesta di visita.
 * Altrimenti parole come «eventi», «concerto» o «cosa succede stasera»
 * finiscono nella guida Attrazioni solo perché la frase contiene la città.
 */
const RE_RICHIESTA_EVENTI_PINO =
  /\b(?:eventi|evento|manifestazion\w*|rassegn\w*|concerti?|sagre?|fiere?|spettacol\w*|festival|events?|what'?s on|what is on|what'?s happening|cosa succede|che succede)\b/i;

/**
 * Parole che indicano un acquisto o un prodotto: «cerco un negozio di articoli
 * per il teatro» non è una visita, anche se contiene «teatro».
 */
const RE_CONTESTO_ACQUISTO_PINO =
  /\b(?:comprare|compro|acquistare|acquisto|negozi[oi]|boutique|commerciale|commerciali|supermercat[oi]|prodott[oi]|shampoo|regal[oi]|prezz[oi]|offerte?|sconti?|vendita|buy|buying|shop|shops|store|stores|malls?|products?|prices?|offers?|discounts?|sale|gifts?)\b/i;

/** Vocabolario dei luoghi/attrazioni (la richiesta chiede la guida). */
const RE_INTENTO_GUIDA_PINO =
  /\b(muse[oi]|monument[oi]|attrazion[ei]|cosa vedere|luoghi da visitare|luoghi da vedere|visitare|palazz[oi]|castell[oi]|chies[ae]|teatr[oi]|biblioteca|archivio|borg[oh]i?|dintorni|centro storico|festival|mostre|parco|itinerario|turistic[oa]|museums?|monuments?|attractions?|things to see|places to visit|visit|palaces?|castles?|churches|theatres?|libraries|archives?|villages?|surroundings|historic center|historic centre|exhibitions?|parks?|itinerary|tourism|tourist|archaeological|amphitheat(?:re|er)s?|ruins?|sites?)\b/i;

type RegolaRoutingPino = {
  dominio: DominioRoutingPino;
  /** Etichetta stabile della regola, utile nei log e nei test. */
  motivo: string;
  quando: (query: string) => boolean;
};

/**
 * Regole in ordine di priorità: la prima che corrisponde decide il dominio.
 *
 * Era una catena di `if` dentro l'orchestratore, con l'ordine implicito nella
 * posizione delle righe. Qui l'ordine è l'array, e aggiungere un dominio
 * significa aggiungere una riga invece di cercare il punto giusto in 3800
 * righe di codice.
 */
export const REGOLE_ROUTING_PINO: readonly RegolaRoutingPino[] = [
  { dominio: "cinema", motivo: "richiesta_cinema", quando: richiestaCinemaPino },
  {
    dominio: "prodotti",
    motivo: "contesto_acquisto",
    quando: (query) => RE_CONTESTO_ACQUISTO_PINO.test(String(query ?? "")),
  },
  {
    dominio: "eventi",
    motivo: "richiesta_eventi",
    quando: (query) => RE_RICHIESTA_EVENTI_PINO.test(normalizza(query)),
  },
  {
    dominio: "prodotti",
    motivo: "prodotto_commerciale",
    quando: richiestaProdottoCommercialePino,
  },
  {
    dominio: "attrazioni",
    motivo: "intento_guida",
    quando: (query) => RE_INTENTO_GUIDA_PINO.test(String(query ?? "")),
  },
];

/**
 * Dominio deciso per una richiesta, con il motivo che l'ha determinato.
 * `null` quando nessuna regola corrisponde: la richiesta resta generica e la
 * gestisce il resto dell'orchestratore.
 */
export function decidiDominioPino(
  query: string
): { dominio: DominioRoutingPino; motivo: string } | null {
  for (const regola of REGOLE_ROUTING_PINO) {
    if (regola.quando(String(query ?? ""))) {
      return { dominio: regola.dominio, motivo: regola.motivo };
    }
  }
  return null;
}
