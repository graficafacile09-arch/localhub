/**
 * Pino — etichette dei risultati.
 *
 * I conteggi mostrati sotto le card devono seguire la lingua della risposta:
 * il testo della risposta è già localizzato dal server, quindi anche queste
 * etichette leggono la stessa lingua invece di restare fisse in italiano.
 * Modulo puro, senza dipendenze: lo usa il client e lo verificano i test.
 */

export type PinoLinguaEtichette = "it" | "en";

/** "1 prodotto trovato" / "1 product found". */
export function etichettaProdottiTrovatiPino(
  n: number,
  lingua: PinoLinguaEtichette = "it"
): string {
  return lingua === "en"
    ? `${n} ${n === 1 ? "product found" : "products found"}`
    : `${n} ${n === 1 ? "prodotto trovato" : "prodotti trovati"}`;
}

/** "1 negozio trovato" / "1 store found". */
export function etichettaNegoziTrovatiPino(
  n: number,
  lingua: PinoLinguaEtichette = "it"
): string {
  return lingua === "en"
    ? `${n} ${n === 1 ? "store found" : "stores found"}`
    : `${n} ${n === 1 ? "negozio trovato" : "negozi trovati"}`;
}
