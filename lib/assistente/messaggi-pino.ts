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

import { normalizzaRichiesta } from "./local-intents";

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

// Traduzioni usate SOLO nella risposta inglese: il soggetto e la restrizione
// arrivano dal lessico italiano, che è la lingua del catalogo. Senza queste
// mappe una frase inglese conteneva «senza glutine» e «questo prodotto».
const SOGGETTI_ALIMENTARI_EN: Readonly<Record<string, string>> = {
  pane: "bread", formaggio: "cheese", carne: "meat", pesce: "fish",
  verdura: "vegetables", frutta: "fruit", miele: "honey", farina: "flour",
  riso: "rice", cipolla: "onion", pomodoro: "tomato", biscotti: "cookies",
  biscotto: "cookie", torta: "cake", pasta: "pasta", olio: "oil",
  vino: "wine", birra: "beer", acqua: "water", latte: "milk", uova: "eggs",
  legumi: "legumes", noci: "nuts", mandorle: "almonds",
};

const RESTRIZIONI_EN: Readonly<Record<string, string>> = {
  "senza glutine": "gluten-free",
  "senza lattosio": "lactose-free",
  "senza zucchero": "sugar-free",
  "senza uova": "egg-free",
  "senza frutta a guscio": "nut-free",
  vegano: "vegan",
  vegetariano: "vegetarian",
};

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
    const soggettoEn = SOGGETTI_ALIMENTARI_EN[soggetto.trim().toLowerCase()] ?? "this product";
    const restrizioneEn = RESTRIZIONI_EN[restrizione.trim().toLowerCase()] ?? "dietary";
    return `I couldn't find any ${soggettoEn} with the “${restrizioneEn}” requirement. I'm not showing unverified alternatives for a dietary restriction.`;
  }
  return `Nel catalogo non trovo prodotti con il requisito «${restrizione}» per «${soggetto}»: non ti mostro alternative non verificate per una restrizione alimentare.`;
}

/** Prezzi reali dei prodotti già recuperati, per «quanto costa?» in contesto. */
export function messaggioPrezziPino(
  lingua: LinguaPino,
  soggetto: string,
  prodotti: Array<{ nome?: string | null; prezzo?: unknown; negozio_nome?: string | null }>
): string {
  const euro = (valore: unknown): string | null => {
    const numero = Number(valore);
    if (!Number.isFinite(numero) || numero <= 0) return null;
    return `€${numero.toFixed(2).replace(".", ",")}`;
  };
  const righe = prodotti
    .slice(0, 5)
    .map((prodotto) => {
      const prezzo = euro(prodotto.prezzo);
      const negozio = prodotto.negozio_nome ? ` — ${prodotto.negozio_nome}` : "";
      return `- **${prodotto.nome ?? soggetto}**${prezzo ? `: ${prezzo}` : ""}${negozio}`;
    })
    .join("\n");
  if (lingua === "en") {
    return `Here are the published prices for **${soggetto}**:\n\n${righe}`;
  }
  return `Ecco i prezzi pubblicati per **${soggetto}**:\n\n${righe}`;
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
 * Bisogno senza locali del tipo giusto, ma con alternative alimentari
 * pubblicate. Il testo distingue sempre ciò che manca da ciò che viene
 * mostrato: un panificio non è un ristorante, un alimentare non è un bar.
 */
export function messaggioBisognoSenzaLocaliPino(
  lingua: LinguaPino,
  bisogno: "fame" | "sete" | "cibo_pronto"
): string {
  if (bisogno === "sete") {
    return lingua === "en"
      ? "No bars, cafés or wine shops are currently listed in the InCittà catalogue. These food shops are published: I can't verify their drinks, so I'm listing them only as reference points:"
      : "Nel catalogo InCittà non risultano bar, caffetterie o enoteche pubblicati. Ci sono queste attività alimentari: non posso verificare le bevande, quindi te le mostro solo come punti di riferimento.";
  }
  if (bisogno === "cibo_pronto") {
    return lingua === "en"
      ? "No delicatessens or ready-meal shops are currently listed in the InCittà catalogue. These food businesses are published, and I'm showing them for what they are:"
      : "Nel catalogo InCittà non risultano gastronomie o rosticcerie pubblicate. Ci sono queste attività alimentari: te le mostro per quello che sono.";
  }
  return messaggioRistorazioneSenzaLocaliPino(lingua);
}

/** Bisogno senza alcuna alternativa pubblicata. */
export function messaggioBisognoVuotoPino(
  lingua: LinguaPino,
  bisogno: "fame" | "sete" | "cibo_pronto"
): string {
  if (bisogno === "sete") {
    return lingua === "en"
      ? "No bars, cafés or wine shops are currently listed in the InCittà catalogue, so I can't point you to a verified place to drink. I won't make one up: try again later or ask me about a specific product."
      : "Nel catalogo InCittà non risultano bar, caffetterie o enoteche pubblicati, quindi non posso indicarti un locale verificato dove bere. Non ne invento: riprova più tardi oppure dimmi un prodotto specifico.";
  }
  if (bisogno === "cibo_pronto") {
    return lingua === "en"
      ? "No shops selling ready-to-eat food are currently listed in the InCittà catalogue. I won't make one up: try again later or ask me about a specific food product."
      : "Nel catalogo InCittà non risultano attività di cibo pronto pubblicate. Non ne invento: riprova più tardi oppure dimmi un prodotto alimentare specifico.";
  }
  return messaggioRistorazioneVuotaPino(lingua);
}

/**
 * Vuoto informato: elenca le categorie realmente pubblicate invece di
 * suggerire genericamente «un'altra categoria» che l'utente non conosce.
 */
export function messaggioVuotoConCatalogoPino(
  lingua: LinguaPino,
  categorie: ReadonlyArray<{ categoria: string; negozi: number }>
): string {
  if (categorie.length === 0) {
    return lingua === "en"
      ? "No businesses matching these criteria are listed in the InCittà catalogue. Try another category or area."
      : "Non risultano attività con questi criteri nel catalogo InCittà. Prova con un'altra categoria o zona.";
  }
  const elenco = categorie.map((voce) => `${voce.categoria} (${voce.negozi})`).join(", ");
  return lingua === "en"
    ? `No businesses matching these criteria are listed in the InCittà catalogue. The published categories are: ${elenco}. Try one of these or tell me what you're looking for.`
    : `Nel catalogo InCittà non risultano attività con questi criteri. Le categorie pubblicate sono: ${elenco}. Prova con una di queste oppure dimmi cosa cerchi.`;
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

/**
 * Nessuna attività aperta in questo momento. Il dato è verificato sugli orari
 * pubblicati: non è un catalogo vuoto e non va comunicato con «prova un'altra
 * categoria».
 */
export function messaggioNessunaAttivitaApertaPino(lingua: LinguaPino): string {
  if (lingua === "en") {
    return "No business in the InCittà catalogue is open right now according to its published opening hours. I won't list closed shops as if they were open: try again later or ask me about a specific business.";
  }
  return "Secondo gli orari pubblicati, in questo momento non risulta aperta nessuna attività del catalogo InCittà. Non ti elenco negozi chiusi come se fossero aperti: riprova più tardi oppure chiedimi di un'attività specifica.";
}

/**
 * L'utente chiede di ordinare: Pino non completa ordini, ma il prodotto trovato
 * resta utile. La nota accompagna i risultati invece di sostituirli.
 */
export function richiestaOrdinePino(query: string): boolean {
  const q = normalizzaRichiesta(query ?? "");
  if (!q) return false;
  if (/\b(?:consigli|consiglio|dove|quale|quali)\b/.test(q)) return false;
  return /\b(?:vorrei|voglio|desidero|mi\s+piacerebbe|potrei)\s+(?:ordinare|comprare|acquistare)\b/.test(q);
}

/**
 * Attributo richiesto (colore, materiale, provenienza) che il catalogo non
 * dichiara sui prodotti mostrati: la risposta non può confermarlo.
 */
export function messaggioAttributoNonDocumentatoPino(
  lingua: LinguaPino,
  attributi: string
): string {
  if (lingua === "en") {
    return `The catalogue doesn't declare “${attributi}” for the products shown, so I can't confirm that attribute.`;
  }
  return `Il catalogo non dichiara «${attributi}» per i prodotti mostrati: non posso confermare quell'attributo.`;
}

export function messaggioOrdineNonDisponibilePino(lingua: LinguaPino): string {
  if (lingua === "en") {
    return "I can't complete the order for you: the product is in the catalogue, but the purchase must be completed on the shop's website.";
  }
  return "Non posso completare l'ordine al posto tuo: il prodotto è nel catalogo, ma l'acquisto si conclude dal sito del negozio.";
}
