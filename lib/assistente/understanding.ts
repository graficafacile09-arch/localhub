/**
 * Pino Unified Understanding
 *
 * Shared, language-agnostic helpers for interpreting natural catalog requests.
 * These helpers deliberately do not invent catalog data: they only normalize
 * wording so the semantic planner and deterministic retrieval can agree.
 */

export type PinoLanguage = "it" | "en";

/** Detects the dominant language of a short request; Italian is the safe default. */
export function rilevaLinguaPino(testo: string, fallback: PinoLanguage = "it"): PinoLanguage {
  const q = String(testo ?? "").toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, " ");
  if (!q.trim()) return fallback;

  const parole = q.match(/[a-z]+/g) ?? [];
  const it = new Set([
    "ciao", "cerco", "cerca", "trovami", "trova", "voglio", "vorrei", "mi", "serve",
    "ho", "con", "sotto", "sopra", "entro", "fino", "massimo", "minimo", "euro",
    "negozio", "negozi", "prodotto", "prodotti", "orologio", "orologi", "qualcosa",
    "simile", "costa", "quanto", "aperto", "aperta", "vicino", "grazie", "per",
    "una", "uno", "del", "della", "dei", "delle", "che", "come", "dove",
  ]);
  const en = new Set([
    "hi", "hello", "please", "find", "show", "looking", "want", "need", "have",
    "with", "under", "below", "above", "over", "between", "budget", "dollars",
    "dollar", "euros", "euro", "watch", "watches", "something", "similar", "like",
    "that", "cheaper", "open", "now", "near", "store", "stores", "product",
    "products", "thanks", "thank", "you", "the", "for", "me", "and", "or",
    "could", "would", "get", "buy", "want", "i", "my", "it",
  ]);
  const score = (set: Set<string>) => parole.reduce((n, p) => n + (set.has(p) ? 1 : 0), 0);
  const si = score(it);
  const se = score(en);
  if (se > si) return "en";
  if (si > se) return "it";
  // Common English sentence openings resolve ties without requiring a long sample.
  if (/\b(?:i want|i need|i have|find me|show me|looking for|can you|could you|please)\b/.test(q)) return "en";
  return fallback;
}

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

  // Price ranges and constraints in either language.
  q = q
    .replace(/\b(?:between|tra|da)\s*\$?\s*\d+(?:[.,]\d+)?\s*(?:and|e|a|to)\s*\$?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd|€|\$)?\b/gi, " ")
    .replace(/\b(?:under|below|up to|less than|no more than|not over|over|above|more than|at least|at most|sotto|sopra|massimo|minimo|meno di|piu di|oltre|entro|fino a|non oltre|al massimo|budget(?: of| di)?)\s*(?:€|\$)?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)?/gi, " ")
    .replace(/\b(?:i have|i've got|ive got|with|my budget is|budget of|ho|con|dispongo di|a disposizione(?: di)?)\s*(?:a budget of\s*)?(?:€|\$)?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)\b/gi, " ")
    .replace(/(?:€|\$)\s*\d+(?:[.,]\d+)?/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)\b/gi, " ");

  // Phrases that describe the act of searching rather than the desired item.
  q = q
    .replace(/\b(?:or something similar|or something like that|or similar|something similar|something like that|anything similar|similar items|other similar options)\b/gi, " ")
    .replace(/\b(?:i am looking for|i'm looking for|im looking for|looking for|i would like|i'd like|id like|i want|i need|can you find|could you find|find me|show me|help me find|please find|please show|i am after|im after)\b/gi, " ")
    .replace(/\b(?:voglio|vorrei|cerco|cerca|trovami|trova|mi serve|fammi trovare|dammi|per favore|per piacere|qualcosa di simile|o qualcosa di simile|o simile)\b/gi, " ")
    .replace(/\b(?:please|the|a|an|some|any|for me|me|i|my|and|or|with|for|of|to|a|un|una|uno|il|lo|la|i|gli|le|del|della|dei|delle|di|da|con|per|e)\b/gi, " ")
    .replace(/[?!,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return q;
}
