/**
 * Pino Semantic Planner v2
 *
 * Interpreta richieste naturali prima del retrieval: soggetto, superficie,
 * sinonimi, vincoli di prezzo, città ed esclusioni. Il modello NON decide
 * quali dati inventare: restituisce solo un piano di ricerca che viene poi
 * validato e applicato dai tool deterministici.
 *
 * Fallback locale: se Gemini non è disponibile, il piano resta utilizzabile
 * con intent + termini originali.
 */
import { callGeminiText } from "@/lib/ai/gemini-text";
import { extractJsonFromText } from "@/lib/product-assistant/providers/utils";
import { normalizzaRichiesta } from "./local-intents";
import { type PinoIntent, type PinoIntentAnalysis } from "./intent";
import type { MessaggioAssistente } from "./index";
import type { PinoMemoriaVoce } from "./memoria";

export type PinoSemanticPlan = {
  surface: "products" | "stores" | "both" | "none";
  intent: PinoIntent;
  query: string;
  terms: string[];
  exclusions: string[];
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  openNow: boolean;
  confidence: "alta" | "media" | "bassa";
};

const SCHEMA_PROMPT = `Interpreta una richiesta dell'utente per la ricerca locale di InCittà.
NON rispondere all'utente. Devi produrre SOLO JSON valido.

Regole:
- Comprendi italiano naturale, plurali, diminutivi, sinonimi e forme colloquiali.
- "birre", "birretta", "birrette" => soggetto canonico "birra".
- "telefonino", "cellulare", "smartphone" => soggetto canonico "telefono".
- Non inventare prodotti, negozi o disponibilità.
- terms contiene SOLO i soggetti realmente cercati, non articoli, preposizioni,
  verbi o vincoli. Può contenere sinonimi utili (massimo 5).
- exclusions contiene ciò che l'utente esclude esplicitamente (massimo 5),
  ad esempio "non alcolica" => ["alcolica"].
- Estrai prezzi da frasi come "sotto 10 euro", "massimo 20", "tra 5 e 15".
- city solo se la città è esplicitamente indicata.
- openNow true solo se l'utente chiede esplicitamente attività aperte ora.
- products = prodotti fisici; stores = negozi/servizi; both quando servono
  entrambi; none per chiacchiere o richieste non di ricerca.
- Per servizi/professionisti usa stores.
- Mantieni il soggetto principale anche quando la frase è lunga.
- confidence bassa se non riesci a identificare un soggetto concreto.

JSON:
{
  "surface": "products|stores|both|none",
  "intent": "product|service|food|drink|gift|generic",
  "query": "stringa breve del soggetto",
  "terms": ["string"],
  "exclusions": ["string"],
  "minPrice": number|null,
  "maxPrice": number|null,
  "city": "string|null",
  "openNow": true|false,
  "confidence": "alta|media|bassa"
}`;

function pulisciLista(values: unknown, max = 5): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .filter((v): v is string => typeof v === "string")
      .map((v) => normalizzaRichiesta(v).trim())
      .filter((v) => v.length >= 2 && v.length <= 40)
  )).slice(0, max);
}

function numeroValido(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1000000 ? Math.round(n * 100) / 100 : null;
}

const CANONICI_RICERCA: Array<{ pattern: RegExp; termine: string; intent: PinoIntent }> = [
  { pattern: /\bbir(?:ra|re|retta|rette|rettina|rettine)\b/i, termine: "birra", intent: "drink" },
  { pattern: /\bvino|vini|vinello|vinelli\b/i, termine: "vino", intent: "drink" },
  { pattern: /\bacqua|acque\b/i, termine: "acqua", intent: "drink" },
  { pattern: /\bpizza|pizze|pizzetta|pizzette\b/i, termine: "pizza", intent: "food" },
  { pattern: /\bpanino|panini|paninetto|paninetti\b/i, termine: "panino", intent: "food" },
  { pattern: /\btelefono|telefoni|telefonino|telefonini|cellulare|cellulari|smartphone\b/i, termine: "telefono", intent: "product" },
  { pattern: /\bscarpa|scarpe|scarpina|scarpine\b/i, termine: "scarpe", intent: "product" },
  { pattern: /\bmaglietta|magliette|maglia|maglie\b/i, termine: "maglia", intent: "product" },
];

export function usaFastPathSemantico(query: string, analisi: PinoIntentAnalysis): boolean {\n  const q = normalizzaRichiesta(query).trim();\n  return CANONICI_RICERCA.some((x) => x.pattern.test(q)) ||\n    /\\b(?:analcolic(?:a|o|he|i)|non\\s+(?:alcol(?:ica|ico)?|alcol)|senza\\s+(?:alcol(?:ica|ico)?|alcol))\\b/i.test(q) ||\n    /\\b(?:sotto|sopra|massimo|minimo|meno di|piu di|più di|entro|fino a|tra)\\b/i.test(q);\n}\n\nfunction pianoLocaleIntelligente(query: string, analisi: PinoIntentAnalysis): PinoSemanticPlan | null {
  const q = normalizzaRichiesta(query).trim();
  if (!q) return null;
  const match = CANONICI_RICERCA.find((x) => x.pattern.test(q));
  const haEsclusioneAlcol = /\b(?:non|senza)\s+(?:alcol(?:ica|ico)?|alcol)\b|\banalcolic(?:a|o|he|i)\b/i.test(q);
  const haPrezzo = /\b(?:sotto|sopra|massimo|minimo|meno di|piu di|più di|entro|fino a|tra)\b/i.test(q);
  const haCitta = /\b(?:a|in)\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40}/.test(query);
  if (!match && !haEsclusioneAlcol && !haPrezzo && analisi.confidence === "bassa") return null;

  const termine = match?.termine ?? q
    .replace(/\b(?:voglio|vorrei|cerco|cerca|trovami|mi serve|fammi trovare|dammi|delle|degli|del|della|dei|di|una|un|uno|per|con|senza|non)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)[0] ?? q;

  const esclusioni: string[] = [];
  if (haEsclusioneAlcol) esclusioni.push("alcolica");

  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  const range = q.match(/(?:tra|da)\s*(\d+(?:[.,]\d+)?)\s*(?:e|a)\s*(\d+(?:[.,]\d+)?)/i);
  const max = q.match(/(?:sotto|massimo|meno di|entro|fino a)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/i);
  const min = q.match(/(?:sopra|minimo|piu di|più di)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/i);
  if (range) {
    minPrice = Number(range[1].replace(",", "."));
    maxPrice = Number(range[2].replace(",", "."));
  } else {
    if (max) maxPrice = Number(max[1].replace(",", "."));
    if (min) minPrice = Number(min[1].replace(",", "."));
  }

  let city: string | null = null;
  if (haCitta) {
    const m = query.match(/\b(?:a|in)\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})/);
    city = m?.[1]?.trim() || null;
  }

  const intent = match?.intent ?? analisi.intent;
  const surface: PinoSemanticPlan["surface"] =
    intent === "service" ? "stores" :
    intent === "generic" ? "none" : "products";

  return {
    surface,
    intent,
    query: termine.slice(0, 120),
    terms: Array.from(new Set([termine, ...(match ? [match.termine] : [])])).slice(0, 5),
    exclusions,
    minPrice,
    maxPrice,
    city,
    openNow: /\b(?:aperto|aperta|aperti|aperte|ora|adesso)\b/i.test(q),
    confidence: match || haEsclusioneAlcol || haPrezzo ? "alta" : analisi.confidence,
  };
}

function fallbackPlan(query: string, analisi: PinoIntentAnalysis): PinoSemanticPlan {
  const q = normalizzaRichiesta(query);
  const tokens = q
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !/^(cerco|cerca|trovami|trova|vorrei|voglio|mi|serve|un|una|uno|per|con|di|a|da|il|lo|la|i|gli|le|e|in|su|del|della|dei|delle|sotto|sopra|massimo|minimo|euro)$/.test(t));
  const mMax = q.match(/(?:sotto|massimo|fino a|entro|meno di)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/);
  const mMin = q.match(/(?:sopra|minimo|piu di|più di|oltre)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/);
  const mRange = q.match(/(?:tra|da)\s*(\d+(?:[.,]\d+)?)\s*(?:e|a)\s*(\d+(?:[.,]\d+)?)/);
  const maxPrice = mRange ? Number(mRange[2].replace(",", ".")) : mMax ? Number(mMax[1].replace(",", ".")) : null;
  const minPrice = mRange ? Number(mRange[1].replace(",", ".")) : mMin ? Number(mMin[1].replace(",", ".")) : null;
  const exclusions: string[] = [];
  const neg = q.match(/\b(?:non|senza)\s+([a-z0-9àèéìòù-]+)/);
  if (neg?.[1]) exclusions.push(neg[1]);

  const surface =
    analisi.intent === "service" ? "stores" :
    analisi.intent === "generic" ? "none" :
    "both";

  return {
    surface,
    intent: analisi.intent,
    query: tokens.slice(0, 3).join(" "),
    terms: tokens.slice(0, 5),
    exclusions,
    minPrice,
    maxPrice,
    city: null,
    openNow: /\b(?:aperto|aperta|aperti|aperte|ora|adesso)\b/.test(q),
    confidence: analisi.confidence,
  };
}

export async function interpretaRichiestaPino(
  query: string,
  history: MessaggioAssistente[],
  analisi: PinoIntentAnalysis,
  memoria: PinoMemoriaVoce[]
): Promise<PinoSemanticPlan> {
  const fallback = fallbackPlan(query, analisi);
  const q = query.trim();

  if (!q || analisi.intent === "generic") return fallback;

  const fastPlan = pianoLocaleIntelligente(q, analisi);\n  if (fastPlan) return fastPlan;\n\n  const memoriaTesto = memoria.slice(0, 4)
    .map((m) => `${m.termine}=>${m.concetto}`)
    .join(", ") || "nessuna";

  try {
    const storico = history
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 240)}`)
      .join("\n");

    const raw = await callGeminiText({
      systemPrompt: SCHEMA_PROMPT,
      userPrompt:
        `Intento locale già riconosciuto: ${analisi.intent} / ${analisi.dominio}.\n` +
        `Memoria semantica confermata: ${memoriaTesto}\n\n` +
        `CONVERSAZIONE:\n${storico}\n\nRICHIESTA ATTUALE:\n${q}`,
      maxTokens: 300,
      temperature: 0,
      json: true,
      timeoutMs: 8_000,
      retries: 1,
    });

    const parsed = JSON.parse(extractJsonFromText(raw)) as Record<string, unknown>;
    const surface =
      parsed.surface === "products" || parsed.surface === "stores" ||
      parsed.surface === "both" || parsed.surface === "none"
        ? parsed.surface
        : fallback.surface;
    const intent =
      parsed.intent === "product" || parsed.intent === "service" ||
      parsed.intent === "food" || parsed.intent === "drink" ||
      parsed.intent === "gift" || parsed.intent === "generic"
        ? parsed.intent
        : fallback.intent;

    const intentFinal = analisi.confidence === "alta" ? analisi.intent : intent;
    const terms = pulisciLista(parsed.terms, 5);
    const exclusions = pulisciLista(parsed.exclusions, 5);
    const minPrice = numeroValido(parsed.minPrice);
    const maxPrice = numeroValido(parsed.maxPrice);
    const city = typeof parsed.city === "string"
      ? normalizzaRichiesta(parsed.city).trim().slice(0, 60) || null
      : null;
    const queryPlan = (terms.length ? terms[0] : fallback.query).slice(0, 120);

    return {
      surface: intentFinal === "service" ? "stores" : surface,
      intent: intentFinal,
      query: queryPlan,
      terms: terms.length ? terms : fallback.terms,
      exclusions,
      minPrice,
      maxPrice,
      city,
      openNow: parsed.openNow === true || fallback.openNow,
      confidence:
        parsed.confidence === "alta" || parsed.confidence === "media" || parsed.confidence === "bassa"
          ? parsed.confidence
          : fallback.confidence,
    };
  } catch (error) {
    console.warn("[pino-semantic] planner non disponibile, fallback locale:", error);
    return fallback;
  }
}
