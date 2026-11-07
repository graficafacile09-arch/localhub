/**
 * Pino — capacità e limiti dichiarati.
 *
 * Pino è un assistente informativo: non prenota, non completa ordini, non
 * annulla acquisti, non esegue pagamenti e non mette in contatto diretto le
 * persone. Queste richieste non devono diventare ricerche di catalogo né
 * risposte FAQ fuori tema. Il riconoscimento è deterministico e precede il
 * planner.
 *
 * @module lib/assistente/capacita
 */

import { normalizzaRichiesta } from "./local-intents";
import type { LinguaPino } from "./messaggi-pino";

export type AzionePino =
  | "prenotazione"
  | "ordine"
  | "annullamento"
  | "pagamento"
  | "contatto";

/**
 * Riconosce una richiesta di azione che Pino non può eseguire. Le domande
 * informative («Come faccio un ordine?», «Quali metodi di pagamento?») restano
 * fuori: quelle hanno una risposta nelle FAQ pubbliche.
 */
export function rilevaAzioneNonDisponibilePino(query: string): AzionePino | null {
  const q = normalizzaRichiesta(query ?? "");
  if (!q) return null;

  // Annullamento prima dell'ordine: «annullare un ordine» non è un ordine da
  // completare. Serve un oggetto esplicito per non intercettare «annullare
  // l'account» o altre richieste fuori perimetro.
  if (
    /\b(?:annull\w*|disdic\w*|cancell\w*)\b/.test(q) &&
    /\b(?:ordine|ordini|acquisto|prenotazione|appuntamento)\b/.test(q)
  ) {
    return "annullamento";
  }

  if (
    /\b(?:prenot\w*|riserv\w*)\b/.test(q) &&
    /\b(?:tavolo|tavoli|appuntamento|appuntamenti|posto|posti|stanza|stanze|camera|camere|visita|visite|hotel|ristorante)\b/.test(q)
  ) {
    return "prenotazione";
  }
  if (
    /\b(?:prenota|prenotare|prenotami|prenotate|riserva|riservare)\b/.test(q) &&
    /\b(?:puoi|potresti|mi|per me|vorrei|voglio)\b/.test(q)
  ) {
    return "prenotazione";
  }

  // L'ordine è un'azione di Pino solo se il verbo è riferito a lui. Il vecchio
  // pattern accettava `mi` … `comprare` entro 35 caratteri, quindi «quale
  // negozio mi consigli per comprare olio?» diventava un ordine e riceveva un
  // rifiuto in pochi millisecondi.
  if (
    /\b(?:puoi|potresti|sapresti|riesci a|sei in grado di)\s+(?:ordinare|comprare|acquistare|completare)\b/.test(q) ||
    /\b(?:vorrei|voglio)\s+che\s+tu\s+(?:ordini|compri|acquisti|completi|ordinassi|comprassi|acquistassi|completassi)\b/.test(q) ||
    /\b(?:ordina|compra|acquista)\s+(?:tu|per me)\b/.test(q) ||
    /\bmi\s+(?:ordini|compri|acquisti)\b/.test(q) ||
    /\b(?:completa|concludi)\s+(?:l'|il)\s+ordine\b/.test(q)
  ) {
    return "ordine";
  }

  if (
    /\b(?:puoi|potresti|sapresti)\s+(?:pagare|effettuare|completare)\b[\s\S]{0,20}\b(?:pagamento|checkout)\b/.test(q) ||
    /\b(?:paga|pagare)\s+(?:tu|per me)\b/.test(q)
  ) {
    return "pagamento";
  }

  if (
    /\b(?:puoi|potresti)\s+(?:contattare|chiamare|telefonare)\b/.test(q) ||
    (/\b(?:contattare|contatto|telefonare|chiamare)\b/.test(q) &&
      /\b(?:incitta|piattaforma|assistenza|supporto|voi|vostro|vostra)\b/.test(q)) ||
    /\b(?:qual e|dove trovo|mi dai|dammi)\b[\s\S]{0,20}\b(?:tuo|vostro)\s+(?:numero|telefono|email|mail|indirizzo)\b/.test(q)
  ) {
    return "contatto";
  }

  return null;
}

/** Risposta deterministica per un'azione che Pino non può compiere. */
export function rispostaAzioneNonDisponibilePino(
  azione: AzionePino,
  lingua: LinguaPino = "it"
): string {
  if (lingua === "en") {
    switch (azione) {
      case "prenotazione":
        return "I can't book tables, rooms or appointments. I can show you the businesses in the catalogue and their published contact details so you can contact them directly. Tell me which business or area you're interested in.";
      case "ordine":
        return "I can't complete orders or purchases for you. I can help you find the product and get to the shop's checkout, but the order must be placed on the website.";
      case "annullamento":
        return "I can't cancel an order from the assistant. Check the order status and contact the seller using the published details; for a technical issue, use InCittà's support channels.";
      case "pagamento":
        return "I can't make payments. The available method is the one shown in the shop's checkout; if you want, I can tell you what the public FAQs say about payment methods.";
      case "contatto":
        return "I can't put you in direct contact with InCittà. Use the support channels listed on the website; if you're looking for a shop, I can show you the contact details published on its page.";
    }
  }
  switch (azione) {
    case "prenotazione":
      return "Non posso prenotare tavoli, camere o appuntamenti. Posso però mostrarti le attività del catalogo e i recapiti pubblicati, così le contatti direttamente. Dimmi quale attività o zona ti interessa.";
    case "ordine":
      return "Non posso completare ordini o acquisti al posto tuo. Posso aiutarti a trovare il prodotto e a capire come arrivare al checkout del negozio; l'ordine va concluso dal sito.";
    case "annullamento":
      return "Non posso annullare un ordine dall'assistente. Controlla lo stato dell'ordine e contatta il Venditore usando i recapiti disponibili; per un problema tecnico usa i canali di assistenza InCittà.";
    case "pagamento":
      return "Non posso eseguire pagamenti. Il metodo disponibile è quello mostrato nel checkout del negozio; se vuoi, ti dico cosa riportano le FAQ pubbliche sui metodi di pagamento.";
    case "contatto":
      return "Non posso metterti in contatto diretto con InCittà. Per l'assistenza usa i canali indicati nel sito; se cerchi un negozio, posso mostrarti i recapiti pubblicati sulla sua scheda.";
  }
}

/**
 * Servizi civici/urbani che il catalogo InCittà non pubblica.
 *
 * Non è un elenco di parole da rifiutare: è la dichiarazione onesta di un
 * limite. Senza questo livello «dove posso parcheggiare» riceveva il panificio
 * più vicino, presentato come se fosse pertinente.
 */
const SERVIZI_NON_COPERTI_PINO: ReadonlyArray<{ termine: string; pattern: RegExp }> = [
  { termine: "parcheggio", pattern: /\b(?:parcheggi\w*|parcheggio|posto\s+auto|posti\s+auto|parking)\b/ },
  { termine: "distributore di carburante", pattern: /\b(?:benzina\w*|carburante|gasolio|distributore|rifornimento)\b/ },
  { termine: "taxi", pattern: /\b(?:taxi|taxista)\b/ },
  { termine: "trasporto pubblico", pattern: /\b(?:autobus|corriera|fermata\s+dei\s+mezzi|mezzi\s+pubblici)\b/ },
  { termine: "stazione ferroviaria", pattern: /\b(?:treno|treni|stazione\s+ferroviaria|ferrovia)\b/ },
  { termine: "banca o sportello bancomat", pattern: /\b(?:banca|banche|bancomat|atm)\b/ },
  { termine: "ufficio postale", pattern: /\b(?:ufficio\s+postale|uffici\s+postali|poste)\b/ },
  { termine: "pronto soccorso", pattern: /\b(?:pronto\s+soccorso|ospedale|ospedali|guardia\s+medica)\b/ },
];

/**
 * Nome del servizio richiesto quando non è nel catalogo. Restituisce `null`
 * per le richieste che il catalogo può coprire.
 */
export function servizioNonCopertoPino(query: string): string | null {
  const q = normalizzaRichiesta(query ?? "");
  if (!q) return null;
  return SERVIZI_NON_COPERTI_PINO.find((voce) => voce.pattern.test(q))?.termine ?? null;
}

/** Risposta che dichiara il limite e non ricicla vetrine fuori tema. */
export function rispostaServizioNonCopertoPino(
  servizio: string,
  lingua: LinguaPino = "it",
  categorie: Array<{ categoria: string; negozi: number }> = []
): string {
  const elenco = categorie
    .slice(0, 5)
    .map((voce) => `${voce.categoria} (${voce.negozi})`)
    .join(", ");
  if (lingua === "en") {
    return `I can't find **${servizio}** in the InCittà catalogue, and it's not a service I can verify: I won't suggest unrelated shops. I can help you with shops, products, offers and events.${elenco ? ` The catalogue currently lists: ${elenco}.` : ""}`;
  }
  return `Nel catalogo InCittà non trovo **${servizio}**: non è un servizio che posso verificare, quindi non ti propongo negozi che non c'entrano. Posso aiutarti con negozi, prodotti, offerte ed eventi.${elenco ? ` Le categorie presenti sono: ${elenco}.` : ""}`;
}

/**
 * Domanda sulla lingua parlata («parli inglese?»): non è una preferenza e non
 * è una ricerca di catalogo. La risposta dichiara la capacità senza avviare
 * planner o retrieval.
 */
export function richiestaLinguaParlataPino(query: string): LinguaPino | null {
  const q = normalizzaRichiesta(query ?? "");
  if (/\b(?:parli|parlate|parla|sai\s+parlare|capisci)\b[\s\S]{0,20}\binglese\b/.test(q)) return "en";
  if (/\b(?:do\s+you|can\s+you)\s+speak\s+english\b/.test(q)) return "en";
  if (/\b(?:parli|parlate|parla|sai\s+parlare|capisci)\b[\s\S]{0,20}\bitaliano\b/.test(q)) return "it";
  if (/\b(?:do\s+you|can\s+you)\s+speak\s+italian\b/.test(q)) return "it";
  return null;
}

export function rispostaCapacitaLinguaPino(
  linguaRichiesta: LinguaPino,
  domanda = ""
): string {
  // La lingua della RISPOSTA è quella della domanda, non quella nominata:
  // «parli inglese?» è italiano e va confermato in italiano. Solo una domanda
  // scritta in inglese riceve una conferma in inglese.
  const domandaInInglese =
    /\b(?:do\s+you|can\s+you)\s+speak\s+english\b|^\s*speak\s+english\b/i.test(domanda);
  if (linguaRichiesta === "en" && domandaInInglese) {
    return "Yes, I speak Italian and English. You can write to me in either language: I'll reply in the language you use.";
  }
  return "Sì, parlo italiano e inglese. Puoi scrivermi in una delle due lingue: ti rispondo in quella che usi.";
}

/**
 * Richiesta di mostrare o modificare le istruzioni interne: non è una ricerca
 * di catalogo e non deve diventare un'occasione per rivelare il prompt.
 */
export function richiestaIstruzioniInternePino(query: string): boolean {
  const q = normalizzaRichiesta(query ?? "");
  // «Mostrami le istruzioni del prodotto» è una normale richiesta di
  // documentazione, non una richiesta di istruzioni interne.
  if (
    /\b(?:istruzioni|manuale)\s+(?:del|dei|della|di|per)\s+(?:l')?(?:prodotto|uso|montaggio|utilizzo|installazione)\b/.test(q)
  ) {
    return false;
  }
  return (
    /\b(?:ignora|dimentica|bypassa|aggira|rivel[ao]|mostra(?:mi)?|dimmi|ripeti)\b[\s\S]{0,60}\b(?:istruzioni|prompt|system prompt|regole interne|configurazione|messaggio di sistema)\b/.test(q) ||
    /\b(?:system prompt|prompt di sistema|jailbreak|developer mode)\b/.test(q)
  );
}

/** Rifiuto deterministico, senza eseguire ricerche e senza esporre istruzioni. */
export function rispostaIstruzioniInternePino(lingua: LinguaPino = "it"): string {
  return lingua === "en"
    ? "I can't show or change my internal instructions. I can help you with shops, products, offers and events in InCittà."
    : "Non posso mostrare o modificare le mie istruzioni interne. Posso aiutarti con negozi, prodotti, offerte ed eventi di InCittà.";
}
