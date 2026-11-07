/**
 * Pino — Bisogni impliciti ("ho fame", "ho sete", "una birra").
 *
 * Un bisogno non è una categoria del catalogo: è ciò che l'utente vuole fare.
 * Il piano deterministico cerca il termine principale (ristorante, bar), ma
 * quando il catalogo non ha quel tipo di attività la risposta non deve
 * fermarsi a "non risultano attività": deve mostrare le alternative reali e
 * dichiarare cosa sono (un panificio non è un ristorante).
 *
 * Questo modulo è puro: nessun accesso a rete o database, così le regole sono
 * verificabili senza Supabase.
 *
 * @module lib/assistente/bisogni
 */

import {
  ATTIVITA_CATALOGO_PINO,
  ATTIVITA_CIBO_PRONTO_PINO,
} from "./lexicon";
import { normalizzaRichiesta } from "./local-intents";
import { richiestaRistorazionePino } from "./routing-policy";

export type BisognoPino = "fame" | "sete" | "cibo_pronto";

/**
 * "Ho sete" e le sue forme reali. Il verbo "bere" da solo non basta: "bere
 * un caffè" è un bisogno, "bere" in una frase sul vino può essere un prodotto.
 * Le forme elencate sono richieste di consumo, non acquisti.
 */
const RE_SETE =
  /\b(?:ho sete|che sete|bere qualcosa|qualcosa da bere|bevanda|bevande|drink|thirsty|something to drink|a drink|una birra|un caffe|un caffè|un aperitivo|un bicchiere|un succo|una spremuta)\b/;

/** Riconosce un bisogno esplicito, altrimenti null. */
export function rilevaBisognoPino(query: string): BisognoPino | null {
  const q = normalizzaRichiesta(String(query ?? ""));
  if (!q) return null;
  if (richiestaRistorazionePino(q)) return "fame";
  if (RE_SETE.test(q)) return "sete";
  // Attività di cibo pronto richiesta per nome ("gastronomia", "panificio"):
  // se il catalogo non ne ha, valgono le alternative pubblicate.
  const attivita = ATTIVITA_CATALOGO_PINO.find((voce) => voce.pattern.test(q));
  if (attivita && ATTIVITA_CIBO_PRONTO_PINO.includes(attivita.termine)) {
    return "cibo_pronto";
  }
  return null;
}

export type AlternativeBisognoPino = {
  bisogno: BisognoPino;
  /** Termini da cercare quando il piano principale non ha prodotto nulla. */
  termini: readonly string[];
};

/**
 * Alternative pubblicate per un bisogno senza risultati.
 *
 * Per la sete l'unica alternativa verificabile sono gli alimentari: il testo
 * dirà che le bevande non sono documentate, senza inventarle.
 */
export function alternativeBisognoPino(
  query: string,
  bisogno: BisognoPino | null = rilevaBisognoPino(query)
): AlternativeBisognoPino | null {
  if (bisogno === "fame" || bisogno === "cibo_pronto") {
    return { bisogno, termini: ATTIVITA_CIBO_PRONTO_PINO };
  }
  if (bisogno === "sete") {
    return { bisogno, termini: ["alimentari"] };
  }
  return null;
}
