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

/**
 * Condizione alimentare dichiarata (celiachia, allergia, intolleranza) senza
 * un prodotto specifico filtrabile. Pino non consiglia alimenti o locali che
 * non può verificare e indica il passo sicuro: etichetta, certificazione o
 * contatto diretto con il venditore.
 */
export function messaggioCondizioneAlimentarePino(
  lingua: LinguaPino,
  condizione: string,
  restrizione: string | null = null
): string {
  const filtro = restrizione
    ? lingua === "en"
      ? ` If you are looking for a specific product, tell me which one and I'll filter only items that state “${restrizione}”.`
      : ` Se cerchi un prodotto specifico, dimmi quale e filtro solo quelli che riportano «${restrizione}».`
    : "";
  if (lingua === "en") {
    const condizioneEn =
      condizione === "celiachia"
        ? "coeliac disease"
        : condizione === "intolleranza al lattosio"
          ? "lactose intolerance"
          : "a food allergy or intolerance";
    return `I can't verify from the InCittà catalogue that a food or a venue is suitable for someone with ${condizioneEn}. I won't show unverified options: check the label or certification, or contact the seller directly.${filtro}`;
  }
  return `Non posso verificare dal catalogo InCittà che un alimento o un locale sia adatto a una persona con ${condizione}. Non ti mostro opzioni non verificate: controlla l'etichetta o la certificazione, oppure contatta direttamente il venditore.${filtro}`;
}

/**
 * Ristorazione senza locali pubblicati: nel catalogo non risultano ristoranti,
 * pizzerie o trattorie, ma ci sono attività alimentari reali (gastronomie,
 * panifici, alimentari) che possono rispondere al bisogno "ho fame".
 *
 * Il testo NON le presenta come ristoranti e non finge una scelta che non
 * esiste: dichiara il vuoto reale e motiva le alternative mostrate.
 */
export function messaggioRistorazioneSenzaLocaliPino(lingua: LinguaPino): string {
  if (lingua === "en") {
    return "No restaurants, pizzerias or trattorias are currently listed in the InCittà catalogue. For a quick bite, these food businesses are published — I'm showing them as what they are, not as restaurants:";
  }
  return "Nel catalogo InCittà non risultano ristoranti, pizzerie o trattorie pubblicati. Per mangiare qualcosa al volo ci sono queste attività alimentari: te le mostro per quello che sono, non come ristoranti.";
}

/**
 * Ristorazione senza alcuna alternativa alimentare: il vuoto è reale e non va
 * mascherato con un "prova un'altra categoria" che non aiuta.
 */
export function messaggioRistorazioneVuotaPino(lingua: LinguaPino): string {
  if (lingua === "en") {
    return "No restaurants, pizzerias, bakeries or food shops are currently listed in the InCittà catalogue, so I can't point you to a verified place to eat. I won't make one up: try again later or tell me a specific food product I can look for.";
  }
  return "Nel catalogo InCittà non risultano al momento ristoranti, pizzerie, panifici o alimentari pubblicati, quindi non posso indicarti un posto verificato dove mangiare. Non ne invento: riprova più tardi oppure dimmi un prodotto alimentare specifico che posso cercare.";
}
