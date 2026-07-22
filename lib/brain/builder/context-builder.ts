/**
 * LocalHub Brain — Context Builder
 *
 * Assembla un BrainContext strutturato a partire da una query grezza.
 */

import { classifyIntent } from "../reasoning/steps/classify";
import { makeDecision } from "../reasoning/decision-engine";
import type { BrainContext, UserContext } from "../types";

/** Opzioni per la costruzione del contesto */
export interface BuildContextOptions {
  userId?: string;
  sessionId?: string;
  useMemory?: boolean;
}

/** Stopwords italiane da eliminare */
const ITALIAN_STOPWORDS = new Set([
  "a", "ad", "al", "alla", "alle", "allo", "ai", "agli", "all",
  "che", "chi", "con", "da", "dei", "del", "della", "delle", "dello",
  "di", "e", "ed", "gli", "ha", "hai", "ho", "i", "il", "in",
  "io", "la", "le", "lo", "mi", "mia", "mio", "mie", "miei",
  "nel", "nella", "nelle", "nei", "per", "su", "suo", "sua", "suoi",
  "sue", "tra", "tu", "un", "una", "uno", "ma", "se", "o", "non",
]);

/**
 * Normalizza una stringa rimuovendo accenti e convertendo in minuscolo.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Estrae i termini significativi dalla query eliminando stopwords.
 */
function extractTerms(query: string): string[] {
  const normalized = normalize(query);
  const tokens = normalized
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  return tokens.filter((term) => !ITALIAN_STOPWORDS.has(term));
}

/**
 * Espansione semplice della query con sinonimi comuni italiani.
 * Questa è la versione base senza LLM.
 */
function expandQuery(query: string): string {
  const synonyms: Record<string, string[]> = {
    bar: ["bar", "caffè", "caffetteria", "cafe"],
    pizza: ["pizza", "pizzeria", "pizze"],
    farmacia: ["farmacia", "parafarmacia", "medicinali"],
    ristorante: ["ristorante", "trattoria", "osteria", "locanda"],
    negozio: ["negozio", "shop", "store", "bottega"],
    parrucchiere: ["parrucchiere", "barber", "barbiere", "salone"],
    auto: ["auto", "macchina", "automobile", "veicolo"],
    casa: ["casa", "arredo", "arredamento", "mobili"],
    sport: ["sport", "palestra", "fitness", "gym"],
    animali: ["animali", "pet", "cane", "gatto"],
  };

  const normalized = normalize(query);
  let expanded = query;

  for (const [key, values] of Object.entries(synonyms)) {
    if (normalized.includes(key)) {
      expanded += " " + values.join(" ");
    }
  }

  return expanded;
}

/**
 * Crea il contesto temporale attuale.
 */
function createTemporalContext() {
  const now = new Date();
  return {
    timestamp: now,
    dayOfWeek: now.getDay(),
    hourOfDay: now.getHours(),
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
  };
}

/**
 * Crea il contesto utente opzionale.
 */
function createUserContext(options: BuildContextOptions): UserContext | null {
  if (!options.userId && !options.sessionId) {
    return null;
  }

  return {
    userId: options.userId ?? null,
    sessionId: options.sessionId ?? crypto.randomUUID(),
    recentQueries: [],
    preferredCategories: [],
  };
}

/**
 * Costruisce un BrainContext completo a partire dalla query.
 */
export function buildBrainContext(
  query: string,
  options: BuildContextOptions = {}
): BrainContext {
  const queryTrimmed = query.trim();

  // Classifica l'intento
  const intent = classifyIntent(queryTrimmed);

  // Produce il piano di esecuzione dal Decision Engine
  const decisionPlan = makeDecision(intent);

  return {
    query: queryTrimmed,
    queryExpanded: expandQuery(queryTrimmed),
    queryTerms: extractTerms(queryTrimmed),
    intent,
    decisionPlan,
    candidates: [],
    userContext: createUserContext(options),
    temporalContext: createTemporalContext(),
  };
}
