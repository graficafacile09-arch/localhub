/**
 * LocalHub — Pino Conversazionale v1
 *
 * Livello di CONTESTO della conversazione, interno all'assistente. Vive solo nel
 * flusso di Pino: non tocca /api/search, la ricerca pubblica, il catalogo, il
 * database (solo lettura) né il sistema di sicurezza minori.
 *
 * Fornisce:
 *   - `rilevaFollowUp(query)`: riconosce le richieste BREVI che modificano il
 *     risultato precedente ("solo aperti ora", "solo economici", "vicino a me",
 *     "fammi vedere altro", "alternative", "ancora");
 *   - `soggettoPrecedente(utenti)`: recupera il soggetto sostanziale su cui
 *     applicare il follow-up (saltando eventuali altri follow-up);
 *   - `apertoOra(orari, now)`: stato aperto/chiuso REALE dagli orari registrati
 *     (nessuna stima: se gli orari mancano o non sono verificabili → null);
 *   - `motivoCategoria(negozi)`: spiegazione del perché un'attività è pertinente,
 *     costruita SOLO sulla sua categoria reale (nessuna caratteristica inventata).
 *
 * @module lib/assistente/conversazione
 */

import { fasceNormalizzate } from "@/lib/orari";
import { ITALIAN_DAYS, type DaySchedule, type Orari } from "@/types/negozio";
import { normalizzaRichiesta } from "./local-intents";

// ─── Follow-up ───────────────────────────────────────────────────────────────

export type FollowUpTipo = "aperti" | "economici" | "vicino" | "altro";

export type FollowUp = {
  tipo: FollowUpTipo;
  /** Frammento che ha attivato il riconoscimento (log/test). */
  segnale: string;
};

// Un follow-up è un messaggio BREVE: senza questo vincolo una domanda lunga che
// contiene per caso "altro"/"ancora" verrebbe trattata come prosecuzione.
const MAX_PAROLE_FOLLOWUP = 5;

const SEGNALI: { tipo: FollowUpTipo; re: RegExp }[] = [
  // "solo aperti ora", "quelli aperti", "aperto ora", "solo aperte"
  { tipo: "aperti", re: /\b(?:solo\s+)?(?:quelli\s+|quelle\s+)?apert[oi]\b|\bapert[eo]\s+ora\b/ },
  // "solo economici", "i più economici", "poco caro", "a basso prezzo", "low cost"
  {
    tipo: "economici",
    re: /\b(?:solo\s+)?(?:pi[uù]\s+)?economic[hi]\b|\beconomic[he]\b|\bpoco\s+car[oi]\b|\ba\s+basso\s+prezzo\b|\blow\s?cost\b/,
  },
  // "solo vicino", "vicino a me", "nelle vicinanze"
  { tipo: "vicino", re: /\b(?:solo\s+)?vicin[oi]\b|\bvicino\s+a\s+me\b|\b(?:nelle?\s+)?vicinanze\b/ },
  // "fammi vedere altro", "mostrami altro", "alternative", "ancora", "di più"
  {
    tipo: "altro",
    re: /\bfammi\s+vedere\s+altro\b|\bmostrami\s+altro\b|\bvediamo\s+altro\b|\baltro\b|\baltre\b|\baltri\b|\balternativ[ae]\b|\bancora\b|\bdi\s+pi[uù]\b/,
  },
];

function contaParole(q: string): number {
  return q.split(/[^a-z0-9']+/).filter(Boolean).length;
}

/** Riconosce un follow-up breve, o null se il messaggio non lo è. */
export function rilevaFollowUp(query: string): FollowUp | null {
  const q = normalizzaRichiesta(query ?? "");
  if (!q || contaParole(q) > MAX_PAROLE_FOLLOWUP) return null;
  for (const s of SEGNALI) {
    const m = q.match(s.re);
    if (m) return { tipo: s.tipo, segnale: m[0] };
  }
  return null;
}

/**
 * Soggetto sostanziale su cui applicare il follow-up: l'ultima richiesta
 * dell'utente prima del follow-up corrente, saltando eventuali follow-up in
 * catena ("solo aperti ora" → "solo economici" resta sullo stesso soggetto).
 */
export function soggettoPrecedente(utenti: string[]): string | null {
  for (let i = utenti.length - 2; i >= 0; i--) {
    const t = (utenti[i] ?? "").trim();
    if (!t) continue;
    if (rilevaFollowUp(t)) continue;
    return t;
  }
  return null;
}

// ─── Aperto ora (dato reale, nessuna stima) ──────────────────────────────────

/**
 * True/False se lo stato è verificabile dagli orari registrati; null se gli
 * orari mancano, il giorno non è presente o l'apertura è dichiarata senza fasce
 * utilizzabili. Non inventiamo mai "aperto".
 */
export function apertoOra(
  orari: Orari | null | undefined,
  now: Date = new Date()
): boolean | null {
  if (!orari || typeof orari !== "object") return null;
  const giorno = ITALIAN_DAYS[now.getDay()];
  const scheda = (orari as Record<string, DaySchedule | undefined>)[giorno];
  if (!scheda) return null;
  if (scheda.chiuso) return false;
  const fasce = fasceNormalizzate(scheda);
  if (fasce.length === 0) return null; // aperto dichiarato ma senza fasce: non verificabile
  const minuti = now.getHours() * 60 + now.getMinutes();
  return fasce.some((f) => minuti >= f.open && minuti < f.close);
}

// ─── Motivazione basata sui dati reali ───────────────────────────────────────
// La spiegazione è derivata SOLO dalla categoria dell'attività registrata nel
// DB: nessun attributo inventato per il singolo negozio.

const MOTIVO_PER_CATEGORIA: [RegExp, string][] = [
  [/panific|panetteria|forno/, "trattano prodotti da forno"],
  [/alimentari|bottega|gastronomia|drogheria|salumeria|macelleria|ortofrutta|enoteca/, "vendono prodotti alimentari e tipici"],
  [/pizzeri|ristorant|trattori|tavola calda|rosticceria|pescheria/, "preparano cibo"],
  [/bar|caffetteri|birreri|vineria/, "servono bevande e caffetteria"],
  [/gioielleri|bomboniere/, "propongono gioielli e idee regalo"],
  [/abbigliament|boutique|calzatur|moda|sartoria/, "vendono abbigliamento"],
  [/salute|medic|farmac|ambulatori|otorino|dentist/, "offrono servizi sanitari"],
  [/parrucch|barbier|estetic|beauty|capelli/, "offrono servizi di cura della persona"],
  [/artigian/, "sono attività artigiane"],
];

/**
 * Spiega perché le attività mostrate sono pertinenti, citando la loro categoria
 * reale. Restituisce null quando non ci sono categorie su cui basarsi.
 */
export function motivoCategoria(negozi: { categoria?: string | null }[]): string | null {
  const categorie = Array.from(
    new Set(negozi.map((n) => (n.categoria ?? "").trim()).filter(Boolean))
  );
  if (categorie.length === 0) return null;

  const motivi = Array.from(
    new Set(
      categorie
        .map(
          (c) =>
            MOTIVO_PER_CATEGORIA.find(([re]) => re.test(normalizzaRichiesta(c)))?.[1]
        )
        .filter((m): m is string => Boolean(m))
    )
  );
  if (motivi.length === 0) return null;

  const motivo = motivi.join(" e ");
  const soggetto =
    categorie.length === 1
      ? `la categoria "${categorie[0]}" indica che`
      : `le categorie (${categorie.join(", ")}) indicano che`;
  return `Perché te le segnalo: ${soggetto} ${motivo}.`;
}
