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

const RE_FARMACIA = /\b(farmacia|farmacie|pharmacy|pharmacies)\b/i;

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
 * "farmacia" da sola → tutte le farmacie censite, senza confonderle con i negozi.
 */
export function pianoIntentoLocale(query: string): PianoIntentoLocale | null {
  const q = normalizzaRichiesta(query);
  if (!q) return null;

  if (RE_METEO.test(q)) return { tool: "getWeather" };

  // Qualunque forma di "farmacia" (singolare, plurale, "cerca farmacia") è un
  // intento locale: la fonte reale è il tool farmacie, non il catalogo negozi.
  // Prima il singolare ricadeva sul catalogo e Pino rispondeva che in InCittà
  // non risultavano farmacie, pur avendo i dati (e il turno) disponibili.
  if (RE_FARMACIA.test(q) || RE_SINTOMO.test(q)) {
    const chiedeAperta = /apert|adesso|ora|in questo momento|open|now|right now|currently/i.test(q);
    const chiedeTurno = /\b(turno|di turno|on duty|duty)\b/i.test(q) || RE_SINTOMO.test(q);
    return {
      tool: "searchPharmacies",
      stato: chiedeAperta ? "aperte" : chiedeTurno ? "turno" : "tutte",
    };
  }

  return null;
}

/** True se la richiesta deve essere gestita da Pino e NON dal catalogo. */
export function isLocalAssistantQuery(query: string): boolean {
  return pianoIntentoLocale(query) !== null || richiestaOraDataPino(query) !== null;
}

/**
 * Il tool meteo restituisce SOLO i dati verificati di Castrovillari. Una
 * richiesta esplicita per un'altra città non deve ricevere quel meteo come se
 * fosse la risposta: qui viene riconosciuta la città non coperta, così il
 * chiamante può dichiararlo invece di inventare una previsione.
 */
const CITTA_COPERTE_METEO = new Set(["castrovillari"]);
const CITTA_NOTE = new Set([
  "roma", "milano", "napoli", "torino", "bologna", "firenze", "bari",
  "palermo", "catania", "venezia", "genova", "cosenza", "matera",
  "potenza", "reggio calabria", "catanzaro", "lamezia terme",
]);
const PAROLE_NON_CITTA = new Set([
  "casa", "mare", "montagna", "campagna", "centro", "citta", "paese",
  "zona", "qui", "qua", "fuori", "domani", "oggi", "stasera", "weekend",
]);

export function cittaMeteoNonCopertaPino(query: string): string | null {
  const originale = String(query ?? "").trim();
  if (!originale) return null;
  const occorrenza = originale.match(/(?:^|\s)(?:a|ad|in|per|di|da)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]*)/i);
  if (!occorrenza) return null;
  const parola = occorrenza[1].trim().split(/\s+/)[0] ?? "";
  if (!parola) return null;
  const citta = normalizzaRichiesta(parola);
  if (!citta || PAROLE_NON_CITTA.has(citta)) return null;
  // Una parola minuscola è ambigua ("a casa", "in centro"): viene trattata
  // come città solo se è un nome noto. Con la maiuscola è un nome proprio.
  const inizialeMaiuscola = /^[A-ZÀ-ÖØ-Ý]/.test(parola);
  if (!inizialeMaiuscola && !CITTA_NOTE.has(citta)) return null;
  if (CITTA_COPERTE_METEO.has(citta)) return null;
  return citta;
}

export function isWeatherQuery(query: string): boolean {
  return RE_METEO.test(normalizzaRichiesta(query));
}

export function isPharmacyQuery(query: string): boolean {
  const q = normalizzaRichiesta(query);
  return RE_FARMACIA.test(q) || RE_SINTOMO.test(q);
}

/**
 * Ora e data sono dati deterministici: non devono passare dal planner né dal
 * modello. Il riconoscimento è volutamente stretto, così «che ora apre il
 * panificio?» resta una domanda sugli orari di un'attività.
 */
export type RichiestaOraDataPino = "ora" | "data" | "entrambe";

const RE_ORA = /\b(?:che ore sono|che ora e|che ore fa|che ora sono|what time is it|what's the time|whats the time)\b/;
const RE_DATA = /\b(?:che giorno e|che giorno siamo|che data e|data di oggi|che giorno e oggi|what day is it|what's the date|whats the date|today's date)\b/;

export function richiestaOraDataPino(query: string): RichiestaOraDataPino | null {
  const q = normalizzaRichiesta(query).replace(/[?.!]+$/g, "");
  if (!q) return null;
  const ora = RE_ORA.test(q);
  const data = RE_DATA.test(q);
  if (ora && data) return "entrambe";
  if (ora) return "ora";
  if (data) return "data";
  return null;
}

/** Risposta deterministica in Europe/Rome, senza modello e senza ricerca. */
export function rispostaOraDataPino(
  query: string,
  now: Date = new Date(),
  lingua: "it" | "en" = "it"
): string | null {
  const richiesta = richiestaOraDataPino(query);
  if (!richiesta) return null;
  const orario = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const data = new Intl.DateTimeFormat(lingua === "en" ? "en-GB" : "it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  if (lingua === "en") {
    if (richiesta === "ora") return `It's ${orario}.`;
    if (richiesta === "data") return `Today is ${data}.`;
    return `Today is ${data}. It's ${orario}.`;
  }
  if (richiesta === "ora") return `Sono le ${orario}.`;
  if (richiesta === "data") return `Oggi è ${data}.`;
  return `Oggi è ${data}. Sono le ${orario}.`;
}
