/**
 * LocalHub Brain — Reasoning Step: Classify
 *
 * Classifica l'intento della query dell'utente usando pattern matching locale.
 * Non richiede chiamate LLM.
 */

import type { QueryIntent, QueryIntentType } from "../../types";

/** Pattern per riconoscere i vari tipi di intento */
const PATTERNS = {
  urgency: [
    /\b(adesso|ora|subito|urgente|aperto|aperta|aperti|aperte)\b/i,
    /\b(oggi|stasera|domani)\b/i,
    /\b(chiuso|chiusa|chiusi|chiuse)\b/i,
  ],

  location_specific: [
    /\b(vicino|vicina|vicini|vicine)\s+(a\s+)?/i,
    /\b(presso|nei pressi|in zona|zona)\b/i,
    /\b(piazza|via|corso|viale|strada)\s+\w+/i,
    /\b(centro|periferia|quartiere)\b/i,
  ],

  comparison: [
    /\b(meglio|migliore|differenza|confronto|meglio|preferisco)\b/i,
    /\b(tra|vs|versus|oppure)\b/i,
    /\bo\s+\w+\?/i, // "A o B?"
  ],

  need_expression: [
    /\b(ho|abbiamo|cerco|cercasi|serve|servono|mi serve|ci serve)\b/i,
    /\b(bisogno|necessità|problema|male|dolore)\b/i,
    /\b(vorrei|voglio|desidero|mi piacerebbe)\b/i,
  ],

  direct_search: [
    /^[a-z]+$/i, // singola parola (es. "pizzeria")
    /^[a-z]+\s+[a-z]+$/i, // due parole (es. "negozio scarpe")
  ],

  // unknown: nessun pattern specifico — usato come fallback
  unknown: [] as RegExp[],
} satisfies Record<QueryIntentType, RegExp[]>;

/** Parole chiave per estrarre entità geografiche */
const LOCATION_KEYWORDS = [
  "piazza",
  "via",
  "corso",
  "viale",
  "strada",
  "centro",
  "zona",
  "quartiere",
];

/** Parole chiave temporali */
const TIME_KEYWORDS = ["adesso", "ora", "subito", "oggi", "stasera", "domani"];

/** Parole chiave di bisogno/problema */
const NEED_KEYWORDS = [
  "bisogno",
  "necessità",
  "problema",
  "male",
  "dolore",
  "urgente",
  "serve",
];

/**
 * Estrae entità dalla query basandosi sul tipo di intento.
 */
function extractEntities(
  query: string,
  intentType: QueryIntentType
): string[] {
  const entities: string[] = [];
  const lowerQuery = query.toLowerCase();

  // Entità temporali
  if (intentType === "urgency") {
    for (const keyword of TIME_KEYWORDS) {
      if (lowerQuery.includes(keyword)) {
        entities.push(keyword);
      }
    }
  }

  // Entità geografiche
  if (intentType === "location_specific") {
    for (const keyword of LOCATION_KEYWORDS) {
      if (lowerQuery.includes(keyword)) {
        // Cerca di estrarre il nome completo dopo la keyword
        const regex = new RegExp(`${keyword}\\s+([a-z\\s]+)`, "i");
        const match = query.match(regex);
        if (match) {
          entities.push(`${keyword} ${match[1].trim()}`);
        } else {
          entities.push(keyword);
        }
      }
    }
  }

  // Entità di bisogno
  if (intentType === "need_expression") {
    for (const keyword of NEED_KEYWORDS) {
      if (lowerQuery.includes(keyword)) {
        entities.push(keyword);
      }
    }
  }

  // Entità di confronto
  if (intentType === "comparison") {
    const words = query.split(/\s+/);
    // Cerca parole che potrebbero essere i soggetti del confronto
    const candidateWords = words.filter(
      (w) => w.length > 3 && !/^(meglio|tra|oppure|o|vs|versus)$/i.test(w)
    );
    if (candidateWords.length >= 2) {
      entities.push(...candidateWords.slice(0, 2));
    }
  }

  return entities;
}

/**
 * Calcola il livello di confidenza basandosi su quanti pattern matchano.
 */
function calculateConfidence(
  matchedPatterns: number,
  totalPatterns: number
): number {
  if (matchedPatterns === 0) return 30; // bassa confidenza se nessun pattern

  const baseConfidence = 50;
  const matchRatio = matchedPatterns / totalPatterns;
  const bonusConfidence = matchRatio * 40;

  return Math.min(95, Math.round(baseConfidence + bonusConfidence));
}

/**
 * Classifica la query e determina l'intento dell'utente.
 */
export function classifyIntent(query: string): QueryIntent {
  const normalized = query.toLowerCase().trim();

  // Testa ogni tipo di intento
  const scores: Record<QueryIntentType, number> = {
    urgency: 0,
    location_specific: 0,
    comparison: 0,
    need_expression: 0,
    direct_search: 0,
    unknown: 0,
  };

  // Conta quanti pattern matchano per ogni intento
  for (const [intentKey, patterns] of Object.entries(PATTERNS)) {
    const intentType = intentKey as QueryIntentType;
    let matches = 0;

    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        matches++;
      }
    }

    scores[intentType] = matches;
  }

  // Determina l'intento con il punteggio più alto
  let maxScore = 0;
  let detectedIntent: QueryIntentType = "unknown";

  for (const [intentType, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedIntent = intentType as QueryIntentType;
    }
  }

  // Se nessun pattern ha matchato e la query è molto corta, assume direct_search
  if (detectedIntent === "unknown" && normalized.split(/\s+/).length <= 2) {
    detectedIntent = "direct_search";
    maxScore = 1;
  }

  const confidence = calculateConfidence(
    maxScore,
    PATTERNS[detectedIntent]?.length ?? 1
  );

  const entities = extractEntities(query, detectedIntent);

  return {
    type: detectedIntent,
    confidence,
    extractedEntities: entities,
  };
}
