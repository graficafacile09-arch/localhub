/**
 * Pino Core v2 — AI structured request planner.
 *
 * Experimental only: never imported by the production assistant. Gemini turns
 * natural, misspelled or colloquial requests into a typed search plan. The
 * deterministic planner remains the safe fallback and the source of truth for
 * mechanically detectable constraints (prices, open-now and exclusions).
 */
import { callGeminiText } from "../../ai/gemini-text.ts";
import {
  planPinoCoreRequest,
  type PinoCorePlan,
  type PinoCoreRoute,
  type PinoCoreSurface,
  type PinoCoreConfidence,
} from "./request-planner.ts";

export type PinoPlannerContextMessage = {
  role: "user" | "model";
  content: string;
};

type PlannerModelOutput = {
  route: PinoCoreRoute;
  surface: PinoCoreSurface;
  language: "it" | "en";
  query: string;
  subject: string | null;
  attributes: string[];
  exclusions: string[];
  confidence: PinoCoreConfidence;
  needsClarification: boolean;
  reason: string;
};

const ROUTES = new Set<PinoCoreRoute>([
  "conversation", "catalog", "attractions", "events", "weather", "pharmacies", "unknown",
]);
const SURFACES = new Set<PinoCoreSurface>(["products", "stores", "both", "none"]);
const CONFIDENCES = new Set<PinoCoreConfidence>(["high", "medium", "low"]);
const SYSTEM_PROMPT = `
Sei il planner strutturato di Pino, assistente del marketplace locale InCittà.
Il tuo unico compito è trasformare il messaggio dell'utente in un piano JSON
per instradare la richiesta. NON rispondere all'utente, NON inventare prodotti,
negozi, eventi, prezzi, orari o informazioni locali.

Interpreta il significato, non le parole esatte: tollera refusi, grammatica
imperfetta, abbreviazioni, linguaggio colloquiale, sinonimi e richieste indirette.
Usa il contesto conversazionale solo per risolvere riferimenti come "e più
economico?", "ne avete rossi?" o "qualcosa del genere"; non inventare vincoli.

Route:
- conversation: saluti, ringraziamenti, chiacchiere e domande rivolte a Pino.
- catalog: ricerca di prodotti o attività/servizi commerciali.
- attractions: luoghi da visitare, monumenti, itinerari e attrazioni.
- events: eventi, concerti, sagre, manifestazioni e appuntamenti.
- weather: meteo e previsioni.
- pharmacies: farmacie di turno o farmacie.
- unknown: intento non determinabile o richiesta troppo vaga.

Surface per catalog:
- products: beni/prodotti da acquistare.
- stores: negozi, professionisti, attività o servizi da trovare.
- both: l'utente chiede esplicitamente sia prodotti sia attività.
- none: per tutte le route diverse da catalog.

Regole fondamentali:
1. query è una query breve, concreta e adatta al motore di ricerca; elimina
   formule come "mi puoi trovare", "vorrei", "per favore".
2. subject è il nucleo della ricerca, non il primo token casuale.
3. Mantieni in attributes caratteristiche richieste (colore, taglia, marca,
   materiale, destinatario, occasione, zona, periodo e simili).
4. Riporta solo esclusioni esplicite. Non trasformare "senza spendere troppo"
   in un'esclusione; è un'indicazione di budget.
5. Non dedurre un budget se non è espresso.
6. Se il messaggio contiene più intenti, scegli quello principale; usa both
   solo quando la ricerca di prodotti e negozi è davvero richiesta.
7. Se manca un soggetto utile, usa unknown e needsClarification=true.
8. La lingua è quella dell'utente, "it" o "en".
9. confidence misura quanto è chiaro l'intento, non quanto esistono risultati.
10. Restituisci ESCLUSIVAMENTE un oggetto JSON valido con queste chiavi:
{
 "route":"conversation|catalog|attractions|events|weather|pharmacies|unknown",
 "surface":"products|stores|both|none",
 "language":"it|en",
 "query":"string",
 "subject":"string|null",
 "attributes":["string"],
 "exclusions":["string"],
 "confidence":"high|medium|low",
 "needsClarification":false,
 "reason":"breve codice/motivo"
}
`;

function parseModelOutput(raw: string): PlannerModelOutput | null {
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    if (
      typeof value.route !== "string" || !ROUTES.has(value.route as PinoCoreRoute) ||
      typeof value.surface !== "string" || !SURFACES.has(value.surface as PinoCoreSurface) ||
      (value.language !== "it" && value.language !== "en") ||
      typeof value.query !== "string" ||
      !(typeof value.subject === "string" || value.subject === null) ||
      !Array.isArray(value.attributes) || !Array.isArray(value.exclusions) ||
      typeof value.confidence !== "string" || !CONFIDENCES.has(value.confidence as PinoCoreConfidence) ||
      typeof value.needsClarification !== "boolean"
    ) return null;

    const strings = (items: unknown[]) => items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().slice(0, 64))
      .filter(Boolean)
      .slice(0, 10);

    const query = value.query.trim().slice(0, 160);
    const subject = typeof value.subject === "string" ? value.subject.trim().slice(0, 80) || null : null;
    const route = value.route as PinoCoreRoute;
    const surface = value.surface as PinoCoreSurface;
    if (route === "catalog" && (!query || !subject || surface === "none")) return null;
    if (route !== "catalog" && surface !== "none") return null;

    return {
      route,
      surface,
      language: value.language,
      query,
      subject,
      attributes: strings(value.attributes),
      exclusions: strings(value.exclusions),
      confidence: value.confidence as PinoCoreConfidence,
      needsClarification: value.needsClarification,
      reason: typeof value.reason === "string" ? value.reason.slice(0, 100) : "ai_planner",
    };
  } catch {
    return null;
  }
}

/** Exposed for deterministic offline tests; invalid model output is rejected. */
export function parsePinoPlannerOutput(raw: string): PlannerModelOutput | null {
  return parseModelOutput(raw);
}

function mergePlan(
  original: string,
  deterministic: PinoCorePlan,
  ai: PlannerModelOutput,
): PinoCorePlan {
  // Deterministic special routes (conversation, weather, pharmacy, events,
  // attractions) win: they are explicit, low-risk classifications.
  const protectedRoute = deterministic.route !== "catalog" && deterministic.route !== "unknown";
  if (protectedRoute) return deterministic;

  const route = ai.route;
  const query = route === "catalog" ? ai.query : "";
  const subject = route === "catalog" ? ai.subject : null;
  if (route === "catalog" && (!query || !subject)) return deterministic;

  const minPrice = deterministic.minPrice;
  const maxPrice = deterministic.maxPrice;
  const exclusions = Array.from(new Set([
    ...deterministic.exclusions,
    ...ai.exclusions,
  ])).slice(0, 10);

  return {
    ...deterministic,
    route,
    surface: route === "catalog" ? ai.surface : "none",
    language: ai.language,
    query,
    subject,
    minPrice,
    maxPrice,
    openNow: deterministic.openNow,
    exclusions,
    attributes: Array.from(new Set([...ai.attributes, ...deterministic.attributes])).slice(0, 12),
    confidence: ai.confidence,
    needsClarification: route === "unknown" || (route === "catalog" && ai.needsClarification),
    reason: `ai:${ai.reason || "structured_plan"}`,
    original,
  };
}

/**
 * AI planning with a deterministic fallback. This function has no search,
 * database or write side effects. A caller may inject a model function in tests.
 */
export async function planPinoCoreRequestWithAI(
  input: string,
  options: {
    history?: PinoPlannerContextMessage[];
    plannerCall?: (prompt: string) => Promise<string>;
  } = {},
): Promise<PinoCorePlan> {
  const original = String(input ?? "").trim();
  const deterministic = planPinoCoreRequest(original);
  if (!original || deterministic.route === "conversation" ||
      ["weather", "pharmacies", "events", "attractions"].includes(deterministic.route)) {
    return deterministic;
  }

  const history = (options.history ?? [])
    .filter((message) => message && (message.role === "user" || message.role === "model"))
    .slice(-6)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 500) }));
  const prompt = [
    "Interpreta la richiesta e restituisci il piano JSON richiesto.",
    history.length ? `CONTESTO RECENTE:\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}` : "",
    `RICHIESTA ATTUALE:\n${original}`,
  ].filter(Boolean).join("\n\n");

  try {
    const raw = options.plannerCall
      ? await options.plannerCall(prompt)
      : await callGeminiText({
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: prompt,
          json: true,
          temperature: 0,
          maxTokens: 450,
          timeoutMs: 12_000,
          retries: 1,
        });
    const parsed = parseModelOutput(raw);
    return parsed ? mergePlan(original, deterministic, parsed) : deterministic;
  } catch {
    // Provider outage, missing key, timeout, quota or malformed output must
    // never block the assistant: use the offline planner unchanged.
    return deterministic;
  }
}
