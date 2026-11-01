/**
 * Pino Core v2 — isolated request planner prototype.
 *
 * Pure, deterministic first stage: converts a user message into a typed plan.
 * It does not call an LLM, access Supabase, execute searches, or alter the
 * production Pino flow. The prototype can be evaluated offline and compared
 * against the existing planner before any integration is considered.
 */
import {
  normalizzaQueryCatalogo,
  rilevaLinguaPino,
  richiestaApertaOra,
} from "../understanding.ts";
import {
  isBroadAttractionsRequest,
  isExplicitFoodProductRequest,
} from "../routing-policy.ts";

export type PinoCoreRoute =
  | "conversation"
  | "catalog"
  | "attractions"
  | "events"
  | "weather"
  | "pharmacies"
  | "unknown";

export type PinoCoreSurface = "products" | "stores" | "both" | "none";
export type PinoCoreConfidence = "high" | "medium" | "low";

export type PinoCorePlan = {
  route: PinoCoreRoute;
  surface: PinoCoreSurface;
  language: "it" | "en";
  original: string;
  query: string;
  subject: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  openNow: boolean;
  exclusions: string[];
  attributes: string[];
  confidence: PinoCoreConfidence;
  needsClarification: boolean;
  reason: string;
};

const GENERIC_VAGUE =
  /^(?:qualcosa(?:\s+di\s+\p{L}+)?|un qualcosa|consigliami qualcosa|non so cosa|anything|something(?:\s+nice)?|i don't know what|surprise me|whatever)\s*[!.?]*$/iu;

const WEATHER =
  /\b(?:meteo|tempo che fa|che tempo|previsioni|piove|piovera|piovera'?|piovere|piovendo|temperatura|weather|forecast|is it raining|will it rain)\b/i;
const PHARMACY =
  /\b(?:farmacia|farmacie|farmacista|pharmacy|pharmacies|chemist)\b/i;
const EVENTS =
  /\b(?:eventi|evento|manifestazioni|concerto|concerti|sagra|sagre|festival|fiera|fiere|mostra|mostre|spettacolo|spettacoli|events|what'?s on|what is on|what'?s happening|concert|concerts|festival|festivals|exhibition|exhibitions|local shows)\b/i;
const EVENT_TIME_PHRASE =
  /\b(?:cosa succede|che succede|what(?:'s| is) happening)\b.*\b(?:oggi|stasera|domani|weekend|today|tonight|tomorrow|weekend)\b/i;
const ATTRACTIONS =
  /\b(?:attrazioni?|luoghi interessanti|luoghi da visitare|cosa vedere|cosa visitare|centro storico|monumenti?|itinerari? turistici?|tour turistici?|borghi da vedere|dintorni da visitare|places to visit|things to see|tourist attractions|what should i see|what can i visit|sightseeing)\b/i;
const STORE =
  /\b(?:negozio|negozi|attivita|servizio|servizi|professionista|professionisti|parrucchiere|barbiere|estetista|medico|dottore|dentista|otorino|veterinario|idraulico|elettricista|meccanico|commercialista|fotografo|fotografi|sarto|sarti|fiorista|fioristi|impresa di pulizie|pulizie|ristorante|ristoranti|restaurant|restaurants|pizzeria|pizzerie|bar|hotel|store|stores|shop|shops|business|businesses|service|services|doctor|dentist|hairdresser|barber|barbers|plumber|electrician|electricians|mechanic|accountant|photographer|tailor|florist|vet|vets|cleaning service)\b/i;

const PRICE_RANGE =
  /\b(?:tra|between|da)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)\s*(?:e|and|to|a)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:euro|euros|eur))?\b/i;
const PRICE_MAX =
  /\b(?:sotto|meno di|al massimo|massimo|max|under|below|less than|up to|no more than|not over|at most)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:euro|euros|eur))?\b/i;
const PRICE_MIN =
  /\b(?:sopra|piu di|più di|oltre|almeno|minimo|over|above|more than|at least)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:euro|euros|eur))?\b/i;

function normalizeIntentText(text: string): string {
  return String(text ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'");
}

function isConversationalMessage(text: string): boolean {
  const q = normalizeIntentText(text).trim();
  const greeting =
    /^(?:ciao|salve|buongiorno|buonasera|buonanotte|hey|hi|hello|good morning|good afternoon|good evening)(?:\s+pino)?(?:[,!]\s*(?:come stai|come va(?: oggi)?|tutto bene|how are you|how's it going|ti va di fare due chiacchiere|would you like to chat))?[!.?\s]*$/i;
  const standalone =
    /^(?:come stai|come va(?: oggi)?|tutto bene\??|ci sei|grazie(?: mille| tante)?|grazie per l'aiuto|perfetto(?:, grazie)?|va bene|ok(?:ay)?|great|perfect|sure|thanks(?: for your help)?|thank you(?: so much)?|that's great,? thank you|would you like to chat|ti va di fare due chiacchiere|tell me a joke|tell me a funny joke)[!.?\s]*$/i;
  return greeting.test(q) || standalone.test(q);
}

function number(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function extractPrice(text: string): { minPrice: number | null; maxPrice: number | null } {
  const range = text.match(PRICE_RANGE);
  if (range) {
    const a = number(range[1]);
    const b = number(range[2]);
    if (a !== null && b !== null) {
      return { minPrice: Math.min(a, b), maxPrice: Math.max(a, b) };
    }
  }
  const max = text.match(PRICE_MAX);
  const min = text.match(PRICE_MIN);
  return {
    minPrice: min ? number(min[1]) : null,
    maxPrice: max ? number(max[1]) : null,
  };
}

function extractExclusions(text: string): string[] {
  const matches = [
    ...text.matchAll(/\b(?:senza|escluso|escludi|non voglio|no|without|excluding|exclude|not)\s+([\p{L}][\p{L}\s-]{1,28})/giu),
  ];
  return Array.from(new Set(matches
    .map((match) => (match[1] ?? "").trim().replace(/[.,!?;:]+$/, ""))
    .filter(Boolean)
    .map((value) => value.split(/\s+(?:sotto|sopra|massimo|minimo|under|below|over|above)\b/i)[0].trim())
    .filter((value) => value.length > 1)
  )).slice(0, 5);
}

function stripConstraints(query: string): string {
  return query
    .replace(PRICE_RANGE, " ")
    .replace(PRICE_MAX, " ")
    .replace(PRICE_MIN, " ")
    .replace(/\b(?:aperto|aperta|aperti|aperte)\s+(?:ora|adesso)\b|\b(?:open|opened)\s+(?:right\s+)?now\b/gi, " ")
    .replace(/\b(?:senza|escluso|escludi|non voglio|no|without|excluding|exclude|not)\s+[\p{L}][\p{L}\s-]{1,28}/giu, " ")
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove only leading conversational/search scaffolding. The shared catalog
 * normalizer then handles articles, vocabulary translation and constraints.
 */
function stripSearchFraming(text: string): string {
  return normalizeIntentText(text)
    .replace(/^\s*(?:oh\s+)?pino\b[,!:\s]*/i, "")
    .replace(/^\s*(?:mi\s+(?:puoi\s+)?(?:trovare|trovi|serve|servono|servirebbe|occorre|occorrono)|mi dai una mano a trovare|sto cercando|stiamo cercando|vorrei comprare|voglio comprare|dove\s+(?:posso\s+)?(?:comprare|compro|trovare|trovo)|find\s+(?:me\s+)?(?:a\s+)?pair\s+of|find\s+me|find|show\s+me|i am looking for|i'm looking for|im looking for|looking for|i need|i want)\s+/i, "")
    .replace(/^\s*(?:comprare|to buy)\s+/i, "")
    .trim();
}

function classifyStoreRequest(text: string): boolean {
  return STORE.test(normalizeIntentText(text)) && !isExplicitFoodProductRequest(text);
}

export function planPinoCoreRequest(input: string): PinoCorePlan {
  const original = String(input ?? "").trim();
  const intentText = normalizeIntentText(original);
  const language = rilevaLinguaPino(original);
  const base = {
    original,
    language,
    minPrice: null as number | null,
    maxPrice: null as number | null,
    openNow: false,
    exclusions: [] as string[],
    attributes: [] as string[],
    subject: null as string | null,
    query: "",
    needsClarification: false,
    confidence: "low" as PinoCoreConfidence,
  };

  if (!original) {
    return { ...base, route: "unknown", surface: "none", reason: "empty_input", needsClarification: true };
  }
  if (isConversationalMessage(original)) {
    return { ...base, route: "conversation", surface: "none", confidence: "high", reason: "conversational_message" };
  }
  if (WEATHER.test(intentText)) {
    return { ...base, route: "weather", surface: "none", confidence: "high", reason: "weather_intent" };
  }
  if (PHARMACY.test(intentText)) {
    return { ...base, route: "pharmacies", surface: "stores", confidence: "high", reason: "pharmacy_intent" };
  }
  if (EVENTS.test(intentText) || EVENT_TIME_PHRASE.test(intentText)) {
    return { ...base, route: "events", surface: "none", confidence: "high", reason: "events_intent" };
  }
  if (ATTRACTIONS.test(intentText) || isBroadAttractionsRequest(original)) {
    return { ...base, route: "attractions", surface: "none", confidence: "high", reason: "attractions_intent" };
  }

  if (GENERIC_VAGUE.test(original)) {
    return {
      ...base,
      route: "unknown",
      surface: "none",
      confidence: "low",
      needsClarification: true,
      reason: "generic_request_without_search_subject",
    };
  }

  const price = extractPrice(original);
  const openNow = richiestaApertaOra(original);
  const withoutConstraints = stripConstraints(original);
  const searchText = stripSearchFraming(withoutConstraints);
  const normalized = normalizzaQueryCatalogo(searchText);
  const query = normalized.trim();
  const subject = query ? query.split(" ")[0] : null;
  const storeRequest = classifyStoreRequest(original);
  const explicitFoodProduct = isExplicitFoodProductRequest(original);
  const surface: PinoCoreSurface = storeRequest ? "stores" : "products";
  const confidence: PinoCoreConfidence =
    subject && (storeRequest || explicitFoodProduct || price.maxPrice !== null || price.minPrice !== null || openNow)
      ? "high"
      : subject ? "medium" : "low";

  const attributes = query
    .split(" ")
    .slice(1)
    .filter((word) => word.length > 2 && !["con", "per", "da", "del", "della", "dei", "delle", "di", "in", "a", "the", "with", "for"].includes(word))
    .slice(0, 8);

  if (!subject) {
    return {
      ...base,
      route: "unknown",
      surface: "none",
      minPrice: price.minPrice,
      maxPrice: price.maxPrice,
      openNow,
      exclusions: extractExclusions(original),
      confidence: "low",
      needsClarification: true,
      reason: "no_reliable_search_subject",
    };
  }

  return {
    ...base,
    route: "catalog",
    surface,
    query,
    subject,
    minPrice: price.minPrice,
    maxPrice: price.maxPrice,
    openNow,
    exclusions: extractExclusions(original),
    attributes,
    confidence,
    needsClarification: confidence === "low",
    reason: storeRequest ? "local_business_search" : explicitFoodProduct ? "explicit_food_product_search" : "catalog_subject_detected",
  };
}
