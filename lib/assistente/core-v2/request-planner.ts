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

const GREETING =
  /^(?:ciao|salve|buongiorno|buonasera|buonanotte|hey|hi|hello|good morning|good afternoon|good evening|thanks|thank you|grazie|grazie mille|ok|okay|va bene|perfetto|great|perfect|sure|come stai|how are you|how's it going|would you like to chat|ti va di fare due chiacchiere)[!.?\s]*$/i;

const GENERIC_VAGUE =
  /^(?:qualcosa(?:\\s+di\\s+\\w+)?|un qualcosa|consigliami qualcosa|non so cosa|anything|something(?:\\s+nice)?|i don't know what|surprise me|whatever)\\s*[!.?]*$/i;

const WEATHER =
  /\b(?:meteo|tempo che fa|che tempo|previsioni|piove|piovera|temperatura|weather|forecast|is it raining)\b/i;
const PHARMACY =
  /\b(?:farmacia|farmacie|farmacista|pharmacy|pharmacies|chemist)\b/i;
const EVENTS =
  /\b(?:eventi|evento|manifestazioni|concerto|concerti|festival|fiera|fiere|mostra|mostre|events|what'?s on|what is on|concert|festival|exhibition)\b/i;
const STORE =
  /\b(?:negozio|negozi|attivita|attività|servizio|servizi|professionista|professionisti|parrucchiere|barbiere|estetista|medico|dottore|dentista|otorino|veterinario|idraulico|elettricista|meccanico|ristorante|pizzeria|bar|hotel|store|stores|shop|shops|business|businesses|service|services|doctor|dentist|hairdresser|plumber|electrician|mechanic|restaurant)\b/i;

const PRICE_RANGE =
  /\b(?:tra|between|da)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)\s*(?:e|and|to|a)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:euro|euros|eur))?\b/i;
const PRICE_MAX =
  /\b(?:sotto|meno di|al massimo|massimo|max|under|below|less than|up to|no more than|not over|at most)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:euro|euros|eur))?\b/i;
const PRICE_MIN =
  /\b(?:sopra|piu di|più di|oltre|almeno|minimo|over|above|more than|at least)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:euro|euros|eur))?\b/i;

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

function classifyStoreRequest(text: string): boolean {
  return STORE.test(text) && !isExplicitFoodProductRequest(text);
}

export function planPinoCoreRequest(input: string): PinoCorePlan {
  const original = String(input ?? "").trim();
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
  if (GREETING.test(original)) {
    return { ...base, route: "conversation", surface: "none", confidence: "high", reason: "conversational_message" };
  }
  if (WEATHER.test(original)) {
    return { ...base, route: "weather", surface: "none", confidence: "high", reason: "weather_intent" };
  }
  if (PHARMACY.test(original)) {
    return { ...base, route: "pharmacies", surface: "stores", confidence: "high", reason: "pharmacy_intent" };
  }
  if (EVENTS.test(original)) {
    return { ...base, route: "events", surface: "none", confidence: "high", reason: "events_intent" };
  }
  if (isBroadAttractionsRequest(original)) {
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
  const normalized = normalizzaQueryCatalogo(withoutConstraints);
  const query = normalized.trim();
  const subject = query || null;
  const storeRequest = classifyStoreRequest(original);
  const explicitFoodProduct = isExplicitFoodProductRequest(original);
  const surface: PinoCoreSurface = storeRequest ? "stores" : explicitFoodProduct ? "products" : "products";
  const confidence: PinoCoreConfidence =
    subject && (storeRequest || explicitFoodProduct || price.maxPrice !== null || price.minPrice !== null || openNow)
      ? "high"
      : subject ? "medium" : "low";

  const attributes = query
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(1, 8);

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
