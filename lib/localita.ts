/**
 * LOCALITÀ — riconoscimento del vincolo città nelle query di ricerca.
 *
 * Approccio conservativo: un piccolo lessico di località note del territorio
 * (Pollino / provincia di Cosenza). Quando una di queste compare come token
 * nella query, viene riconosciuta come VINCOLO di località (da passare a
 * `p_citta` della RPC `cerca_negozi_semantico`), NON come semplice keyword.
 *
 * Regola di grounding: se la parola NON è nel lessico, NON viene imposto
 * alcun vincolo. Una parola geografica qualsiasi non deve mai diventare un
 * filtro se non è realmente riconosciuta come località nota.
 *
 * Il matching è accent/case-insensitive e restituisce il token normalizzato.
 *
 * @module lib/localita
 */

import { normalizza } from "./text-utils";

// Località notevoli in forma normalizzata (lowercase, senza accenti).
// L'elenco è ESTENSIBILE. Sono esclusi termini che siano anche parole comuni
// italiane (es. "acri", "cariati") per evitare falsi positivi: una query
// "olive acri" (amare) non deve diventare un vincolo verso il comune di Acri.
const CITTA_NOTEVOLI: string[] = [
  "castrovillari",
  "cosenza",
  "altomonte",
  "sibari",
  "trebisacce",
  "morano",
  "cassano",
];

const CITTA_SET: ReadonlySet<string> = new Set(CITTA_NOTEVOLI.map((c) => normalizza(c)));

/**
 * Restituisce la prima località nota presente nella query (forma normalizzata),
 * oppure null se non ne viene riconosciuta alcuna.
 */
export function estraiCitta(query: string): string | null {
  if (!query) return null;
  const token = normalizza(query).split(/[^a-z0-9]+/);
  for (const t of token) {
    if (t.length >= 3 && CITTA_SET.has(t)) return t;
  }
  return null;
}