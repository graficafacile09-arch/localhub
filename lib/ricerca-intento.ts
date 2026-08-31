/**
 * LocalHub — Query understanding dello stesso motore di ricerca (SEARCH + Assistente)
 *
 * Livello di comprensione dell'intenzione dell'utente, ADDITIVO e NON restrittivo:
 * non sostituisce MAI il retrieval. Per le ricerche di bisogno/intento ("ho sete",
 * "voglio mangiare", "devo fare un regalo") produce una famiglia di CONCETTI CANDIDATI
 * da aggiungere (OR) ai termini della ricerca, mantenendo sempre la query originale.
 *
 * Regola d'oro (per ripetere testualmente): se la comprensione fallisce, la query
 * originale deve comunque essere cercata. Una classificazione sbagliata NON deve mai
 * impedire il recupero → qui, se nessun intento matchano, `concetti` è vuoto e il
 * motore continua con la query originale.
 *
 * Il dizionario è ESTENDIBILE e leggibile (lista di definizioni), non un blob enorme:
 * ogni intento dichiara i trigger (regex) e i concetti reali cercabili nel DB.
 * Nessuna chiamata AI: la comprensione è deterministica, veloce e a costo zero per le
 * query semplici (un intento matcha solo se i trigger lo attivano).
 *
 * @module lib/ricerca-intento
 */

// ─── Tipi ────────────────────────────────────────────────────────────────────

export type TipoIntenzione = "esplicita" | "bisogno" | "ambigua";

export interface IntentoRicerca {
  /** Query digitata dall'utente, non modificata. */
  queryOriginale: string;
  /** Classificazione: esplicita = ricerca diretta; bisogno = soddisfa un bisogno; ambigua = generica. */
  tipo: TipoIntenzione;
  /** Intento riconosciuto (es. "bere", "mangiare", "regalo"), o null se esplicita. */
  intento: string | null;
  /** Concetti candidati (termini reali cercabili nel DB) aggiunti all'espansione. Vuoto = nessuno. */
  concetti: string[];
  /** Livello di confidenza della classificazione ("alta"|"media"|null). */
  confidence: "alta" | "media" | null;
}

// ─── Definizione intenti ─────────────────────────────────────────────────────
// Estendibile: aggiungi una voce per un nuovo bisogno frequente. `concetti` sono
// termini che la RPC/ILIKE può trovare realmente nel DB (nomi, categorie,
// parole_chiave, servizi). Non usare filtri AND: i concetti si AGGIUNGONO.

interface DefinizioneIntento {
  /** Identificatore del bisogno. */
  intento: string;
  /** Trigger (regex, case-insensitive) che attivano questo intento. */
  trigger: RegExp[];
  /** Concetti candidati naturali, in ordine di rilevanza. */
  concetti: string[];
  /** Confidenza (alta se i trigger sono molto specifici/letterali). */
  confidence: "alta" | "media";
}

// Marcatori linguistici di bisogno/intenzione. Un termine categoria da solo
// ("farmacia", "parrucchiere", "pizza", "medico cardiologo") è una ricerca
// DIRETTA e NON deve essere gonfiato in bisogno: i concetti d'intento scattano
// SOLO se la frase esprime davvero un bisogno/richiesta ("mi serve un medico",
// "ho sete", "voglio tagliarmi i capelli", "devo fare un regalo") OPPURE una
// descrizione tipica/regionale multi-parole ("regalo tipico calabrese",
// "prodotti tipici") che da sola non è una singola categoria.
const RE_FRAMING_NEED =
  /\b(ho\s|hai|voglio|vorrei|devo|occore|serve|servire|cerco|cerchi|cercando|trovo|trovare|qualcuno|qualcosa|un\s+medic|una\s+visita|dove\s|andiamo|bisogno|mi\s+serve|per\s+|devo\s|tipic|calabres|artigianat|pollino)|prodotti\s+tipic|regalo\s+tipic/i;

const DEFINIZIONI_INTENTI: DefinizioneIntento[] = [
  // ── ALIMENTAZIONE / BERE ──
  {
    intento: "bere",
    trigger: [
      /ho\s+sete/i,
      /qualcosa\s+da\s+bere/i,
      /(bere|bevande?|qualcosa\s+da\s+bere)/i,
      /\bbirr/i,
      /\bwine?\b/i,
      /\bvino\b/i,
    ],
    concetti: ["bevande", "bar", "caffetteria", "aperitivo", "acqua", "birreria", "vineria", "caffe"],
    confidence: "alta",
  },
  {
    intento: "mangiare",
    trigger: [
      /ho\s+fame/i,
      /voglio\s+mangi(i|are)/i,
      /(da|per)\s+mangiare/i,
      /dove\s+(posso\s+)?mangiare/i,
      /andiamo\s+?a\s+mangiare/i,
      /\bmangiare\b/i,
      /\bcibo\b/i,
      /\bspuntin/i,
      /\bcolazion/i,
      /\bpranz/i,
      /\bcena\b|\bcene\b/i,
      /aperitiv/i,
    ],
    concetti: ["ristorante", "trattoria", "pizzeria", "gastronomia", "alimentari", "cucina", "bar", "forno"],
    confidence: "alta",
  },
  {
    // Dolce/pasticceria/gelato (bisogno specifico, sottocaso alimentazione)
    intento: "dolce",
    trigger: [
      /qualcosa\s+di\s+dolce/i,
      /\bdolc(i|e)?\b/i,
      /\bgelat/i,
      /\bpasticc/i,
      /\bcioccolat/i,
      /\bdessert\b/i,
      /torta\b/i,
    ],
    concetti: ["pasticceria", "gelateria", "dolci", "pasticcere", "cioccolateria", "torte"],
    confidence: "media",
  },
  // ── ACQUISTI / REGALO ──
  {
    intento: "regalo",
    trigger: [
      /devo\s+(fare\s+)?un\s+regal/i,
      /(un\s+)?regal(i|o)/i,
      /\bdono\b|\bdoni\b/i,
      /qualcosa\s+(per|da)\s+(regalare|fare\s+un\s+regalo)/i,
      /idee?\s+regal/i,
    ],
    concetti: ["regalo", "idee regalo", "prodotti tipici", "artigianato", "bomboniere", "gioielleria", "fioraio", "enoteca"],
    confidence: "alta",
  },
  // ── SERVIZI: CAPELLI / FATTI IN CASA ──
  {
    intento: "capelli",
    trigger: [
      /taglia(rmi|rsi)\s+(i\s+)?capelli/i,
      /\btagli\b/i,
      /voglio\s+(un\s+)?taglio/i,
      /\bbarba\b/i,
      /\bbarbier/i,
    ],
    concetti: ["parrucchiere", "barbiere", "acconciature", "capelli", "estetica", "taglio"],
    confidence: "alta",
  },
  {
    intento: "automobile",
    trigger: [
      /\bauto(mobile|o)?\b/i,
      /\bmacchina\b/i,
      /\bofficin/i,
      /\btagliando\b/i,
      /\bgomm/i,
      /\bpneumatic/i,
      /\brevisione\b/i,
    ],
    concetti: ["officina", "auto", "gomme", "tagliando", "meccanico", "carrozzeria", "pneumatici"],
    confidence: "media",
  },
  {
    intento: "riparazione",
    trigger: [
      /\bripar/i,
      /\bfalegnam/i,
      /\bidraul/i,
      /\belettricist/i,
      /\bmanutenzion/i,
    ],
    concetti: ["riparazione", "manutenzione", "falegname", "idraulico", "elettricista", "artigiano", "bricolage"],
    confidence: "media",
  },
  {
    intento: "servizi professionali",
    trigger: [
      /\bfotograf/i,
      /\bgrafic/i,
      /\bstamp\b/i,
      /\binformatic/i,
      /\bvideo\b/i,
      /\bweb\b/i,
    ],
    concetti: ["fotografo", "grafica", "stampa", "informatica", "computer", "video", "servizi professionali"],
    confidence: "media",
  },
  // ── SALUTE ──
  {
    intento: "salute",
    trigger: [
      /mi\s+serve\s+un\s+medic/i,
      /\bmedic(i|o)?\b/i,
      /\bdott(ore|oressa|or)\b/i,
      /\bambulatori/i,
      /\bstudio\s+medic/i,
      /\bspecialist/i,
      /\bvisita\b/i,
      /\bsanit/i,
      /\bfarmaci/i,
    ],
    concetti: ["medico", "ambulatorio", "studio", "specialista", "visita", "salute", "farmacia", "parafarmacia"],
    confidence: "media",
  },
  {
    intento: "cuore",
    trigger: [
      /(cuor|cardio|cure)/i,
      /visita\s+(al\s+)?cuore/i,
    ],
    concetti: ["cardiologo", "cardiologia", "visita", "cuore", "specialista", "ambulatorio"],
    confidence: "alta",
  },
  // ── TURISMO / TEMPO LIBERO ──
  {
    intento: "turismo",
    trigger: [
      /mangiare\s+fuori/i,
      /\bdormire\b|\bpernott/i,
      /(hotel|alberg|b&b|b e b)/i,
      /\bpasseggi/i,
      /\battivit/i,
    ],
    concetti: ["ospitalità", "hotel", "albergo", "b&b", "affittacamere", "pernottamento", "turismo"],
    confidence: "media",
  },
  // ── INTENTO DESCRITTIVO REGIONALE ──
  {
    intento: "tipico",
    trigger: [
      /\bcalabres/i,
      /\btipic/i,
      /\bartigianato\b/i,
      /\bpollino\b/i,
      /\bprodotto/i,
    ],
    concetti: ["prodotti tipici", "artigianato", "tipico", "calabria", "specialità", "enogastronomia"],
    confidence: "media",
  },
];

// Trigger "ambigui/descrittivi" che NON devono inventare una categoria precisa:
// in questo caso non forziamo concetti, lasciamo il retrieval sulla query originale + fuzzy.
const REGISTRO_AMBIGUE: RegExp[] = [
  /^(cosa\s+(ce|c'è)\??|voglio\s+qualcosa|vorrei\s+qualcosa|boh|non\s+so|qualcosa\s+di\s+bello|qualcosa\s+di\s+buono|qualsiasi\s+cosa)$/i,
];

/** Cosiddetta query "esplicita" (ricerca diretta senza bisogno riconosciuto). */

function regexListHit(testo: string, regexes: RegExp[]): boolean {
  for (const r of regexes) if (r.test(testo)) return true;
  return false;
}

/**
 * Analizza la query dell'utente producendo l'intenzione e i concetti candidati.
 * Deterministico e senza effetti: la query originale non viene mai modificata.
 */
export function analizzaRichiesta(query: string): IntentoRicerca {
  const q = (query ?? "").trim();
  if (!q) {
    return { queryOriginale: q, tipo: "esplicita", intento: null, concetti: [], confidence: null };
  }

  // Ambigua/generica → NON inventare una categoria: nessun concetto forzato.
  if (regexListHit(q, REGISTRO_AMBIGUE)) {
    return { queryOriginale: q, tipo: "ambigua", intento: null, concetti: [], confidence: null };
  }

  let migliori: DefinizioneIntento | null = null;
  let maxSpecificita = -1;

  for (const def of DEFINIZIONI_INTENTI) {
    if (!regexListHit(q, def.trigger)) continue;
    // Specificità approssimativa (~ numero di token nel trigger più corrispondente):
    // preferisce l'intento il cui trigger è più lungo/descritto, per evitare
    // sovrapposizioni arbitrarie tra intenti simili.
    const specificita = Math.max(
      ...def.trigger
        .filter((r) => r.test(q))
        .map((r) => r.source.length)
    );
    if (specificita > maxSpecificita) {
      maxSpecificita = specificita;
      migliori = def;
    }
  }

  if (!migliori) {
    return { queryOriginale: q, tipo: "esplicita", intento: null, concetti: [], confidence: null };
  }

  // Un termine-categoria isolato ("farmacia", "medico cardiologo") NON è un
  // bisogno dichiarato: senza marcatore di bisogno lo trattiamo come ricerca
  // diretta per non allargare inutilmente il recall né toccare le query semplici.
  // MA una negazione NON deve sopprimere l'intento positivo: "regalo non
  // alimentare" resta comunque un bisogno regalo (espansione positiva sulla
  // gioielleria/artigianato), e la negazione viene applicata solo in esclusione
  // finale. Altrimenti Barone Gioielli marcerebbe senza concetti e sparirebbe.
  const haNegazione = /\b(non|senza|niente|nulla|nullific)\b/i.test(q);
  if (!RE_FRAMING_NEED.test(q) && !haNegazione) {
    return { queryOriginale: q, tipo: "esplicita", intento: null, concetti: [], confidence: null };
  }

  return {
    queryOriginale: q,
    tipo: "bisogno",
    intento: migliori.intento,
    concetti: migliori.concetti.slice(0, 8),
    confidence: migliori.confidence,
  };
}

/** Ricorda se una query attiva concetti d'intento (usato per decidere se vale la
 *  pena il percorso "concetti candidati"). */
export function haConcetti(query: string): boolean {
  return analizzaRichiesta(query).concetti.length > 0;
}

/** Espansione additiva: sinonimi correnti + concetti dell'intento (separati da spazio).
 *  NON riscrive né restringe la query: i concetti si aggiungono, eventualmente vuoti. */
export function espandiQueryIbrida(query: string): string {
  const concetti = analizzaRichiesta(query).concetti;
  if (concetti.length === 0) return query;
  return `${query} ${concetti.join(" ")}`.trim();
}

/** Concetti candidati d'intento come stringa unica (copre sia la SEARCH sia
 *  la ricerca prodotti). Vuoto se la query non esprime alcun bisogno: in quel
 *  caso il retrieval resta sulla query originale (costo zero, nullo impatto). */
export function concettiIntento(query: string): string {
  const concetti = analizzaRichiesta(query).concetti;
  return concetti.join(" ").trim();
}

// ─── NEGAZIONI / VINCOLI NEGATIVI (V6-A) ────────────────────────────────────
// Le negazioni NON toccano la query originale (che resta sempre al retrieval):
// producono solo un VINCOLO di ESCLUSIONE applicato DOPO il recupero. Se non
// si riesce a determinare con affidabilità cosa escludere, non si esclude nulla.

// Le parole che NON sono mai il "concetto" negato: marcatori e funtori.
const STOP_NEGAZIONE: ReadonlySet<string> = new Set([
  "non", "senza", "niente", "nulla", "nullo", "voglio", "vorrei", "cerco",
  "cercando", "cerchiamo", "desidero", "ho", "abbiamo", "serve", "servire",
  "mi", "ti", "un", "una", "uno", "dei", "delle", "degli", "della", "del",
  "di", "da", "a", "per", "con", "in", "su", "al", "alla", "alle", "allo",
  "ai", "agli", "tra", "fra", "ma", "e", "ed", "o", "che", "posso", "voglio",
  "andare", "andiamo", "più", "piu", "ancora", "quindi", "proprio", "quello",
  "quella", "questi", "queste", "questo", "questa", "il", "lo", "la", "le", "gli",
  "i", "di", "della", "delle", "dei", "degli", "del", "punto", "ne",
]);

// Termini "sostanziali" della frase dopo il marcatore di negazione. Es.
// "regalo non alimentare" → dopo "non" ⇒ ["alimentare"];
// "non voglio una pizzeria" → dopo "non" ⇒ ["pizzeria"];
// "senza pesce" → dopo "senza" ⇒ ["pesce"].
function terminiDopoNegatore(q: string): string[] {
  const m = q.match(/\b(non|senza|niente|nulla|nulli)\b/i);
  if (!m || m.index === undefined) return [];
  const dopo = (m.index ?? 0) + m[0].length;
  const token = q
    .slice(dopo)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t && !STOP_NEGAZIONE.has(t))
    .slice(0, 5);
  // Tiene il TERMINE TESTA (l'ultimo sostantivo sostanziale dopo il negatore):
  // "non voglio prodotti alimentari" → "alimentari", non il generico "prodotti".
  // Conservativo: un solo concetto negato, il più specifico.
  return token.length > 0 ? [token[token.length - 1]] : [];
}

/**
 * V6-A: i termini da ESCLUDERE (vincolo negativo), NORMALIZZATI. Vuoto = nessun
 * vincolo. La query originale non viene mai modificata: questi termini servono
 * solo al filtraggio POST-retrieval. Conservativo: si esclude solo ciò che in
 * modo affidabile corrisponde al concetto negato (match nei campi strutturati).
 */
export function esclusioniNegazione(query: string): string[] {
  const q = (query ?? "").trim();
  if (!q) return [];
  // Negazione esplicita presente?
  if (!/\b(non|senza|niente|nulla|nullific)\b/i.test(q)) return [];
  return terminiDopoNegatore(q);
}

/** Se la query contiene un qualificatore di budget (prodotto economico). */
export function haQualificatoreEconomico(query: string): boolean {
  return /(economi?c?\w*|convenient\w*|a\s+basso\s+prezzo|poco\s+caro|sotto\s+prezzo|price)/i.test(
    (query ?? "").trim()
  );
}

/** Se la query contiene un qualificatore "tranquillo" (senza segnale affidabile). */
export function haQualificatoreTranquillo(query: string): boolean {
  return /\btranquill/i.test((query ?? "").trim());
}

/** Se la query esprime un vincolo di recipiente/persona per regalo (dati mancanti). */
export function haQualificatoreDestinatario(query: string): boolean {
  return /\b(per)\s+(mia\s+madre|mia\s+mamma|mio\s+padre|papà|papa|bambin[oa]i?|ragazz[oi]|amico|amica)\b/i.test(
    (query ?? "").trim()
  );
}