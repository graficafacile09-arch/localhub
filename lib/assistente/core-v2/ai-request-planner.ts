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

/**
 * Diagnostica opzionale del planner. Vive accanto al piano e non lo modifica:
 * serve solo a spiegare perché una richiesta è finita sul planner deterministico.
 */
export type PinoPlannerDiagnosticOutcome =
  | "ai_accepted"
  | "ai_skipped"
  | "provider_error"
  | "timeout"
  | "invalid_json"
  | "invalid_schema"
  | "fallback_invalid_plan";

export type PinoPlannerDiagnostic = {
  /** Identificativo fornito dal chiamante (es. id del caso di benchmark). */
  requestId?: string;
  outcome: PinoPlannerDiagnosticOutcome;
  /** true solo quando la chiamata al provider è stata davvero tentata. */
  attempted: boolean;
  /** Codice HTTP del provider, quando disponibile. */
  httpStatus?: number;
  durationMs: number;
  /** Motivo tecnico sintetico, già sanificato: mai prompt, chiavi o risposte. */
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

type PlannerParseResult =
  | { ok: true; value: PlannerModelOutput }
  | { ok: false; kind: "invalid_json" | "invalid_schema"; reason: string };

/**
 * Parsing dettagliato: distingue JSON non interpretabile (invalid_json) da JSON
 * valido ma incompatibile con lo schema richiesto (invalid_schema).
 */
function parseModelOutputDetailed(raw: string): PlannerParseResult {
  const cleaned = String(raw ?? "").trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, kind: "invalid_json", reason: "no_json_object" };
  }

  let value: Record<string, unknown>;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, kind: "invalid_schema", reason: "not_a_json_object" };
    }
    value = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, kind: "invalid_json", reason: "json_parse_error" };
  }

  if (typeof value.route !== "string" || !ROUTES.has(value.route as PinoCoreRoute)) {
    return { ok: false, kind: "invalid_schema", reason: "route_not_allowed" };
  }
  if (typeof value.surface !== "string" || !SURFACES.has(value.surface as PinoCoreSurface)) {
    return { ok: false, kind: "invalid_schema", reason: "surface_not_allowed" };
  }
  if (value.language !== "it" && value.language !== "en") {
    return { ok: false, kind: "invalid_schema", reason: "language_not_allowed" };
  }
  if (typeof value.query !== "string") {
    return { ok: false, kind: "invalid_schema", reason: "query_not_string" };
  }
  if (!(typeof value.subject === "string" || value.subject === null)) {
    return { ok: false, kind: "invalid_schema", reason: "subject_not_string_null" };
  }
  if (!Array.isArray(value.attributes)) {
    return { ok: false, kind: "invalid_schema", reason: "attributes_not_array" };
  }
  if (!Array.isArray(value.exclusions)) {
    return { ok: false, kind: "invalid_schema", reason: "exclusions_not_array" };
  }
  if (typeof value.confidence !== "string" || !CONFIDENCES.has(value.confidence as PinoCoreConfidence)) {
    return { ok: false, kind: "invalid_schema", reason: "confidence_not_allowed" };
  }
  if (typeof value.needsClarification !== "boolean") {
    return { ok: false, kind: "invalid_schema", reason: "needs_clarification_not_boolean" };
  }

  const strings = (items: unknown[]) => items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 64))
    .filter(Boolean)
    .slice(0, 10);

  const query = value.query.trim().slice(0, 160);
  const subject = typeof value.subject === "string" ? value.subject.trim().slice(0, 80) || null : null;
  const route = value.route as PinoCoreRoute;
  const surface = value.surface as PinoCoreSurface;
  if (route === "catalog" && (!query || !subject || surface === "none")) {
    return { ok: false, kind: "invalid_schema", reason: "catalog_requires_query_subject_surface" };
  }
  if (route !== "catalog" && surface !== "none") {
    return { ok: false, kind: "invalid_schema", reason: "non_catalog_requires_surface_none" };
  }

  return {
    ok: true,
    value: {
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
    },
  };
}

function parseModelOutput(raw: string): PlannerModelOutput | null {
  const result = parseModelOutputDetailed(raw);
  return result.ok ? result.value : null;
}

/** Exposed for deterministic offline tests; invalid model output is rejected. */
export function parsePinoPlannerOutput(raw: string): PlannerModelOutput | null {
  return parseModelOutput(raw);
}

const LIMITE_MOTIVO = 160;

/** Motivo diagnostico: nessuna chiave, nessun URL, nessun contenuto del prompt. */
function sanificaMotivo(testo: unknown): string {
  return String(testo ?? "")
    .replace(/key=[^&\s"']+/gi, "key=[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED]")
    .replace(/sb_(?:secret|publishable)_[0-9A-Za-z_-]+/g, "[REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, LIMITE_MOTIVO);
}

function statoHttpErrore(errore: unknown): number | undefined {
  const candidati = [
    (errore as { status?: unknown } | null)?.status,
    (errore as { statusCode?: unknown } | null)?.statusCode,
    (errore as { code?: unknown } | null)?.code,
  ];
  for (const candidato of candidati) {
    const numero = typeof candidato === "string" ? Number(candidato) : candidato;
    if (typeof numero === "number" && Number.isInteger(numero) && numero >= 400 && numero <= 599) {
      return numero;
    }
  }
  const messaggio = String((errore as Error | null)?.message ?? "");
  const trovato = messaggio.match(/\bHTTP\s*(\d{3})\b/i) ?? messaggio.match(/\b([45]\d{2})\b/);
  return trovato ? Number(trovato[1]) : undefined;
}

function erroreDiTimeout(errore: unknown): boolean {
  const nome = String((errore as { name?: unknown } | null)?.name ?? "");
  const messaggio = String((errore as Error | null)?.message ?? "");
  if (/^(?:AbortError|TimeoutError)$/i.test(nome)) return true;
  return /\b(?:timeout|timed out|ETIMEDOUT)\b/i.test(messaggio);
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
 *
 * `onDiagnostic` è opzionale e del tutto laterale: riceve un esito per ogni
 * esecuzione, non riceve mai prompt/chiavi/risposte e non può far fallire il
 * planner (le sue eccezioni vengono ignorate).
 */
export async function planPinoCoreRequestWithAI(
  input: string,
  options: {
    history?: PinoPlannerContextMessage[];
    plannerCall?: (prompt: string) => Promise<string>;
    requestId?: string;
    onDiagnostic?: (diagnostic: PinoPlannerDiagnostic) => void;
  } = {},
): Promise<PinoCorePlan> {
  const emetti = (
    outcome: PinoPlannerDiagnosticOutcome,
    dettagli: { attempted: boolean; durationMs: number; reason: string; httpStatus?: number },
  ): void => {
    const callback = options.onDiagnostic;
    if (typeof callback !== "function") return;
    try {
      callback({
        requestId: options.requestId,
        outcome,
        attempted: dettagli.attempted,
        httpStatus: dettagli.httpStatus,
        durationMs: dettagli.durationMs,
        reason: sanificaMotivo(dettagli.reason) || outcome,
      });
    } catch {
      // La diagnostica non deve mai influenzare il piano restituito.
    }
  };

  const original = String(input ?? "").trim();
  const deterministic = planPinoCoreRequest(original);
  if (!original) {
    emetti("ai_skipped", { attempted: false, durationMs: 0, reason: "empty_input" });
    return deterministic;
  }
  if (deterministic.route === "conversation" ||
      ["weather", "pharmacies", "events", "attractions"].includes(deterministic.route)) {
    emetti("ai_skipped", {
      attempted: false,
      durationMs: 0,
      reason: `deterministic_route:${deterministic.route}`,
    });
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

  const inizio = Date.now();
  let raw: string;
  try {
    raw = options.plannerCall
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
  } catch (errore) {
    // Provider outage, missing key, timeout, quota or malformed output must
    // never block the assistant: use the offline planner unchanged.
    const durationMs = Date.now() - inizio;
    if (erroreDiTimeout(errore)) {
      emetti("timeout", {
        attempted: true,
        durationMs,
        reason: `gemini_timeout: ${(errore as Error | null)?.message ?? "aborted"}`,
      });
    } else {
      const httpStatus = statoHttpErrore(errore);
      emetti("provider_error", {
        attempted: true,
        durationMs,
        httpStatus,
        reason: `gemini_provider_error: ${(errore as Error | null)?.message ?? "unknown"}`,
      });
    }
    return deterministic;
  }

  const durationMs = Date.now() - inizio;
  const parsed = parseModelOutputDetailed(raw);
  if (!parsed.ok) {
    emetti(parsed.kind, { attempted: true, durationMs, reason: parsed.reason });
    return deterministic;
  }

  const merged = mergePlan(original, deterministic, parsed.value);
  if (!merged.reason.startsWith("ai:")) {
    emetti("fallback_invalid_plan", { attempted: true, durationMs, reason: "merge_rejected" });
    return merged;
  }

  emetti("ai_accepted", {
    attempted: true,
    durationMs,
    reason: `accepted_route:${merged.route};surface:${merged.surface}`,
  });
  return merged;
}
