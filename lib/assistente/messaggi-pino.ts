/**
 * Pino — Dizionario dei messaggi deterministici.
 *
 * I testi che compongono una risposta senza passare dal modello vivono qui:
 * una variante italiana e una inglese per ogni frase, in un solo posto. Prima
 * ogni messaggio era scritto inline nel punto in cui serviva, quindi la stessa
 * informazione esisteva in due lingue e in tre rami diversi.
 *
 * Questo file nasce come casa dei messaggi nuovi. I messaggi storici
 * (indisponibilità, fonti parziali, attributi) sono ancora nei rispettivi
 * moduli: spostarli è un passaggio meccanico a sé, non un cambio di contenuto.
 *
 * @module lib/assistente/messaggi-pino
 */

export type LinguaPino = "it" | "en";

/**
 * La qualifica richiesta non è documentata dal catalogo: i prodotti mostrati
 * sono quelli del solo soggetto. Il messaggio non deve far credere che la
 * qualifica sia stata verificata, né dire che non esiste nulla.
 */
export function messaggioQualificazioneRilassataPino(
  lingua: LinguaPino,
  soggetto: string,
  qualificatore: string
): string {
  if (lingua === "en") {
    return `I couldn't find a product labelled “${qualificatore}” for “${soggetto}”, so I'm showing you what the catalogue has. I won't claim that qualifier for these products.`;
  }
  return `Nel catalogo non trovo un prodotto con la qualifica «${qualificatore}» per «${soggetto}»: ti mostro quello che c'è, senza attribuirgli quella qualifica.`;
}

/**
 * Restrizione alimentare non documentata: nessuna alternativa non verificata.
 * A differenza della qualifica "morbida", qui non si mostrano prodotti del
 * solo soggetto, perché potrebbero contraddire la restrizione.
 */
export function messaggioRestrizioneAlimentarePino(
  lingua: LinguaPino,
  soggetto: string,
  restrizione: string
): string {
  if (lingua === "en") {
    return `I couldn't find any product with the “${restrizione}” requirement for “${soggetto}”. I'm not showing unverified alternatives for a dietary restriction.`;
  }
  return `Nel catalogo non trovo prodotti con il requisito «${restrizione}» per «${soggetto}»: non ti mostro alternative non verificate per una restrizione alimentare.`;
}
