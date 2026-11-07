/**
 * Pino Unified Understanding
 *
 * Shared, language-agnostic helpers for interpreting natural catalog requests.
 * These helpers deliberately do not invent catalog data: they only normalize
 * wording so the semantic planner and deterministic retrieval can agree.
 */

// Import di solo tipo: nessuna dipendenza a runtime, quindi nessun ciclo con
// `intent` (che non conosce questo modulo).
import type { PinoIntent } from "./intent.ts";

export type PinoLanguage = "it" | "en";

/** Detects an explicit request for a currently open business in Italian or English. */
export function richiestaApertaOra(testo: string): boolean {
  const q = String(testo ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'");
  return /\b(?:aperto|aperta|aperti|aperte)\b.*\b(?:ora|adesso)\b|\b(?:open|opened)\s+(?:right\s+)?now\b|\bcurrently\s+open\b|\bopen\s+at\s+the\s+moment\b/i.test(q);
}

/**
 * «Quanto costa?» / «how much is it?» senza soggetto: è una domanda di
 * chiarimento (o un follow-up sul contesto), non una ricerca di catalogo.
 */
export function richiestaPrezzoSenzaSoggettoPino(testo: string): boolean {
  const q = normalizzaRelazionale(testo);
  if (!q) return false;
  return /^(?:quanto\s+(?:costa|costano|viene|vengono)|how\s+much(?:\s+(?:is|are|does|do))?(?:\s+(?:it|this|that|they|these|those))?|what(?:'s|\s+is)\s+the\s+price)$/.test(q);
}

/**
 * Lingua riconoscibile dal solo testo, oppure `null` quando il messaggio è
 * troppo breve o ambiguo: in quel caso vale la lingua del contesto.
 */
function rilevaLinguaRiconoscibilePino(testo: string): PinoLanguage | null {
  const q = String(testo ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[’‘]/g, "'");
  if (!q.trim()) return null;

  if (/\b(?:cosa cerchi|come posso|puoi aiutarmi|mi puoi aiutare|vorrei sapere|dimmi|che cosa|dove posso|quanto costa|quanto costano|va bene|tutto bene|non trovo|non ho|cerco un|cerco una)\b/.test(q)) return "it";
  if (/\b(?:what do you|how do i|can you help|could you|would you|i'?m looking|i want|i need|please find|show me|tell me|where can i|what'?s up|how much|good morning|good afternoon)\b/.test(q)) return "en";

  const parole = q.match(/[a-z]+/g) ?? [];
  const it = new Set([
    "ciao", "salve", "buongiorno", "buonasera", "cerco", "cerca", "trovami", "trova",
    "voglio", "vorrei", "mi", "serve", "ho", "con", "sotto", "sopra", "entro", "fino",
    "massimo", "minimo", "euro", "negozio", "negozi", "prodotto", "prodotti",
    "orologio", "orologi", "qualcosa", "simile", "costa", "quanto", "aperto", "aperta",
    "vicino", "grazie", "per", "una", "uno", "del", "della", "dei", "delle", "che",
    "come", "stai", "vuoi", "parliamo", "chiacchiere", "scusa", "arrivederci",
    "offerte", "eventi", "farmacia", "farmacie", "meteo", "oggi", "domani",
    "cosa", "cerchi", "dove", "perche", "puoi", "potresti", "aiutami", "aiutarti",
    "dimmi", "sono", "sei", "questo", "questa", "questi", "queste", "altro",
    "altra", "tutto", "bene", "va", "posso", "trovare", "costano", "aprono",
  ]);
  const en = new Set([
    "hi", "hello", "hey", "please", "find", "show", "looking", "want", "need", "have",
    "with", "under", "below", "above", "over", "between", "budget", "dollars", "dollar",
    "euros", "watch", "watches", "something", "similar", "like", "that", "cheaper",
    "cheapest", "open", "now", "near", "nearby", "store", "stores", "shop", "shops",
    "business", "businesses", "product", "products", "thanks", "thank", "you", "the",
    "for", "and", "or", "could", "would", "get", "buy", "i", "my", "it", "how", "are",
    "doing", "well", "do", "does", "did", "can", "we", "will", "what", "who", "where",
    "when", "why", "which", "is", "was", "were", "am", "this", "these", "those",
    "there", "here", "sorry", "apologies", "chat", "talk", "speak", "joke", "funny",
    "tell", "good", "morning", "evening", "afternoon", "night", "goodbye", "bye",
    "see", "later", "perfect", "great", "okay", "only", "offers", "deals", "discounts",
    "events", "pharmacy", "pharmacies", "weather", "forecast", "today", "tomorrow",
    "other", "more", "less", "on", "duty", "up", "sure", "fine", "alright",
    "recommend", "suggest", "help", "restaurants", "restaurant", "cafes", "cafe",
    "food", "drinks", "price", "prices", "cheap", "expensive", "available",
    // Nomi di alimento che esistono solo in inglese: senza questi segnali un
    // messaggio di una sola parola ("cheese") ricadeva sul default italiano.
    // "pasta" e "pizza" restano fuori: sono identiche nelle due lingue e non
    // devono spostare il rilevamento di una frase italiana.
    "bread", "cheese", "cookies", "cookie", "cake", "noodles", "meat",
    "fish", "vegetables", "vegetable", "fruit", "fruits", "honey",
    "flour", "rice", "onion", "onions", "tomato", "tomatoes",
    // S5.1 — categorie e termini turistici inglesi: senza questi segnali una
    // richiesta breve come "Egyptian Museum" ricadeva sull'italiano. Sono
    // parole non ambigue in italiano, quindi non spostano le frasi italiane.
    "museum", "museums", "monument", "monuments", "church", "churches",
    "castle", "castles", "park", "parks", "theatre", "theatres", "theater",
    "theaters", "gallery", "galleries", "archaeological", "historical", "history",
    "ruins", "amphitheatre", "amphitheater", "visit", "visiting", "site", "sites",
    "exhibition", "exhibitions",
  ]);
  const score = (set: Set<string>) => parole.reduce((n, p) => n + (set.has(p) ? 1 : 0), 0);
  const si = score(it);
  const se = score(en);
  if (se > si) return "en";
  if (si > se) return "it";

  if (/\b(?:how are you|how's it going|how is it going|would you|do you|can we|let'?s|thank you|you are|are you|see you|good morning|good evening)\b/.test(q)) return "en";
  if (/\b(?:come stai|come va|ti va|vuoi|grazie|buongiorno|buonasera|ciao)\b/.test(q)) return "it";
  return null;
}

/** Lingua dominante del messaggio; il fallback vale solo se il testo non la rivela. */
export function rilevaLinguaPino(testo: string, fallback: PinoLanguage = "it"): PinoLanguage {
  return rilevaLinguaRiconoscibilePino(testo) ?? fallback;
}

/**
 * Lingua della conversazione: ogni messaggio riconoscibile aggiorna la lingua,
 * mentre un messaggio troppo breve o ambiguo eredita quella corrente.
 */
export function rilevaLinguaConversazionePino(
  messages: Array<{ role: string; content: string }>,
  fallback: PinoLanguage = "it"
): PinoLanguage {
  let lingua = fallback;
  for (const message of messages ?? []) {
    if (message?.role !== "user" || typeof message.content !== "string") continue;
    // Una preferenza linguistica esplicita vale per il messaggio che la
    // contiene: "vorrei parlare in inglese" rende inglese la conversazione
    // anche se la frase, presa da sola, sembra italiana.
    const preferenza = rilevaPreferenzaLinguaPino(message.content);
    if (preferenza) {
      lingua = preferenza.lingua;
      continue;
    }
    // Ogni messaggio può cambiare lingua: la lingua riconoscibile del nuovo
    // messaggio vince sul resto della conversazione. Solo un messaggio troppo
    // breve o ambiguo eredita la lingua corrente (contesto, non preferenza).
    // "I speak English" → "bread" → "voglio il pane" finisce in italiano.
    const rilevata = rilevaLinguaRiconoscibilePino(message.content);
    if (rilevata) lingua = rilevata;
  }
  return lingua;
}

/** Distanza di Levenshtein fra due stringhe già normalizzate. */
function distanzaLevenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = old;
    }
  }
  return prev[b.length];
}

function haLetteraDoppia(testo: string): boolean {
  return /(.)\1/.test(testo);
}

/**
 * Corregge un singolo token verso il vocabolario del catalogo SOLO quando la
 * differenza è un refuso plausibile. Restituisce `null` se non c'è una
 * correzione affidabile.
 *
 * Regole (tutte necessarie, perché una parola italiana valida non deve mai
 * diventare un'altra parola del catalogo):
 *   - la prima lettera non cambia: "cane" NON è un refuso di "pane" e
 *     "voglio" NON è un refuso di "aglio";
 *   - una sola modifica è ammessa, ma inserimento/cancellazione valgono solo
 *     per lettere doppie ("orologgio" → "orologio"): così "carta" non
 *     diventa "carota";
 *   - due modifiche solo a parità di lunghezza e da 6 caratteri in su
 *     (sostituzioni/scambi), come nella soglia precedente.
 */
export function correggiTokenCatalogo(
  token: string,
  vocabolario: Iterable<[string, string]>
): string | null {
  const lower = String(token ?? "").toLocaleLowerCase("it-IT");
  if (!/^[a-z\u00e0-\u00f6\u00f8-\u00ff]+$/i.test(lower) || lower.length < 4) return null;

  let migliore: string | null = null;
  let miglioreDistanza = Infinity;
  for (const [parola, canonico] of vocabolario) {
    if (parola === lower) return null;
    if (Math.abs(parola.length - lower.length) > 2) continue;
    if (parola[0] !== lower[0]) continue;
    const distanza = distanzaLevenshtein(lower, parola);
    const soglia = lower.length <= 5 ? 1 : 2;
    if (distanza > soglia || distanza >= miglioreDistanza) continue;
    const stessaLunghezza = parola.length === lower.length;
    const refusoPlausibile =
      distanza === 1
        ? stessaLunghezza || haLetteraDoppia(lower) || haLetteraDoppia(parola)
        : stessaLunghezza;
    if (!refusoPlausibile) continue;
    migliore = canonico;
    miglioreDistanza = distanza;
  }
  return migliore;
}

/**
 * Vero se `candidato` è un refuso plausibile di `parola` (una sola modifica).
 *
 * La prima lettera non cambia mai: è ciò che impedisce a "cane" di essere
 * trattato come refuso di "pane". Per inserimenti e cancellazioni si richiede
 * una parola di almeno 7 caratteri: così "carta" non viene scambiata per
 * "carota" e le parole italiane corte non vengono "corrette" a forza.
 */
export function refusoPlausibile(parola: string, candidato: string): boolean {
  const a = String(parola ?? "").toLocaleLowerCase("it-IT");
  const b = String(candidato ?? "").toLocaleLowerCase("it-IT");
  if (!/^[a-z\u00e0-\u00f6\u00f8-\u00ff]+$/i.test(a) || !/^[a-z\u00e0-\u00f6\u00f8-\u00ff]+$/i.test(b)) return false;
  if (a.length < 4 || b.length < 4 || a === b || a[0] !== b[0]) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (distanzaLevenshtein(a, b) !== 1) return false;
  if (a.length === b.length) return haLetteraDoppia(a) || haLetteraDoppia(b);
  return Math.min(a.length, b.length) >= 7;
}

// ─── S3: comprensione strutturata (lingua, attributi, soggetto) ──────────────
// Contratto unico per il livello di comprensione: cosa vuole l'utente, in quale
// lingua, su quale soggetto e con quali attributi. Le informazioni sulle
// preferenze linguistiche NON sono dati di ricerca: un messaggio che parla solo
// di lingua non deve produrre alcuna query di catalogo.

export type PinoPreferenzaLingua = {
  lingua: PinoLanguage;
  /** true = il messaggio parla SOLO di lingua: nessuna richiesta da eseguire. */
  soloLingua: boolean;
};

/**
 * Forma normalizzata usata dai riconoscitori conversazionali: minuscole, senza
 * accenti, apostrofi uniformati, punteggiatura ridotta a spazi.
 */
export function normalizzaRelazionale(testo: string): string {
  return String(testo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b2\b/g, "due")
    .replace(/\bkiacchiere\b/g, "chiacchiere");
}

const RE_PREFERENZA_INGLESE: RegExp[] = [
  /\b(?:i|we)\s+(?:can\s+|only\s+)?(?:speak|talk|write|reply|respond)\s+(?:only\s+)?(?:in\s+)?english\b/,
  /\b(?:speak|reply|respond|answer|talk|write)\s+english\b/,
  /\benglish\s+please\b/,
  /\b(?:speak|reply|respond|answer|talk|write|continue)\s+(?:to\s+me\s+|with\s+me\s+)?in\s+english\b/,
  /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:speak|reply|respond|answer|talk|write|continue)\b.{0,30}\bin\s+english\b/,
  /\b(?:non\s+parlo\s+italiano|parlo\s+(?:solo\s+)?inglese|i\s+don'?t\s+speak\s+italian)\b/,
  /\b(?:vorrei|voglio|preferisco|mi\s+piacerebbe|puoi|potresti|parliamo|possiamo)\b.{0,30}\b(?:parlare|rispondere|rispondi|scrivere|continuare|proseguire)\b.{0,20}\bin\s+inglese\b/,
  /\b(?:parla|rispondi|scrivi|continua|continuiamo|proseguiamo)\s+(?:mi\s+)?in\s+inglese\b/,
  /\bin\s+inglese\s+(?:per\s+favore|grazie)\b/,
];

const RE_PREFERENZA_ITALIANA: RegExp[] = [
  /\b(?:i|we)\s+(?:can\s+|only\s+)?(?:speak|talk|write|reply|respond)\s+(?:only\s+)?(?:in\s+)?italian\b/,
  /\b(?:speak|reply|respond|answer|talk|write)\s+italian\b/,
  /\bitalian\s+please\b/,
  /\b(?:speak|reply|respond|answer|talk|write|continue)\s+(?:to\s+me\s+|with\s+me\s+)?in\s+italian\b/,
  /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:speak|reply|respond|answer|talk|write|continue)\b.{0,30}\bin\s+italian\b/,
  /\b(?:non\s+parlo\s+inglese|parlo\s+(?:solo\s+)?italiano|i\s+don'?t\s+speak\s+english)\b/,
  /\b(?:vorrei|voglio|preferisco|mi\s+piacerebbe|puoi|potresti|parliamo|possiamo)\b.{0,30}\b(?:parlare|rispondere|rispondi|scrivere|continuare|proseguire)\b.{0,20}\bin\s+italiano\b/,
  /\b(?:parla|rispondi|scrivi|continua|continuiamo|proseguiamo)\s+(?:mi\s+)?in\s+italiano\b/,
  /\bin\s+italiano\s+(?:per\s+favore|grazie)\b/,
];

// Parole che compongono la comunicazione sulla lingua: se resta qualcosa di
// diverso, il messaggio contiene anche una richiesta e non è solo preferenza.
const RIEMPITIVI_LINGUA = new Set([
  "i", "we", "you", "can", "could", "would", "will", "do", "does", "am", "is", "it",
  "please", "only", "just", "speak", "speaking", "talk", "write", "reply", "respond",
  "answer", "continue", "in", "english", "italian", "italiano", "inglese", "a", "an",
  "the", "to", "me", "with", "for", "and", "of", "my", "i'd", "id", "like", "want",
  "don't", "dont", "non", "parlo", "solo", "capisco", "preferisco", "vorrei", "voglio",
  "mi", "piacerebbe", "puoi", "potresti", "parliamo", "possiamo", "parlare", "rispondere",
  "rispondi", "scrivere", "scrivi", "continua", "continuiamo", "continuare", "proseguire",
  "proseguiamo", "parla", "per", "favore", "grazie", "ciao", "salve", "buongiorno",
  "buonasera", "hi", "hello", "hey", "pino", "si", "sì", "ok", "va", "bene", "pure",
]);

/**
 * Riconosce una comunicazione sulla lingua della conversazione. Non è un elenco
 * di frasi memorizzate: serve un verbo di lingua riferito a italiano/inglese e
 * nessun altro contenuto di ricerca. "I speak English and I'm looking for
 * pasta" resta una richiesta di catalogo, con la lingua inglese come
 * preferenza (`soloLingua: false`).
 */
export function rilevaPreferenzaLinguaPino(input: string): PinoPreferenzaLingua | null {
  const q = normalizzaRelazionale(input);
  if (!q) return null;
  const inglese = RE_PREFERENZA_INGLESE.some((re) => re.test(q));
  const italiano = !inglese && RE_PREFERENZA_ITALIANA.some((re) => re.test(q));
  if (!inglese && !italiano) return null;
  const residuo = q.split(/\s+/).filter((t) => t && !RIEMPITIVI_LINGUA.has(t));
  return {
    lingua: inglese ? "en" : "it",
    soloLingua: !residuo.some((t) => t.length >= 3),
  };
}

/** Attributi descrittivi riconosciuti: non identificano il soggetto. */
export type PinoAttributi = {
  /** Colori, in forma canonica italiana ("black" → "nero"). */
  colori: string[];
  /** Materiali, in forma canonica italiana ("leather" → "pelle"). */
  materiali: string[];
  /** Destinatario esplicito ("donna", "bambino", "madre", …). */
  destinatario: string | null;
  /** Età dichiarata ("una donna di 30 anni" → 30). */
  eta: number | null;
  /** Provenienza dichiarata ("calabrese", "italiano", "locale"). */
  provenienza: string[];
  /** Taglie dichiarate: parole ("media") o valori ("m", "xl", "42"). */
  taglie: string[];
  /** Genere esplicito ("uomo", "donna", "unisex"). */
  genere: string | null;
  /** Altre qualità esplicite ("artigianale", "elegante"). */
  altri: string[];
};

/** Attributi vuoti: nessun attributo inventato quando l'utente non ne parla. */
export function attributiVuotiPino(): PinoAttributi {
  return {
    colori: [],
    materiali: [],
    destinatario: null,
    eta: null,
    provenienza: [],
    taglie: [],
    genere: null,
    altri: [],
  };
}

const COLORI_PINO: Array<[string, string[]]> = [
  ["nero", ["nero", "nera", "neri", "nere", "black"]],
  ["bianco", ["bianco", "bianca", "bianchi", "bianche", "white"]],
  ["rosso", ["rosso", "rossa", "rossi", "rosse", "red"]],
  ["blu", ["blu", "blue", "navy"]],
  ["verde", ["verde", "verdi", "green"]],
  ["giallo", ["giallo", "gialla", "gialli", "gialle", "yellow"]],
  ["grigio", ["grigio", "grigia", "grigi", "grigie", "grey", "gray"]],
  ["marrone", ["marrone", "marroni", "brown"]],
  ["beige", ["beige"]],
  ["rosa", ["rosa", "pink"]],
  ["viola", ["viola", "purple"]],
  ["arancione", ["arancione", "arancio", "orange"]],
  ["argento", ["argento", "argenta", "silver"]],
  ["oro", ["oro", "dorato", "dorata", "gold"]],
];

const MATERIALI_PINO: Array<[string, string[]]> = [
  ["pelle", ["pelle", "cuoio", "leather"]],
  ["cotone", ["cotone", "cotton"]],
  ["lana", ["lana", "wool"]],
  ["seta", ["seta", "silk"]],
  ["lino", ["lino", "linen"]],
  ["metallo", ["metallo", "metal"]],
  ["legno", ["legno", "wood"]],
  ["vetro", ["vetro", "glass"]],
  ["ceramica", ["ceramica", "ceramic"]],
  ["acciaio", ["acciaio", "steel"]],
  ["plastica", ["plastica", "plastic"]],
  ["alluminio", ["alluminio", "aluminium", "aluminum"]],
  ["tessuto", ["tessuto", "tessuti", "fabric", "textile"]],
  ["velluto", ["velluto", "velvet"]],
  ["denim", ["denim", "jeans"]],
];

export const DESTINATARI_PINO: Array<[string, string[]]> = [
  ["donna", ["donna", "donne", "woman", "women", "her"]],
  ["uomo", ["uomo", "uomini", "man", "men", "him"]],
  ["bambina", ["bambina", "bambine", "girl"]],
  ["bambino", ["bambino", "bambini", "boy", "child", "kid"]],
  ["madre", ["madre", "mamma", "mother", "mom"]],
  ["padre", ["padre", "papa", "father", "dad"]],
  ["moglie", ["moglie", "wife"]],
  ["marito", ["marito", "husband"]],
  ["fidanzata", ["fidanzata", "girlfriend"]],
  ["fidanzato", ["fidanzato", "boyfriend"]],
  ["amica", ["amica"]],
  ["amico", ["amico"]],
  ["nonna", ["nonna", "grandmother"]],
  ["nonno", ["nonno", "grandfather"]],
  ["famiglia", ["famiglia", "family"]],
  ["coppia", ["coppia", "couple"]],
];

// Taglie: parole e valori. Le lettere e i numeri valgono solo dopo "taglia"/"size"
// (vedi estrazione), per non trasformare in taglia una parola qualsiasi.
const TAGLIE_PINO: Array<[string, string[]]> = [
  ["piccolo", ["piccolo", "piccola", "piccoli", "piccole", "small"]],
  ["medio", ["medio", "media", "medi", "medie", "medium"]],
  ["grande", ["grande", "grandi", "large", "big"]],
];

const GENERE_PINO: Array<[string, string[]]> = [
  ["uomo", ["uomo", "uomini", "maschile", "maschio", "man", "men", "male"]],
  ["donna", ["donna", "donne", "femminile", "femmina", "woman", "women", "female"]],
  ["unisex", ["unisex"]],
];

// Valori di taglia riconoscibili solo con un marcatore esplicito accanto.
const MARCA_TAGLIA = new Set(["taglia", "taglie", "size", "sizes", "tg"]);
const VALORI_TAGLIA = new Set(["xs", "s", "m", "l", "xl", "xxl"]);

const PROVENIENZE_PINO: Array<[string, string[]]> = [
  ["calabrese", ["calabrese", "calabresi", "calabria"]],
  ["italiano", ["italiano", "italiana", "italiani", "italiane", "italian", "italy"]],
  ["locale", ["locale", "local", "locali"]],
];

const ALTRI_ATTRIBUTI_PINO: Array<[string, string[]]> = [
  ["artigianale", ["artigianale", "artigianali", "handmade", "handcrafted"]],
  ["elegante", ["elegante", "eleganti", "elegant"]],
];

function mappaAttributi(gruppi: Array<[string, string[]]>): Map<string, string> {
  const mappa = new Map<string, string>();
  for (const [canonico, varianti] of gruppi) {
    for (const variante of varianti) mappa.set(variante, canonico);
  }
  return mappa;
}

const MAPPA_COLORI = mappaAttributi(COLORI_PINO);
const MAPPA_MATERIALI = mappaAttributi(MATERIALI_PINO);
const MAPPA_DESTINATARI = mappaAttributi(DESTINATARI_PINO);
const MAPPA_TAGLIE = mappaAttributi(TAGLIE_PINO);
const MAPPA_GENERE = mappaAttributi(GENERE_PINO);
const MAPPA_PROVENIENZE = mappaAttributi(PROVENIENZE_PINO);
const MAPPA_ALTRI = mappaAttributi(ALTRI_ATTRIBUTI_PINO);

/**
 * Vocabolario canonico degli attributi descrittivi: parole che descrivono un
 * articolo senza identificarlo ("borsa" resta il soggetto in "borsa di pelle
 * nera"). È la **fonte unica** per `soggettoPrincipalePino` (tools.ts), che
 * prima manteneva una propria copia parziale.
 *
 * Comprende colori, materiali, destinatari, taglie e genere. Provenienza e
 * qualità ("calabrese", "artigianale") restano in `PinoAttributi` ma non in
 * questo insieme: non devono cambiare il soggetto del gate.
 */
export const ATTRIBUTI_DESCRITTIVI_PINO: ReadonlySet<string> = new Set([
  ...MAPPA_COLORI.keys(),
  ...MAPPA_MATERIALI.keys(),
  ...MAPPA_DESTINATARI.keys(),
  ...MAPPA_TAGLIE.keys(),
  ...MAPPA_GENERE.keys(),
  ...VALORI_TAGLIA,
]);

function normalizzaAttributi(testo: string): string {
  return String(testo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Forma canonica di un colore o materiale del vocabolario Pino
 * ("nere" → "nero", "leather" → "pelle"). Restituisce `null` per le voci che
 * non sono colori né materiali ("glutine", "alcolica"): le esclusioni generiche
 * restano invariate.
 *
 * Serve a confrontare ciò che l'utente chiede positivamente con ciò che
 * esclude: senza questa forma comune "non nere" e `colori: ["nero"]` sarebbero
 * due stringhe diverse e l'attributo negato resterebbe un requisito.
 */
export function attributoCanonicoPino(voce: string): string | null {
  const testo = normalizzaAttributi(voce);
  if (!testo) return null;
  const diretto = MAPPA_COLORI.get(testo) ?? MAPPA_MATERIALI.get(testo);
  if (diretto) return diretto;
  for (const token of testo.split(" ")) {
    const colore = MAPPA_COLORI.get(token);
    if (colore) return colore;
    const materiale = MAPPA_MATERIALI.get(token);
    if (materiale) return materiale;
  }
  return null;
}

// Negazioni che possono introdurre un attributo escluso ("non nere",
// "senza pelle", "without leather", "not made of plastic").
const NEGAZIONI_ATTRIBUTO = new Set(["non", "senza", "without", "not", "no"]);

// Parole che possono stare tra la negazione e il termine negato senza
// interromperla (preposizioni, articoli, costrutti inglesi).
const CONNETTORI_NEGAZIONE_ATTRIBUTO = new Set([
  "in", "di", "del", "dello", "della", "dei", "degli", "delle", "da",
  "con", "a", "al", "allo", "alla", "ai", "agli", "alle", "su",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
  "the", "an", "of", "from", "with", "made", "out", "fatto", "fatta", "materiale",
]);

// Confini espliciti: chiudono la negazione. "non rosse ma nere" → il nero è un
// requisito positivo; "senza pelle e nera" → il nero resta un attributo.
const CONFINE_NEGAZIONE_ATTRIBUTO = new Set([
  "ma", "but", "pero", "anzi", "invece", "e", "ed", "and", "eccetto", "tranne", "except",
]);

/**
 * Estrae gli attributi ESPLICITAMENTE citati dall'utente. Nessun attributo viene
 * dedotto: se la frase non nomina un colore, `colori` resta vuoto.
 *
 * Un colore o materiale che compare dentro una negazione ("scarpe non nere",
 * "borsa without leather") NON è un requisito positivo: appartiene alla clausola
 * negata e il suo posto è nelle esclusioni del piano. Gli attributi positivi di
 * una parte indipendente della frase restano ("borsa nera non in tessuto" →
 * nero richiesto, tessuto escluso).
 */
export function estraiAttributiPino(input: string): PinoAttributi {
  const q = normalizzaAttributi(input);
  if (!q) return attributiVuotiPino();
  const tokens = q.split(" ").filter(Boolean);
  const attributi = attributiVuotiPino();
  const visto = (lista: string[], valore: string) => {
    if (!lista.includes(valore)) lista.push(valore);
  };

  // Stato della negazione: copre connettori e attributi adiacenti
  // ("non in pelle nera"), termina su un confine o su una parola di contenuto
  // diversa ("non voglio spendere, cerco una borsa nera" → il nero è positivo).
  let negazione = false;
  let consumatoNegato = false;
  const eAttributoColoreMateriale = (token: string) =>
    Boolean(MAPPA_COLORI.get(token) || MAPPA_MATERIALI.get(token));

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const precedente = i > 0 ? tokens[i - 1] : "";

    if (CONFINE_NEGAZIONE_ATTRIBUTO.has(token)) {
      negazione = false;
      consumatoNegato = false;
    } else if (NEGAZIONI_ATTRIBUTO.has(token)) {
      negazione = true;
      consumatoNegato = false;
      continue;
    } else if (negazione) {
      if (CONNETTORI_NEGAZIONE_ATTRIBUTO.has(token)) continue;
      if (eAttributoColoreMateriale(token)) {
        consumatoNegato = true;
        continue;
      }
      if (!consumatoNegato) {
        consumatoNegato = true;
        continue;
      }
      negazione = false;
      consumatoNegato = false;
    }

    const colore = MAPPA_COLORI.get(token);
    if (colore) visto(attributi.colori, colore);
    const materiale = MAPPA_MATERIALI.get(token);
    if (materiale) visto(attributi.materiali, materiale);
    const provenienza = MAPPA_PROVENIENZE.get(token);
    if (provenienza) visto(attributi.provenienza, provenienza);
    const altro = MAPPA_ALTRI.get(token);
    if (altro) visto(attributi.altri, altro);
    // Il destinatario è unico: vince il primo esplicito ("per mia madre").
    const destinatario = MAPPA_DESTINATARI.get(token);
    if (destinatario && !attributi.destinatario) attributi.destinatario = destinatario;
    // Genere: prima occorrenza esplicita ("da donna", "for men", "unisex").
    const genere = MAPPA_GENERE.get(token);
    if (genere && !attributi.genere) attributi.genere = genere;
    // Taglie: parole sempre riconosciute, valori ("m", "xl", "42") solo dopo un
    // marcatore esplicito, per non trattare come taglia una parola qualsiasi.
    const tagliaParola = MAPPA_TAGLIE.get(token);
    if (tagliaParola) visto(attributi.taglie, tagliaParola);
    if (
      MARCA_TAGLIA.has(precedente) &&
      (VALORI_TAGLIA.has(token) || /^\d{2}$/.test(token))
    ) {
      visto(attributi.taglie, token);
    }
  }

  const eta =
    q.match(/\b(\d{1,3})\s*(?:anni|anno|years?|year)\b/) ??
    q.match(/\b(\d{1,3})\s+year\s+old\b/);
  if (eta) {
    const anni = Number(eta[1]);
    if (Number.isFinite(anni) && anni > 0 && anni <= 120) attributi.eta = anni;
  }

  return attributi;
}

// Parole che non sono soggetto: cornice conversazionale, lingua, attributi,
// unità di tempo e valute. Servono a distinguere "borsa" da "pelle nera".
const STOPWORD_COMPRENSIONE = new Set([
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "del", "della", "dei",
  "delle", "degli", "dello", "al", "alla", "alle", "allo", "agli", "ai", "di", "da",
  "in", "con", "su", "per", "tra", "fra", "che", "cosa", "quale", "quali", "come",
  "e", "ed", "o", "cerco", "cerca", "cercando", "vorrei", "voglio", "serve", "mi",
  "bisogno", "comprare", "compro", "acquistare", "trova", "trovami", "dammi", "anzi",
  "consigliami", "consigli", "consiglia", "suggerisci", "suggeriscimi", "mostrami",
  "fammi", "vedere", "recommend", "suggest",
  "invece", "non", "senza", "not", "without", "no", "the", "a", "an", "and", "or", "of", "for", "with", "to",
  "on", "some", "any", "please", "looking", "want", "need", "show", "find", "me", "i",
  "buy", "purchase", "get", "my", "speak", "speaking", "english", "italian", "inglese",
  "italiano", "parlare", "parlo", "reply", "respond", "answer", "language", "lingua",
  "euro", "euros", "eur", "anni", "anno", "years", "year", "old", "giorni", "giorno",
  "ore", "ora", "settimana", "settimane", "mesi", "mese", "minuti",
  "taglia", "taglie", "size", "sizes", "tg",
]);

/**
 * Soggetto della richiesta: primo termine di contenuto dopo aver tolto cornice,
 * lingua, attributi, numeri e valute. Non è una query di retrieval: il piano
 * semantico continua a usare la propria query, attributi compresi.
 */
export function estraiSoggettoPino(input: string): string {
  const q = normalizzaQueryCatalogo(input);
  if (!q) return "";
  const token = q.split(/[^a-z0-9]+/).filter(Boolean);
  const contenuto = token.find(
    (t) =>
      t.length >= 3 &&
      !/^\d+([.,]\d+)?$/.test(t) &&
      !STOPWORD_COMPRENSIONE.has(t) &&
      !MAPPA_COLORI.has(t) &&
      !MAPPA_MATERIALI.has(t) &&
      !MAPPA_DESTINATARI.has(t) &&
      !MAPPA_TAGLIE.has(t) &&
      !MAPPA_GENERE.has(t) &&
      !MAPPA_PROVENIENZE.has(t) &&
      !MAPPA_ALTRI.has(t)
  );
  return contenuto ?? "";
}

/**
 * Contratto del livello di comprensione di Pino.
 *
 * Riutilizza le informazioni già prodotte dai livelli esistenti (lingua,
 * intento, piano semantico) e aggiunge solo ciò che mancava: la preferenza
 * linguistica esplicita, gli attributi strutturati e il soggetto distinto dagli
 * attributi. Nessun campo duplica un dato già presente.
 */
export type PinoUnderstanding = {
  /** Lingua effettiva della conversazione (preferenza inclusa). */
  lingua: PinoLanguage;
  /** Lingua richiesta esplicitamente dall'utente, se presente. */
  linguaPreferita: PinoLanguage | null;
  /** true = solo preferenza linguistica: nessuna ricerca da eseguire. */
  languagePreferenceOnly: boolean;
  /** Intento riconosciuto dal livello `intent` (nessuna nuova tassonomia). */
  intent: PinoIntent;
  /** Soggetto identificante, senza attributi ("borsa" in "borsa di pelle nera"). */
  soggetto: string;
  /** Attributi esplicitamente citati (colore, materiale, destinatario, …). */
  attributi: PinoAttributi;
  /** Esclusioni esplicite riconosciute dal piano ("non alimentare"). */
  esclusioni: string[];
  /** Budget indicativo: preferenza secondo D-1, non filtro. */
  minPrice: number | null;
  maxPrice: number | null;
};

/**
 * Removes conversational scaffolding and price clauses from a catalog query.
 * It preserves the actual subject and useful attributes; price values must be
 * extracted separately before this helper is used.
 */
export function normalizzaQueryCatalogo(testo: string): string {
  let q = String(testo ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return "";

  // Articoli elisi ("l'olio", "dell'olio"): il catalogo non li usa come
  // keyword e impedivano il riconoscimento del soggetto nel piano locale.
  q = q.replace(/\b(?:l|dell|all|nell|sull|dall|coll)\s*['’]\s*/g, " ");

  // Normalize common cross-language catalog vocabulary before deterministic retrieval.
  // The semantic planner handles arbitrary phrasing; this shared bridge prevents
  // a valid English subject from reaching an Italian-only catalog untranslated.
  const traduzioni: Array<[RegExp, string]> = [
    [/\b(?:wristwatches|wristwatch|watches|watch)\b/gi, "orologio"],
    [/\b(?:shoes|shoe)\b/gi, "scarpe"],
    [/\b(?:wallets|wallet)\b/gi, "portafoglio"],
    [/\b(?:handbags|handbag|purses|purse|bags|bag)\b/gi, "borsa"],
    [/\b(?:phones|phone|cellphones|cellphone)\b/gi, "telefono"],
    [/\b(?:laptops|laptop|notebooks|notebook)\b/gi, "computer portatile"],
    [/\b(?:headphones|earphones|earbuds)\b/gi, "cuffie"],
    [/\b(?:jackets|jacket|coats|coat)\b/gi, "giacca"],
    [/\b(?:dresses|dress)\b/gi, "vestito"],
    [/\b(?:shirts|shirt|t-shirts|t-shirt|tshirts|tshirt)\b/gi, "maglietta"],
    [/\b(?:jeans)\b/gi, "jeans"],
    [/\b(?:sunglasses)\b/gi, "occhiali da sole"],
    [/\b(?:perfumes|perfume)\b/gi, "profumo"],
    [/\b(?:backpacks|backpack)\b/gi, "zaino"],
    // Alimenti: il catalogo è in italiano, quindi il soggetto inglese deve
    // arrivare al retrieval già tradotto. Solo parole intere (\b) e solo nomi
    // di alimento: nessuna traduzione parziale che possa alterare parole più
    // lunghe o nomi di prodotto ("breadsticks" resta intatto).
    [/\bbread\b/gi, "pane"],
    [/\bcheese\b/gi, "formaggio"],
    [/\bmeat\b/gi, "carne"],
    [/\bfish\b/gi, "pesce"],
    [/\bvegetables\b/gi, "verdura"],
    [/\bvegetable\b/gi, "verdura"],
    [/\bfruits\b/gi, "frutta"],
    [/\bfruit\b/gi, "frutta"],
    [/\bhoney\b/gi, "miele"],
    [/\bflour\b/gi, "farina"],
    [/\brice\b/gi, "riso"],
    [/\bonions\b/gi, "cipolla"],
    [/\bonion\b/gi, "cipolla"],
    [/\btomatoes\b/gi, "pomodoro"],
    [/\btomato\b/gi, "pomodoro"],
    [/\bcookies\b/gi, "biscotti"],
    [/\bcookie\b/gi, "biscotto"],
    [/\bcake\b/gi, "torta"],
    [/\bnoodles\b/gi, "pasta"],
    [/\b(?:leather strap|leather band)\b/gi, "cinturino in pelle"],
    [/\b(?:leather)\b/gi, "pelle"],
    [/\b(?:men's|mens|for men)\b/gi, "da uomo"],
    [/\b(?:women's|womens|for women)\b/gi, "da donna"],
    [/\bwith\b/gi, "con"],
  ];
  for (const [pattern, sostituzione] of traduzioni) q = q.replace(pattern, sostituzione);

  // Una preferenza linguistica è una comunicazione sulla conversazione, non un
  // termine di catalogo: "I speak English and I'm looking for pasta" deve
  // interrogare il catalogo per "pasta", non per "speak english". Le formule
  // ambigue ("un libro in inglese") restano intatte: qui si rimuovono solo le
  // costruzioni con un verbo di lingua.
  const preferenzeLingua: RegExp[] = [
    /\b(?:i|we)\s+(?:can\s+|only\s+)?(?:speak|talk|write|reply|respond)\s+(?:only\s+)?(?:in\s+)?(?:english|italian)\b/gi,
    /\b(?:speak|reply|respond|answer|talk|write)\s+(?:english|italian)\b/gi,
    /\b(?:please\s+)?(?:answer|reply|respond|speak|write|continue)\s+(?:to\s+me\s+|with\s+me\s+)?in\s+(?:english|italian)\b/gi,
    /\b(?:english|italian)\s+please\b/gi,
    /\b(?:vorrei|voglio|preferisco|mi\s+piacerebbe|puoi|potresti|parliamo|possiamo)\b.{0,30}\b(?:parlare|rispondere|rispondi|scrivere|continuare|proseguire)\b.{0,20}\bin\s+(?:inglese|italiano)\b/gi,
    /\b(?:parla|rispondi|scrivi|continua|continuiamo|proseguiamo)\s+(?:mi\s+)?in\s+(?:inglese|italiano)\b/gi,
    /\bin\s+(?:inglese|italiano)\s+(?:per\s+favore|grazie)\b/gi,
  ];
  for (const pattern of preferenzeLingua) q = q.replace(pattern, " ");

  // Normalize common Italian catalog questions to the subject being requested.
  // In this question frame, plural "paste" refers to the pasta category.
  q = q.replace(/\b(?:quali|quanta|quanto|quanti|quante|che)\s+(?:tipi\s+di\s+)?past[ae]\b/gi, "pasta");
  // "Quanto costa X?" è una cornice linguistica, non una keyword cercata.
  q = q.replace(/\b(?:quanto|quanta|quanti|quante)\s+(?:costa|costano|viene|vengono|vale|valgono)\b/gi, " ");

  // Remove first-person budget framing BEFORE stripping the numeric amount.
  // Otherwise "I have 100 euros and want a watch" loses "100 euros" first,
  // leaving the orphaned verb "have" in the catalog query.
  q = q.replace(/\b(?:i have|i['’]ve got|ive got)\b/gi, " ");

  // Price ranges and constraints in either language.
  q = q
    .replace(/\b(?:between|tra|da)\s*(?:(?:i|gli|il|lo|la|le|un|uno|una)\s+|l['’]\s*)?\$?\s*\d+(?:[.,]\d+)?\s*(?:and|e|a|to)\s*(?:(?:i|gli|il|lo|la|le|un|uno|una)\s+|l['’]\s*)?\$?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd|€|\$)?\b/gi, " ")
    .replace(/\b(?:under|below|up to|less than|no more than|not over|over|above|more than|at least|at most|sotto|sopra|massimo|minimo|meno di|piu di|oltre|entro|fino a|non oltre|al massimo|budget(?: of| di)?)\s*(?:(?:i|gli|il|lo|la|le|un|uno|una)\s+|l['’]\s*)?(?:€|\$)?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)?/gi, " ")
    .replace(/\b(?:i have|i've got|ive got|with|my budget is|budget of|ho|con|dispongo di|a disposizione(?: di)?)\s*(?:a budget of\s*)?(?:€|\$)?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)\b/gi, " ")
    .replace(/(?:€|\$)\s*\d+(?:[.,]\d+)?/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)\b/gi, " ");

  // Open-now / opening-time wording is a constraint, not part of the subject.
  q = q.replace(/\b(?:aperto|aperta|aperti|aperte)\s+(?:ora|adesso|oggi|domani|stasera|stamattina|pomeriggio)\b|\b(?:open|opened)\s+(?:right\s+)?now\b|\bcurrently\s+open\b|\bopen\s+at\s+the\s+moment\b/gi, " ");

  // Phrases that describe the act of searching rather than the desired item.
  q = q
    .replace(/\b(?:or something similar|or something like that|or similar|something similar|something like that|anything similar|similar items|other similar options)\b/gi, " ")
    .replace(/\b(?:i am looking for|i'm looking for|im looking for|looking for|i would like|i'd like|id like|i want|i need|can you find|could you find|find me|show me|help me find|please find|please show|i am after|im after)\b/gi, " ")
    .replace(/\b(?:voglio|vorrei|cerco|cerca|trovami|trova|mi serve|fammi trovare|dammi|per favore|per piacere|qualcosa di simile|o qualcosa di simile|o simile)\b/gi, " ")
    .replace(/\b(?:please|the|a|an|some|any|me|i|my|and|or|want|need|have|got|looking|would|like|un|una|uno|il|lo|la|gli|le|del|della|dei|delle|e|avete|hai|hanno|abbiamo|disponete|disponibile|disponibili|quale|quali|quanta|quanto|quanti|quante|che|cosa)\b/gi, " ")
    .replace(/^\s*(?:with|for|of|to|da|con|per|di|a)\b\s*/i, "")
    .replace(/\s+\b(?:and|or|with|for|of|to|da|con|per|di|a)\s*$/i, "")
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return q;
}
