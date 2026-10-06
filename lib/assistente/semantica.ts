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
import { rilevaFollowUp } from "./conversazione";
import { estraiCitta } from "@/lib/localita";
import { analizzaIntentoPino, type PinoIntent, type PinoIntentAnalysis } from "./intent";
import { SINONIMI_DIRETTI_PRODOTTO, SINONIMI_TIPO_ATTIVITA } from "@/lib/ricerca-semantica";
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

export type PinoConversationState = {
  richiesta: string;
  query: string | null;
  intent: PinoIntent;
  exclusions: string[];
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  openNow: boolean;
  confidence: "alta" | "media" | "bassa";
  attivo: boolean;
};

/**
 * Costruisce uno stato semantico esplicito dalla conversazione recente.
 *
 * Lo stato viene calcolato in modo deterministico e resta confinato a Pino:
 * non scrive sul DB e non modifica la ricerca pubblica. La regola importante
 * è che l'ultimo messaggio può modificare lo stato precedente senza portarsi
 * dietro filtri obsoleti (prezzo/città/reset).
 */
export function costruisciStatoConversazionale(
  history: MessaggioAssistente[]
): PinoConversationState {
  const utenti = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);

  const corrente = utenti[utenti.length - 1] ?? "";
  if (!corrente) {
    return {
      richiesta: "",
      query: null,
      intent: "generic",
      exclusions: [],
      minPrice: null,
      maxPrice: null,
      city: null,
      openNow: false,
      confidence: "bassa",
      attivo: false,
    };
  }

  // Riutilizziamo la stessa logica di contesto già verificata e la trasformiamo
  // subito in uno stato strutturato. In questo modo i livelli successivi non
  // devono reinterpretare ogni volta la cronologia in modo diverso.
  const richiesta = arricchisciRichiestaConContesto(corrente, history);
  const analisi = analizzaIntentoPino(richiesta);
  const piano = pianoLocaleIntelligente(richiesta, analisi);

  // Follow-up puri senza un piano locale (es. "fammi vedere altro") mantengono
  // comunque il soggetto della conversazione; non diventano una nuova ricerca.
  if (!piano) {
    const follow = rilevaFollowUp(corrente);
    if (follow && utenti.length >= 2) {
      const soggetto = [...utenti.slice(0, -1)].reverse().find((q) => !rilevaFollowUp(q));
      if (soggetto) {
        const base = analizzaIntentoPino(soggetto);
        return {
          richiesta,
          query: soggetto,
          intent: base.intent,
          exclusions: [],
          minPrice: null,
          maxPrice: null,
          city: null,
          openNow: false,
          confidence: base.confidence,
          attivo: true,
        };
      }
    }
    return {
      richiesta,
      query: null,
      intent: analisi.intent,
      exclusions: [],
      minPrice: null,
      maxPrice: null,
      city: null,
      openNow: false,
      confidence: analisi.confidence,
      attivo: false,
    };
  }

  return {
    richiesta,
    query: piano.query || null,
    intent: piano.intent,
    exclusions: piano.exclusions,
    minPrice: piano.minPrice,
    maxPrice: piano.maxPrice,
    city: piano.city,
    openNow: piano.openNow,
    confidence: piano.confidence,
    attivo: piano.surface !== "none" && Boolean(piano.query),
  };
};

const SCHEMA_PROMPT = `Interpreta una richiesta dell'utente per la ricerca locale di InCittà.
NON rispondere all'utente. Devi produrre SOLO JSON valido.

Regole:
- Comprendi italiano e inglese naturali, inclusi plurali, sinonimi, forme colloquiali e abbreviazioni.
- Se la richiesta è in inglese, produci comunque lo stesso JSON strutturato e normalizza il soggetto in una forma utile alla ricerca nel catalogo.
- Comprendi richieste come "under 100", "below 100", "up to 100", "over 50", "between 50 and 100", "open now" e "near the center".
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

const VOCABOLARIO_PINO_BASE: Array<[string, string]> = [
  ["birra", "birra"], ["birretta", "birra"], ["birrette", "birra"],
  ["analcolica", "analcolica"], ["analcolico", "analcolica"],
  ["vino", "vino"], ["vini", "vino"], ["acqua", "acqua"],
  ["pizza", "pizza"], ["pizze", "pizza"], ["panino", "panino"], ["panini", "panino"],
  ["telefono", "telefono"], ["telefoni", "telefono"], ["telefonino", "telefono"],
  ["cellulare", "telefono"], ["smartphone", "telefono"],
  ["scarpa", "scarpa"], ["scarpe", "scarpa"],
  ["maglia", "maglia"], ["maglietta", "maglia"], ["magliette", "maglia"],
];

const VOCABOLARIO_PINO: Array<[string, string]> = (() => {
  const mappa = new Map<string, string>(VOCABOLARIO_PINO_BASE);

  // Riutilizziamo il vocabolario semantico già presente nel motore InCittà:
  // errori di battitura su prodotti, categorie e servizi vengono corretti
  // verso un termine reale già conosciuto dal catalogo.
  for (const gruppo of SINONIMI_DIRETTI_PRODOTTO) {
    for (const voce of gruppo) {
      for (const token of normalizzaRichiesta(voce).split(/\\s+/)) {
        if (token.length >= 4) mappa.set(token, token);
      }
    }
  }

  for (const gruppo of Object.values(SINONIMI_TIPO_ATTIVITA)) {
    for (const voce of gruppo) {
      for (const token of normalizzaRichiesta(voce).split(/\\s+/)) {
        if (token.length >= 4) mappa.set(token, token);
      }
    }
  }

  return Array.from(mappa.entries());
})();

function correggiErroriBattitura(query: string): string {
  return query.split(/(\\s+)/).map((part) => {
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(part)) return part;
    const lower = part.toLocaleLowerCase("it-IT");
    if (lower.length < 4) return part;
    let best = lower;
    let bestDistance = Infinity;
    for (const [word, canonical] of VOCABOLARIO_PINO) {
      if (Math.abs(word.length - lower.length) > 2) continue;
      const d = distanzaLevenshtein(lower, word);
      const soglia = lower.length <= 5 ? 1 : 2;
      if (d <= soglia && d < bestDistance) {
        best = canonical;
        bestDistance = d;
      }
    }
    return bestDistance < Infinity ? best : part;
  }).join("");
}

/**
 * Applica SOLO le associazioni di memoria esplicitamente apprese come
 * correzione semantica e già consolidate. La sostituzione è token-aware:
 * "birrra," viene corretto, ma "birrraio" no.
 *
 * La query originale resta intatta nel flusso dell'interfaccia; questa funzione
 * produce esclusivamente la variante usata dal planner/retrieval. Le soglie
 * vengono ricontrollate qui per evitare che una voce debole possa alterare la
 * ricerca anche se arriva da un chiamante futuro diverso da recuperaMemoria().
 */
export function applicaMemoriaSemantica(
  query: string,
  memoria: PinoMemoriaVoce[]
): string {
  const originale = (query ?? "").trim();
  if (!originale || !memoria?.length) return originale;

  const correzioni = memoria
    .filter(
      (m) =>
        m.tipo === "correzione_semantica" &&
        m.frequenza >= 2 &&
        m.confidence >= 0.70
    )
    .map((m) => ({
      termine: normalizzaRichiesta(m.termine ?? "").trim(),
      concetto: normalizzaRichiesta(m.concetto ?? "").trim(),
    }))
    .filter(
      (m) =>
        m.termine.length >= 4 &&
        m.concetto.length >= 2 &&
        m.termine !== m.concetto &&
        !m.termine.includes(" ") &&
        !m.concetto.includes(" ")
    )
    .sort((a, b) => b.termine.length - a.termine.length);

  let risultato = originale;
  for (const correzione of correzioni.slice(0, 6)) {
    const escaped = correzione.termine.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      "(^|[^A-Za-zÀ-ÖØ-öø-ÿ0-9])" +
        escaped +
        "(?=$|[^A-Za-zÀ-ÖØ-öø-ÿ0-9])",
      "gi"
    );
    risultato = risultato.replace(re, "$1" + correzione.concetto);
  }

  return risultato.replace(/\s+/g, " ").trim();
}

/**
 * Collega una modifica breve alla ricerca sostanziale più recente.
 *
 * La ricerca precedente non è necessariamente l'ultimo messaggio dell'utente:
 * in una catena come "scarpe da uomo" -> "eleganti" -> "sotto 100 euro" ->
 * "nere", il soggetto va recuperato dal primo messaggio concreto e i
 * modificatori intermedi vanno mantenuti.
 */
export function arricchisciRichiestaConContesto(
  query: string,
  history: MessaggioAssistente[]
): string {
  const corrente = (query ?? "").trim();
  const q = normalizzaRichiesta(corrente);
  if (!q) return corrente;

  const parole = q.split(/\s+/).filter(Boolean);
  if (parole.length > 8) return corrente;

  const RE_RESET_PREZZO =
    /\b(?:lascia\s+perdere|togli|rimuovi|ignora)\s+(?:il\s+)?(?:filtro\s+)?(?:del\s+|di\s+)?prezzo\b|\b(?:senza|non\s+importa)\s+(?:il\s+)?(?:limite\s+di\s+)?prezzo\b/i;
  const RE_CLAUSOLA_PREZZO =
    /\b(?:sotto|sopra|massimo|minimo|meno\s+di|piu\s+di|più\s+di|entro|fino\s+a|tra|da|under|below|up\s+to|over|above|more\s+than|less\s+than|between)\s*(?:€\s*)?\d+(?:[.,]\d+)?(?:\s*(?:e|a|and|to)\s*(?:€\s*)?\d+(?:[.,]\d+)?)?/gi;
  const estraiCittaEsplicita = (testo: string): string | null => {
    const normalizzata = normalizzaRichiesta(testo);
    const citta = estraiCitta(normalizzata);
    if (!citta) return null;
    return new RegExp("\\b(?:a|in)\\s+" + citta + "\\b", "i").test(normalizzata)
      ? citta
      : null;
  };
  const rimuoviPrezzo = (testo: string): string =>
    testo
      .replace(RE_CLAUSOLA_PREZZO, " ")
      .replace(/\\s+/g, " ")
      .trim();
  const rimuoviCitta = (testo: string, citta: string | null): string => {
    if (!citta) return testo;
    const escaped = citta.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    return testo
      .replace(new RegExp("\\b(?:a|in)\\s+" + escaped + "\\b", "gi"), " ")
      .replace(/\\s+/g, " ")
      .trim();
  };

  const haSoggettoConcreto = (testo: string): boolean => {
    const normalizzata = normalizzaRichiesta(testo);
    if (!normalizzata) return false;
    if (CANONICI_RICERCA.some((x) => x.pattern.test(normalizzata))) return true;
    if (/\b(?:parrucchier[ei]|barbier[ei]|farmaci[ae]|ristorant[ei]|pizzeri[ae]|negozio|negozi|hotel|idraulico|elettricista|calzolaio|dentista|oculista|meccanico|gommista|sartoria|fotografo|tipografia)\b/i.test(normalizzata)) {
      return true;
    }
    const analisi = analizzaIntentoPino(normalizzata);
    return analisi.intent !== "generic" && analisi.confidence !== "bassa";
  };

  // Una nuova richiesta con un soggetto proprio non deve ereditare il contesto.
  if (haSoggettoConcreto(corrente)) return corrente;

  const utenti = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (utenti.length < 2) return corrente;

  if (/^(?:ok|okay|va bene|perfetto|grazie|grazie mille|ciao|buongiorno|buonasera)$/.test(q)) {
    return corrente;
  }

  let indiceBase = -1;
  for (let i = utenti.length - 2; i >= 0; i--) {
    if (haSoggettoConcreto(utenti[i])) {
      indiceBase = i;
      break;
    }
  }
  if (indiceBase < 0) return corrente;

  let parti = utenti.slice(indiceBase, utenti.length - 1);
  const haNuovoPrezzo = RE_CLAUSOLA_PREZZO.test(corrente);
  RE_CLAUSOLA_PREZZO.lastIndex = 0;
  const resetPrezzo = RE_RESET_PREZZO.test(q);

  // Un nuovo vincolo economico sostituisce quello precedente. Questo evita
  // che "sotto 100" + "anzi sotto 70" venga interpretato ancora come 100.
  if (haNuovoPrezzo || resetPrezzo) {
    parti = parti.map(rimuoviPrezzo).filter(Boolean);
  }

  const nuovaCitta = estraiCittaEsplicita(corrente);
  if (nuovaCitta) {
    // Anche la città è un filtro sostituibile: "a Castrovillari" → "a Cosenza".
    parti = parti
      .map((p) => {
        const cittaPrecedente = estraiCittaEsplicita(p);
        return rimuoviCitta(p, cittaPrecedente);
      })
      .filter(Boolean);
  }

  // Un reset del prezzo è un comando di stato, non testo da cercare.
  if (resetPrezzo) {
    return [...parti].join(" ").replace(/\\s+/g, " ").trim().slice(0, 500) || corrente;
  }

  const modificaEsplicita =
    /\b(?:elegant[ei]|sportiv[oi]|casual|da uomo|da donna|per uomo|per donna|per bambini?|economich[ei]|economico|costos[oi]|nere?|bianch[ei]|ross[aei]|blu|verdi?|gialle?|grigie?|marron[ei]|piccol[oi]|grand[ei]|nuov[oi]|usato|usata|usati|usate|senza|non|sotto|sopra|massimo|minimo|entro|fino|tra|vicino|vicina|vicinanze|aperto|aperta|aperti|aperte|oggi|domani|stasera|adesso|ora)\b/i;

  const intermedi =
    parti.length === 0
      ? []
      : parti.filter((p) => {
          const pn = normalizzaRichiesta(p);
          const n = pn.split(/\s+/).filter(Boolean).length;
          return n <= 8 && (modificaEsplicita.test(pn) || n <= 2);
        });

  if (parti.length > 0 && intermedi.length !== parti.length) return corrente;

  return [...parti, corrente].join(" ").slice(0, 500);
}

export function usaFastPathSemantico(query: string, analisi: PinoIntentAnalysis): boolean {
  const q = correggiErroriBattitura(normalizzaRichiesta(query)).trim();
  return CANONICI_RICERCA.some((x) => x.pattern.test(q)) ||
    /\b(?:analcolic(?:a|o|he|i)|non\s+(?:alcol(?:ica|ico)?|alcol)|senza\s+(?:alcol(?:ica|ico)?|alcol))\b/i.test(q) ||
    /\b(?:sotto|sopra|massimo|minimo|meno di|piu di|più di|entro|fino a|tra)\b/i.test(q);
}

function pianoLocaleIntelligente(query: string, analisi: PinoIntentAnalysis): PinoSemanticPlan | null {
  const q = correggiErroriBattitura(normalizzaRichiesta(query)).trim();
  if (!q) return null;
  const match = CANONICI_RICERCA.find((x) => x.pattern.test(q));
  const haEsclusioneAlcol = /\b(?:non|senza)\s+(?:alcol(?:ica|ico)?|alcol)\b|\banalcolic(?:a|o|he|i)\b/i.test(q);
  const haPrezzo = /\b(?:sotto|sopra|massimo|minimo|meno di|piu di|più di|entro|fino a|tra|under|below|up to|over|above|more than|less than|between)\b/i.test(q);
  if (!match && !haEsclusioneAlcol && !haPrezzo && analisi.confidence === "bassa") return null;

  // I vincoli NON fanno parte della query di retrieval. Prezzo, negazioni,
  // apertura e città vengono estratti separatamente, altrimenti il gate di
  // pertinenza potrebbe richiedere termini come "sotto" o "100" dentro al
  // prodotto e restituire zero risultati.
  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  const range = q.match(/(?:tra|da)\s*(\d+(?:[.,]\d+)?)\s*(?:e|a)\s*(\d+(?:[.,]\d+)?)/i);
  const max = q.match(/(?:sotto|massimo|meno di|entro|fino a|under|below|up to|less than)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/i);
  const min = q.match(/(?:sopra|minimo|piu di|più di|oltre|over|above|more than)\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/i);
  if (range) {
    minPrice = Number(range[1].replace(",", "."));
    maxPrice = Number(range[2].replace(",", "."));
  } else {
    if (max) maxPrice = Number(max[1].replace(",", "."));
    if (min) minPrice = Number(min[1].replace(",", "."));
  }

  // Negazione generica: "non nere", "senza glutine", "non usato" ecc.
  // Manteniamo al massimo due token per non inghiottire il resto della frase.
  const esclusioni = Array.from(new Set(
    Array.from(q.matchAll(
      /\b(?:non|senza)\s+([a-zàèéìòù][a-zàèéìòù0-9-]*(?:\s+[a-zàèéìòù][a-zàèéìòù0-9-]*)?)/gi
    ))
      .map((m) => m[1].trim())
      .filter(Boolean)
  )).slice(0, 5);

  let city: string | null = null;
  const cittaNota = estraiCitta(q);
  if (cittaNota && new RegExp("\\b(?:a|in)\\s+" + cittaNota + "\\b", "i").test(q)) {
    city = cittaNota;
  }

  // Costruiamo la query sostanziale eliminando SOLO i vincoli già estratti.
  // Gli attributi positivi restano: "scarpe da uomo eleganti" deve continuare
  // a cercare scarpe da uomo eleganti, non solo "scarpe".
  let termine = q
    .replace(/(?:tra|da)\s*\d+(?:[.,]\d+)?\s*(?:e|a)\s*\d+(?:[.,]\d+)?/gi, " ")
    .replace(/(?:sotto|massimo|meno di|entro|fino a|sopra|minimo|piu di|più di|oltre)\s*(?:€\s*)?\d+(?:[.,]\d+)?/gi, " ")
    .replace(/\b(?:aperto|aperta|aperti|aperte)\s+(?:ora|adesso)\b/gi, " ")
    .replace(/\b(?:ora|adesso)\b/gi, " ");

  for (const esclusione of esclusioni) {
    const escaped = esclusione.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    termine = termine.replace(
      new RegExp("\\b(?:non|senza)\\s+" + escaped + "\\b", "gi"),
      " "
    );
  }

  if (city) {
    const escapedCity = city.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    termine = termine.replace(
      new RegExp("\\b(?:a|in)\\s+" + escapedCity + "\\b", "gi"),
      " "
    );
  }

  termine = termine
    .replace(/\b(?:voglio|vorrei|cerco|cerca|trovami|mi serve|fammi trovare|dammi|anzi|invece|pero|però|delle|degli|del|della|dei|una|un|uno|il|lo|la|i|gli|le)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (match) termine = termine.replace(match.pattern, match.termine).replace(/\s+/g, " ").trim();
  if (!termine) termine = match?.termine ?? q;

  // "analcolica" resta una caratteristica positiva; la regola speciale del
  // retrieval la tratta correttamente senza escludere le vere analcoliche.
  if (haEsclusioneAlcol && !esclusioni.some((e) => /\balcol/i.test(e))) {
    esclusioni.push("alcolica");
  }

  const openNow = /\b(?:aperto|aperta|aperti|aperte)\b|\b(?:ora|adesso)\b/i.test(q);

  const intent = match?.intent ?? analisi.intent;
  const surface: PinoSemanticPlan["surface"] =
    intent === "service" ? "stores" :
    intent === "generic" ? "none" : "products";

  return {
    surface,
    intent,
    query: termine.slice(0, 120),
    terms: Array.from(new Set([termine, ...(match ? [match.termine] : [])])).slice(0, 5),
    exclusions: esclusioni,
    minPrice,
    maxPrice,
    city,
    openNow,
    confidence: match || haEsclusioneAlcol || haPrezzo ? "alta" : analisi.confidence,
  };
}

function fallbackPlan(query: string, analisi: PinoIntentAnalysis): PinoSemanticPlan {
  const q = normalizzaRichiesta(query);
  const tokens = q
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !/^(cerco|cerca|trovami|trova|vorrei|voglio|mi|serve|anzi|invece|pero|però|un|una|uno|per|con|di|a|da|il|lo|la|i|gli|le|e|in|su|del|della|dei|delle|sotto|sopra|massimo|minimo|euro)$/.test(t));
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
  memoria: PinoMemoriaVoce[],
  stato?: PinoConversationState
): Promise<PinoSemanticPlan> {
  // Lo stato strutturato è la fonte prioritaria per le conversazioni
  // multi-turno. La memoria semantica viene applicata comunque dopo la
  // ricostruzione dello stato, così una correzione consolidata resta utilizzabile.
  const richiestaDaStato =
    stato?.attivo && stato.richiesta
      ? stato.richiesta
      : query;
  const queryConMemoria = applicaMemoriaSemantica(richiestaDaStato, memoria);
  const q = queryConMemoria.trim();
  // Se la memoria ha trasformato un termine non riconosciuto in un concetto
  // canonico, ricalcoliamo l'intento sul testo normalizzato.
  const analisiEffettiva = q !== query.trim() ? analizzaIntentoPino(q) : analisi;
  const fallback = fallbackPlan(q, analisiEffettiva);

  if (!q || analisiEffettiva.intent === "generic") return fallback;

  const fastPlan = pianoLocaleIntelligente(q, analisiEffettiva);
  if (fastPlan) return fastPlan;

  const memoriaTesto = memoria.slice(0, 4)
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

    const intentFinal = analisiEffettiva.confidence === "alta" ? analisiEffettiva.intent : intent;
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
