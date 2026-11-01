/**
 * Pino Unified Understanding
 *
 * Shared, language-agnostic helpers for interpreting natural catalog requests.
 * These helpers deliberately do not invent catalog data: they only normalize
 * wording so the semantic planner and deterministic retrieval can agree.
 */

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

/** Detects the dominant language of a short request; Italian is the safe default. */
export function rilevaLinguaPino(testo: string, fallback: PinoLanguage = "it"): PinoLanguage {
  const q = String(testo ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[’‘]/g, "'");
  if (!q.trim()) return fallback;

  if (/\b(?:cosa cerchi|come posso|puoi aiutarmi|mi puoi aiutare|vorrei sapere|dimmi|che cosa|dove posso|quanto costa|quanto costano|va bene|tutto bene|non trovo|non ho|cerco un|cerco una)\\b/.test(q)) return "it";
  if (/\b(?:what do you|how do i|can you help|could you|would you|i'?m looking|i want|i need|please find|show me|tell me|where can i|what'?s up|how much|good morning|good afternoon)\\b/.test(q)) return "en";

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
  ]);
  const score = (set: Set<string>) => parole.reduce((n, p) => n + (set.has(p) ? 1 : 0), 0);
  const si = score(it);
  const se = score(en);
  if (se > si) return "en";
  if (si > se) return "it";

  if (/\b(?:how are you|how's it going|how is it going|would you|do you|can we|let'?s|thank you|you are|are you|see you|good morning|good evening)\b/.test(q)) return "en";
  if (/\b(?:come stai|come va|ti va|vuoi|grazie|buongiorno|buonasera|ciao)\b/.test(q)) return "it";
  return fallback;
}

/** Keeps the language of the conversation when the newest message is too short to classify. */
export function rilevaLinguaConversazionePino(
  messages: Array<{ role: string; content: string }>,
  fallback: PinoLanguage = "it"
): PinoLanguage {
  let lingua = fallback;
  for (const message of messages ?? []) {
    if (message?.role !== "user" || typeof message.content !== "string") continue;
    lingua = rilevaLinguaPino(message.content, lingua);
  }
  return lingua;
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
    [/\b(?:leather strap|leather band)\b/gi, "cinturino in pelle"],
    [/\b(?:leather)\b/gi, "pelle"],
    [/\b(?:men's|mens|for men)\b/gi, "da uomo"],
    [/\b(?:women's|womens|for women)\b/gi, "da donna"],
    [/\bwith\b/gi, "con"],
  ];
  for (const [pattern, sostituzione] of traduzioni) q = q.replace(pattern, sostituzione);

  // Normalize common Italian catalog questions to the subject being requested.
  // In this question frame, plural "paste" refers to the pasta category.
  q = q.replace(/\b(?:quali|quanta|quanto|quanti|quante|che)\s+(?:tipi\s+di\s+)?past[ae]\b/gi, "pasta");

  // Remove first-person budget framing BEFORE stripping the numeric amount.
  // Otherwise "I have 100 euros and want a watch" loses "100 euros" first,
  // leaving the orphaned verb "have" in the catalog query.
  q = q.replace(/\b(?:i have|i['’]ve got|ive got)\b/gi, " ");

  // Price ranges and constraints in either language.
  q = q
    .replace(/\b(?:between|tra|da)\s*\$?\s*\d+(?:[.,]\d+)?\s*(?:and|e|a|to)\s*\$?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd|€|\$)?\b/gi, " ")
    .replace(/\b(?:under|below|up to|less than|no more than|not over|over|above|more than|at least|at most|sotto|sopra|massimo|minimo|meno di|piu di|oltre|entro|fino a|non oltre|al massimo|budget(?: of| di)?)\s*(?:€|\$)?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)?/gi, " ")
    .replace(/\b(?:i have|i've got|ive got|with|my budget is|budget of|ho|con|dispongo di|a disposizione(?: di)?)\s*(?:a budget of\s*)?(?:€|\$)?\s*\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)\b/gi, " ")
    .replace(/(?:€|\$)\s*\d+(?:[.,]\d+)?/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:euros?|eur|dollars?|usd)\b/gi, " ");

  // Open-now wording is a constraint, not part of the catalog subject.
  q = q.replace(/\b(?:aperto|aperta|aperti|aperte)\s+(?:ora|adesso)\b|\b(?:open|opened)\s+(?:right\s+)?now\b|\bcurrently\s+open\b|\bopen\s+at\s+the\s+moment\b/gi, " ");

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
