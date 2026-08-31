/**
 * LocalHub — Assistente AI: Interpretazione deterministica della richiesta
 *
 * Strato PURO (nessun import di DB/LLM) che fa "query understanding" prima del
 * retrieval. L'obiettivo è NON affidare tutto al 'guess' del modello: per le
 * richieste strutturate o descrittive estraiamo in modo deterministico:
 *   - l'intento (prodotto / attività / offerta / evento / generico);
 *   - la città/località menzionata;
 *   - il tipo di attività / profilo (medico, beauty, ristorante, ...);
 *   - le categorie rilevanti (dall'elenco ufficiale CATEGORIE_NEGOZIO_META);
 *   - eventuali vincoli di prezzo.
 *
 * Produce infine BREVI "varianti di query" per il retrieval robusto
 * (lib/assistente/ricerca-estesa.ts): più espansioni, ciascuna provata sul DB,
 * così la ricerca regge anche quando una singola strategia fallisce.
 *
 * @module lib/assistente/interprete
 */

import { normalizza, radice, estraiToken } from "@/lib/text-utils";
import {
  espandiQueryConSinonimi,
  SINONIMI_TIPO_ATTIVITA,
} from "@/lib/ricerca-semantica";
import { CATEGORIE_NEGOZIO_META } from "@/lib/categorie-negozio";
export type IntentoRichiesta =
  | "prodotto"
  | "attivita"
  | "offerta"
  | "evento"
  | "piattaforma"
  | "chiacchiera"
  | "generico";

export type AnalisiRichiesta = {
  /** Query normalizzata originale (lowercase, senza accenti). */
  queryNorm: string;
  /** Token significativi originali digitati dall'utente (senza stopword). */
  terminiPuliti: string[];
  /** Stringa di ricerca soggetto (senza stopword, città e numeri prezzo). */
  ricerca: string;
  /** Intento prevalente. */
  intento: IntentoRichiesta;
  /** id dei profili attività attivati (medico, beauty, ristorante, ...). */
  tipoAttivita: string[];
  /** Categorie ufficiali rilevanti (nomi, lowercase). */
  categorieRilevanti: string[];
  /** Città/località menzionata (lowercase), se individuata. */
  citta: string | null;
  /** Vincoli di prezzo estratti (in euro). */
  vincoliPrezzo: { min?: number; max?: number } | null;
  /** Concetti descrittivi attivati → lexemi di ricerca reali. */
  topic: string[];
};

// ─── Vocabolario descrittivo → lexemi di ricerca ────────────────────────────
// Mappa "concetti di linguaggio naturale" → termini REALI presenti nei dati
// (nomi/categorie/profili). Aggiungere una riga qui rende la ricerca capace di
// capire una descrizione senza che l'utente conosca il nome esatto.
const TOPIC_TERMINI: Array<{
  chiavi: string[];
  lexica: string[];
  categorie?: string[];
  profili?: string[];
}> = [
  {
    chiavi: ["regalo", "regali", "regalare", "dono", "doni", "omaggio", "cesto", "cesti"],
    lexica: ["regalo", "regali", "cesto", "cesti", "specialita"],
    categorie: ["regali", "gastronomia", "artigianato"],
  },
  {
    chiavi: ["tipico", "tipici", "tipica", "calabrese", "calabresi", "tradizionale", "tradizionali", "artigianale", "artigianali", "locali", "territorio", "territoriale", "km zero"],
    lexica: ["tipico", "tipici", "tipica", "calabrese", "calabresi", "artigianale", "artigianali", "specialita", "tradizionale"],
    categorie: ["gastronomia", "artigianato", "alimentari"],
    profili: ["alimentari", "artigiano"],
  },
  {
    chiavi: ["pesce", "pescheria", "ittico", "ittici", "mare", "crostacei", "frutti di mare", "pescato", "fresco di mare", "marinari", "marinara"],
    lexica: ["pesce", "pescheria", "ittico", "frutti", "mare", "crostacei", "pescato"],
    categorie: ["pescheria", "ristorante", "gastronomia"],
    profili: ["alimentari", "ristorante"],
  },
  {
    chiavi: ["cuore", "cardiologia", "cardiologico", "cardiologica", "cardiologo", "cardiopatico"],
    lexica: ["cardiologia", "cardiologo", "cuore"],
    categorie: ["salute e benessere"],
    profili: ["medico"],
  },
  {
    chiavi: ["prenot", "appuntamento", "visita", "specialista", "esame", "analisi", "diagnosi"],
    lexica: ["visita", "specialista", "ambulatorio", "analisi"],
    categorie: ["salute e benessere"],
    profili: ["medico"],
  },
  {
    chiavi: ["acconciatura", "taglio capelli", "piega", "barba", "unghie", "manicure", "pedicure", "makeup", "trucco", "skincare"],
    lexica: ["parrucchiere", "barbiere", "estetista", "capelli", "unghie", "makeup", "skincare"],
    categorie: ["parrucchiere", "barbiere", "estetica"],
    profili: ["beauty"],
  },
];

// ─── Località riconosciute (Castrovillari e dintorni / Calabria) ────────────
// Elenco curato delle località rilevanti per la piattaforma; teoricamente
// qualsiasi città può comparire, ma per il matching affidabile della località
// dentro la query serve una base conosciuta. Estendibile aggiungendo voci.
export const LOCALITA_CONOSCIUTE: Set<string> = new Set([
  "castrovillari", "cosenza", "crotone", "catanzaro", "vibo", "vibovalentia", "reggio", "reggiocalabria", "lamezia", "lamaziaterme",
  "corigliano", "rossano", "policoro", "morano", "sanbasile", "terranova", "sarakonta", "montesangiovanni", "diagrammatici",
  "frigento", "cassano", "cassanoalloionio", "cerchiara", "civita", "frascineto", "plataci", "albidona", "trebisacce", "villapiana",
  "spezzano", "acri", "bisignano", "sanlorenzo", "paola", "amantea", "sanginari", "rogliano", "aduja", "belmonte", "fulgi",
  // Pollino / territorio
  "pollino", "sibari", "pianopollino", "moranocalabro", "castrovillaresimo",
]);

/** Parola generica di località: "a Castrovillari", "vicino a X", "zona X". */
const RE_LOCALITA_PATTERN =
  /\b(?:a|in|nei|nella|nel|presso|vicino\s+a|vicino\s+alla|zona|comune\s+di)\s+([a-zà-ù0-9'\s-]+)/g;

// ─── Stopword di contesto (rimosse dalla query soggetto) ────────────────────
const STOPWORD_RICERCA = new Set([
  "a", "ad", "al", "alla", "alle", "allo", "ai", "agli", "all", "che", "chi", "con", "da", "dai", "dal", "dalla",
  "dalle", "dei", "del", "della", "delle", "dello", "di", "e", "ed", "gli", "il", "in", "io", "la", "le", "lo",
  "mia", "mio", "mie", "miei", "mi", "nella", "nella", "nel", "nei", "per", "se", "sul", "sulla", "sulle", "sui",
  "su", "tra", "devo", "fare", "un", "una", "uno", "mi", "cerco", "trovami", "dove", "qualcosa", "serve", "servono",
  "servire", "vorrei", "voglio", "cercando", "sto", "sono", "posso", "potrei",
]);

const RE_OFFERTA = /\b(offerte|offerta|promozion|scont|saldo|saldi|affari|sottocosto)\b/;
const RE_EVENTO = /\b(eventi|evento|weekend|fine settimana|manifestazion|in programma|concerto|mostra|fiera|serata|spettacol)\b/;
const RE_PRODOTTO = /\b(prodotto|prodotti|comprare|acquisto|acquistare|prezzo|costo|regalo|regali|regalare|scalpo|usato|vendita)\b/;
const RE_PIATTAFORMA = /che cos'è incittà|come funziona|cos'è il sito|cosa sei|chi sei/;
const RE_CHIACCHIERA = /^(va bene|ok|okay|perfetto|grazie|grazie mille|ciao|buongiorno|buonasera|si|sì)$/;

function profiliPerTermine(termine: string): string[] {
  const trovati: string[] = [];
  for (const [id, gruppi] of Object.entries(SINONIMI_TIPO_ATTIVITA)) {
    if (!gruppi || gruppi.length === 0) continue;
    if (gruppi.some((voce) => radice(normalizza(termine).trim()) === radice(normalizza(voce).trim()))) {
      trovati.push(id);
    }
  }
  return trovati;
}

/** Token puliti (rimosse stopword), ordinati come in origine. */
function tokenPuliti(query: string): string[] {
  return estraiToken(query).filter((t) => !STOPWORD_RICERCA.has(t));
}

/**
 * Analizza la richiesta in frasi deterministiche. La query non viene MAI
 * considerata "rotta" dalle domande semplici: si estraggono i criteri quando
 * chiaramente presenti, altrimenti si restituisce l'intento generico con la
 * query pulita pronta per il retrieval.
 */
export function analizzaRichiesta(query: string): AnalisiRichiesta {
  const queryNorm = normalizza(query.trim());
  const tokens = tokenPuliti(queryNorm);

  // Vincolo di prezzo: "sotto 500 euro", "massimo 100", "tra 10 e 20 euro".
  let vincoliPrezzo: AnalisiRichiesta["vincoliPrezzo"] = null;
  const prezzoTokens = tokenPuliti(queryNorm.replace(/\b(euro|€|eur)\b/g, " "));
  const mPrezzo = queryNorm.match(/(\d{1,7})\s*(?:€|eur|euro)/i);
  const mMax = prezzoTokens.join(" ").match(/(?:sotto|massimo|max|fino\s+a|meno\s+di)\s+(\d{1,7})/i);
  const mMin = prezzoTokens.join(" ").match(/(?:sopra|minimo|più\s+di|da)\s+(\d{1,7})/i);
  if (mMax?.[1] || mMin?.[1] || mPrezzo?.[1]) {
    vincoliPrezzo = {};
    if (mMax?.[1]) vincoliPrezzo.max = Number(mMax[1]);
    if (mMin?.[1]) vincoliPrezzo.min = Number(mMin[1]);
    if (mPrezzo?.[1]) vincoliPrezzo.max ??= Number(mPrezzo[1]);
  }

  // Località: token nel set conosciuto, oppure pattern "a X".
  let citta: string | null = null;
  for (const t of tokens) {
    if (LOCALITA_CONOSCIUTE.has(t.slice(0, 30))) {
      citta = t;
      break;
    }
  }
  if (!citta) {
    RE_LOCALITA_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_LOCALITA_PATTERN.exec(queryNorm))) {
      const cand = normalizza(m[1] ?? "").trim().split(/\s+/)[0];
      if (cand && cand.length >= 3 && LOCALITA_CONOSCIUTE.has(cand)) {
        citta = cand;
        break;
      }
    }
  }

  // Soggetto di ricerca: token puliti esclusa la città (gestita dal filtro
  // `citta` del retrieval), così i token geografici non inquinano il ranking.
  const ricerca = tokens.filter((t) => t !== citta).join(" ");

  // Tipo di attività / profilo.
  const tipoAttivita: string[] = [];
  for (const t of tokens) {
    for (const id of profiliPerTermine(t)) if (!tipoAttivita.includes(id)) tipoAttivita.push(id);
  }

  // Categorie rivelanti (dall'elenco ufficiale).
  const categorieRilevanti: string[] = [];
  for (const t of tokens) {
    for (const cat of CATEGORIE_NEGOZIO_META) {
      const nome = normalizza(cat.nome);
      if (!categorieRilevanti.includes(nome) && (radice(nome) === radice(t) || nome.includes(t) || t.length > 2 && nome.split(" ").some((w) => w === t))) {
        categorieRilevanti.push(nome);
      }
    }
  }

  // Concetti descrittivi → lexemi reali (topic).
  const topic: string[] = [];
  const topicCategorie: string[] = [];
  for (const entry of TOPIC_TERMINI) {
    const attivo = entry.chiavi.some(
      (c) => queryNorm.includes(c) || tokens.some((t) => radice(t) === radice(c))
    );
    if (attivo) {
      for (const lx of entry.lexica) if (!topic.includes(lx)) topic.push(lx);
      for (const c of entry.categorie ?? []) if (!topicCategorie.includes(c)) topicCategorie.push(c);
      for (const p of entry.profili ?? []) if (p && !tipoAttivita.includes(p)) tipoAttivita.push(p);
    }
  }

  // Intento prevalente.
  let intento: IntentoRichiesta;
  if (RE_CHIACCHIERA.test(queryNorm.trim())) intento = "chiacchiera";
  else if (RE_PIATTAFORMA.test(queryNorm)) intento = "piattaforma";
  else if (RE_OFFERTA.test(queryNorm)) intento = "offerta";
  else if (RE_EVENTO.test(queryNorm)) intento = "evento";
  else if (vincoliPrezzo || RE_PRODOTTO.test(queryNorm)) intento = "prodotto";
  else if (citta || tipoAttivita.length > 0 || categorieRilevanti.length > 0 || topic.length > 0) intento = "attivita";
  else intento = "generico";

  return {
    queryNorm,
    terminiPuliti: tokens,
    ricerca,
    intento,
    tipoAttivita,
    categorieRilevanti: categorieRilevanti.concat(topicCategorie),
    citta,
    vincoliPrezzo,
    topic,
  };
}

/**
 * Stringa di ricerca combinata: soggetto pulito + lexemi del topic. Usata per
 * dare recall al retrieval lessicale anche quando l'utente descrive senza
 * usare le parole esatte del database.
 */
export function espandiQueryIbrida(query: string): string {
  const analisi = analizzaRichiesta(query);
  const base = analisi.ricerca;
  const extra = analisi.topic;
  if (extra.length === 0) return base;
  return Array.from(new Set([...base.split(/\s+/), ...extra].map((t) => t.trim()).filter(Boolean))).join(" ");
}

/**
 * Varianti di query per il retrieval robusto: più espansioni di lunghezza
 * crescente, così il fallback può allargare il recall senza perdere il match
 * esatto. Ritorna array di stringhe non vuote, uniche, massimo 4.
 */
export function variantiQuery(query: string): string[] {
  const analisi = analizzaRichiesta(query);
  const soggetto = analisi.ricerca;
  if (!soggetto) return [];

  const varianti: string[] = [];
  // 1) soggetto pulito (match esatto-first)
  varianti.push(soggetto);
  // 2) soggetto + diverse espansioni semaniche (sinonimi/categorie/profili)
  const espansa = espandiQueryConSinonimi(analisi.ricerca).split(/\s+/).filter(Boolean).join(" ");
  if (espansa && espansa !== soggetto) varianti.push(espansa);
  // 3) soggetto + topic descrittivi (regalo, pesce, tipico...)
  const ibrida = espandiQueryIbrida(query);
  if (ibrida && ibrida !== soggetto && ibrida !== espansa) varianti.push(ibrida);

  // 4) se presente una città, variane anche il solo soggetto senza città,
  //    nel caso la città domini il ranking RPC.
  if (analisi.citta) {
    const senzaCitta = analisi.terminiPuliti.filter((t) => t !== analisi.citta).join(" ");
    if (senzaCitta && senzaCitta !== soggetto) varianti.push(senzaCitta);
  }

  return Array.from(new Set(varianti.filter((v) => v.trim().length > 0))).slice(0, 4);
}

/**
 * Decide se la ricerca NORMALE deve allargarsi al retrieval robusto.
 *
 * CRITERIO (un solo motore condiviso, impiegato SOLO quando utile):
 *  - `primarioVuoto`  → cascade: il primo retrieval non ha trovato nulla;
 *  - `citta`          → località esplicita (il soggetto va cercato pari ma il
 *                       filtro città migliora il recall);
 *  - `topic.length`   → concetto descrittivo (regalo, pesce, tipico...);
 *
 * Le query semplici (es. "pizza", "farmacia", "parrucchiere") NON attivano il
 * robusto se il retrieval diretto ha già risultati: restano veloci e identiche.
 */
export function dovrebbeUsareMotoreRobusto(
  analisi: AnalisiRichiesta,
  primarioVuoto: boolean
): boolean {
  if (primarioVuoto) return true;
  if (analisi.citta) return true;
  if (analisi.topic.length > 0) return true;
  return false;
}