import { FONTI_ID } from "./fonti";
import type { CategoriaNotizia } from "./types";

/**
 * FILTRO CASTROVILLARI — deterministico, senza IA, facilmente modificabile.
 *
 * Regole:
 * 1. Le notizie del Comune di Castrovillari sono SEMPRE pertinenti
 *    (la fonte pubblica solo notizie locali).
 * 2. Una notizia è pertinente se titolo O excerpt contengono una keyword
 *    FORTE ("castrovillari", "castrovillarese").
 * 3. Le keyword DEBOLI ("pollino", …) da sole NON bastano (punteggio
 *    sotto la soglia): servono almeno due occorrenze distinte oppure
 *    l'abbinamento con una keyword forte.
 * 4. Se non c'è certezza sufficiente → NON importare.
 *
 * Le liste sono costanti qui: modificarle NON richiede migration.
 */

/** Keyword forti — menzione diretta di Castrovillari (punteggio 10). */
const KEYWORD_FORTI: readonly string[] = ["castrovillari", "castrovillarese"];

/** Keyword deboli — contesto territoriale, MAI sufficienti da sole. */
const KEYWORD_DEBOLI: readonly string[] = ["pollino", "parco nazionale del pollino"];

/** Punteggi e soglia: forte=10, debole=2; serve ≥ 10. */
const PESO_FORTE = 10;
const PESO_DEBOLE = 2;
const SOGLIA_PERTINENZA = 10;

/** Fonti le cui notizie sono sempre pertinenti (Comune di Castrovillari). */
const SORGENTI_SEMPRE_PERTINENTI: ReadonlySet<string> = new Set([FONTI_ID.COMUNE]);

/**
 * Fonti di DISCOVERY V2 (Google News): per queste vale una regola in più
 * (guardia anti-cognome). Mai "sempre pertinenti": serve sempre la keyword
 * forte Castrovillari/Castrovillarese, come per le altre fonti non-Comune.
 */
const FONTI_SCOPERTA: ReadonlySet<string> = new Set([
  FONTI_ID.GOOGLE_NEWS_CV,
  FONTI_ID.GOOGLE_NEWS_COMUNE,
]);

/** Preposizioni/parole che precedono "Castrovillari" come luogo (es. "di"). */
const PREPOSIZIONI_PRIMA_DI_LUOGO: ReadonlySet<string> = new Set([
  "di", "da", "a", "in", "su", "per", "con", "tra", "fra",
  "del", "della", "delle", "dei", "dello",
  "nel", "nella", "nelle", "nei", "negli",
  "sul", "sulla", "sulle", "sui", "sugli",
  "al", "alla", "alle", "ai", "agli",
  "dal", "dalla", "dai", "dagli",
  "e", "ed", "o", "od", "presso", "verso", "oltre", "anche",
]);

/** Verbi/parole che indicano una notizia su una PERSONA dopo il cognome. */
const MARCATORI_NOTIZIA_PERSONA =
  /(nominat|elett|condannat|arrestat|indagat|premiat|laureat|muore|mort|decedut|president|segretari|candidat|sospes|licenziat|ricoverat|ferit|denunciat)/i;

/**
 * Best-effort: rileva l'uso di "Castrovillari" come COGNOME di una persona
 * (es. "Dario Castrovillari nominato Presidente") invece che come città.
 * Euristiche deterministiche:
 * - titoli personali "Dott./Avv./Sig. Castrovillari …";
 * - "<Nome> Castrovillari" (iniziale maiuscola, non preposizione) seguito
 *   da un marcatore di notizia personale (nominato/eletto/condannato/…).
 * NON è un sistema IA: mira solo ai falsi positivi evidenti.
 */
export function eCastrovillariCognomePersona(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return false;

  if (
    /(?:^|\s)(?:dott\.?|dott\.ssa|avv\.?|ing\.?|prof\.?(?:\.ssa)?|sig\.?|sigg\.?)\s+Castrovillari\b/i.test(
      t
    )
  ) {
    return true;
  }

  const re = /(?:^|[^A-Za-zÀ-ÖØ-öø-ÿ])([A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ]{2,})\s+Castrovillari\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const parolaPrecedente = m[1];
    const resto = t.slice(re.lastIndex);
    if (
      !PREPOSIZIONI_PRIMA_DI_LUOGO.has(parolaPrecedente.toLowerCase()) &&
      MARCATORI_NOTIZIA_PERSONA.test(resto)
    ) {
      return true;
    }
  }
  return false;
}

/** Normalizza il testo per il match: minuscolo + rimozione accenti. */
export function normalizzaTesto(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Punteggio di pertinenza di un testo (0 se nessuna keyword). */
export function punteggioPertinenza(testo: string): number {
  const t = normalizzaTesto(testo);
  let punti = 0;
  for (const k of KEYWORD_FORTI) {
    if (t.includes(normalizzaTesto(k))) punti += PESO_FORTE;
  }
  for (const k of KEYWORD_DEBOLI) {
    if (t.includes(normalizzaTesto(k))) punti += PESO_DEBOLE;
  }
  return punti;
}

/**
 * Decide se una notizia è pertinente a Castrovillari.
 * Controlla titolo + excerpt (l'excerpt è il "contenuto disponibile").
 *
 * Regole (V1 invariata per le fonti istituzionali):
 * 1. Comune di Castrovillari → sempre pertinente.
 * 2. Tutte le altre fonti (incluse le discovery Google News) → serve la
 *    keyword forte "Castrovillari"/"Castrovillarese" ("Pollino" da solo
 *    non basta mai: 4 punti < soglia 10).
 * 3. Discovery Google News → in più, guardia anti-cognome: un "Castrovillari"
 *    usato come cognome di persona non passa.
 */
export function isPertinenteCastrovillari(params: {
  fonteId: string;
  title: string;
  excerpt?: string | null;
}): boolean {
  if (SORGENTI_SEMPRE_PERTINENTI.has(params.fonteId)) return true;
  const testo = `${params.title} ${params.excerpt ?? ""}`;
  if (punteggioPertinenza(testo) < SOGLIA_PERTINENZA) return false;
  if (FONTI_SCOPERTA.has(params.fonteId) && eCastrovillariCognomePersona(params.title)) {
    return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORIA
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Mappa keyword → categoria (le prime corrispondenze vincono).
 *
 * V2: estese SOLO le keyword interne per classificare meglio i contenuti
 * discovery (cinema/festival/sanità/elezioni/viabilità…). NESSUNA nuova
 * categoria: si mappa sempre nelle 6 esistenti, così la UI non cambia.
 * "Calcio/sport" non ha una categoria esistente adeguata → resta al default
 * della fonte (niente nuove categorie UI).
 */
const MAPPA_CATEGORIE: ReadonlyArray<{ keywords: readonly string[]; categoria: CategoriaNotizia }> = [
  {
    keywords: [
      "protezione civile", "allerta", "maltempo", "incendio", "incendi",
      "terremoto", "alluvione", "emergenza", "emergenze", "roghi", "rogo",
      "evacuaz", "sfollat", "canadair", "soccorso", "soccorsi",
    ],
    categoria: "Protezione civile",
  },
  {
    keywords: [
      "cultura", "mostra", "concerto", "teatro", "biblioteca", "evento",
      "spettacolo", "musica", "cinema", "film", "corti", "cortometragg",
      "festival", "rassegna", "folklore", "danza", "premio", "stage",
      "convegno", "presentazione", "letteratura", "libro", "libri",
      "pittura", "fotografia", "artisti", "arte",
    ],
    categoria: "Cultura",
  },
  {
    keywords: [
      "ambiente", "parco nazionale", "natura", "sostenibil", "rifiuti",
      "biodiversit", "bosco", "boschi", "aree protette", "inquinament",
    ],
    categoria: "Ambiente",
  },
  {
    keywords: [
      "comune di castrovillari", "comune", "giunta", "consiglio comunale",
      "delibera", "avviso", "bandi", "elezioni", "ballottaggio",
      "amministrative", "urne", "sindaco", "sindaca", "voto",
      "viabilità", "viabilita", "traffico", "strade", "strada",
      "asfaltat", "cantieri", "marciapied", "illuminazione pubblica",
    ],
    categoria: "Comune",
  },
  {
    keywords: [
      "provincia", "regione", "istituzioni", "ente", "prefettura",
      "lavori pubblici", "scuola", "edilizia", "sanità", "sanita",
      "sanitar", "ospedale", "ospedal", "poliambulatorio", "poliambulatori",
      "emodinamica", "ambulatori", "medico", "medici", "asl", "118",
    ],
    categoria: "Istituzioni",
  },
];

/** Categoria di una notizia: keyword prima, poi default della fonte. */
export function assegnaCategoria(
  title: string,
  excerpt: string | null,
  categoriaDefault: CategoriaNotizia
): CategoriaNotizia {
  const t = normalizzaTesto(`${title} ${excerpt ?? ""}`);
  for (const riga of MAPPA_CATEGORIE) {
    if (riga.keywords.some((k) => t.includes(normalizzaTesto(k)))) {
      return riga.categoria;
    }
  }
  return categoriaDefault;
}