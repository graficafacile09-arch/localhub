/**
 * Intenti locali che devono essere gestiti dall'Assistente Pino invece del
 * motore catalogo. File puro e condivisibile tra Server e Client Components.
 *
 * È l'UNICO riconoscimento di questi intenti:
 *   - la barra di ricerca (client) usa `isLocalAssistantQuery` per aprire Pino
 *     invece di navigare al catalogo;
 *   - l'assistente (server) usa `pianoIntentoLocale` per scegliere il tool
 *     reale (meteo / farmacie) e non lasciare mai la richiesta al motore
 *     prodotti.
 *
 * Se le due parti usassero regex proprie, una variante scritta diversamente
 * ("com'è il tempo" con l'accento grave, l'apostrofo tipografico "com’è", le
 * maiuscole) verrebbe riconosciuta da una sola delle due e finirebbe comunque
 * nel catalogo, restituendo prodotti assurdi (es. "filetti di cipolla" per una
 * domanda sul tempo). Per questo ogni test passa da `normalizzaRichiesta`.
 */

/**
 * Normalizza la richiesta: minuscole, senza accenti/diacritici, apostrofi
 * uniformati, spazi compattati. Così "com'è il tempo", "com’e il tempo" e
 * "COM'E IL TEMPO" sono la stessa richiesta.
 */
export function normalizzaRichiesta(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const RE_METEO =
  /\b(meteo|previsioni|che tempo fa|com'e il tempo|come e il tempo|come sara il tempo|piove|piovera|temperatura|quanti gradi|gradi ci sono|weather|forecast|what(?:'s| is) the weather|how(?:'s| is) the weather|will it rain|is it raining|temperature|how many degrees|degrees outside)\b/i;

const RE_FARMACIA =
  /\b(farmacia|farmacie)\b.{0,50}\b(aperta|aperte|aperto|aperti|adesso|ora|turno|turno oggi)\b|\b(di turno|farmacia di turno|farmacie di turno)\b|\b(pharmacy|pharmacies)\b.{0,60}\b(open|opened|now|on duty|duty)\b|\b(on duty pharmacy|pharmacy on duty|pharmacies on duty)\b/i;

const RE_SINTOMO =
  /\b(febbre|temperatura alta|mal di gola|raffreddore|influenza|tosse|mal di testa|fever|high temperature|sore throat|cold|flu|cough|headache)\b/i;

/** Stato richiesto per le farmacie (allineato al tool searchPharmacies). */
export type StatoFarmacie = "aperte" | "turno" | "tutte";

/** Piano deterministico dell'intento locale: quale dato reale deve rispondere. */
export type PianoIntentoLocale =
  | { tool: "getWeather" }
  | { tool: "searchPharmacies"; stato: StatoFarmacie };

/**
 * Riconosce l'intento locale e restituisce il tool da usare. `null` = non è un
 * intento locale (ricerca catalogo normale).
 *
 * "farmacia aperta adesso" → SOLO farmacie con stato realmente aperto;
 * "farmacia di turno" e i sintomi ("ho la febbre") → SOLO farmacie con il
 * campo turno realmente valorizzato;
 * "farmacia" da sola → nessun intento: resta una ricerca di catalogo.
 */
export function pianoIntentoLocale(query: string): PianoIntentoLocale | null {
  const q = normalizzaRichiesta(query);
  if (!q) return null;

  if (RE_METEO.test(q)) return { tool: "getWeather" };

  if (RE_FARMACIA.test(q) || RE_SINTOMO.test(q)) {
    const chiedeAperta = /apert|adesso|ora|in questo momento|open|now|right now|currently/i.test(q);
    return { tool: "searchPharmacies", stato: chiedeAperta ? "aperte" : "turno" };
  }

  return null;
}

/** True se la richiesta deve essere gestita da Pino e NON dal catalogo. */
export function isLocalAssistantQuery(query: string): boolean {
  return pianoIntentoLocale(query) !== null;
}

export function isWeatherQuery(query: string): boolean {
  return RE_METEO.test(normalizzaRichiesta(query));
}

export function isPharmacyQuery(query: string): boolean {
  const q = normalizzaRichiesta(query);
  return RE_FARMACIA.test(q) || RE_SINTOMO.test(q);
}
