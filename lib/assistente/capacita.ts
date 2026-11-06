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

  if (
    /\b(?:puoi|potresti|mi|vorrei che tu|voglio che tu)\b[\s\S]{0,35}\b(?:ordinare|comprare|acquistare|completare)\b/.test(q) ||
    /\b(?:ordina|compra|acquista)\s+(?:tu|per me)\b/.test(q) ||
    /\bmi\s+(?:ordini|compri|acquisti)\b/.test(q) ||
    /\b(?:completa|concludi)\s+(?:l'|il)\s+ordine\b/.test(q)
  ) {
    return "ordine";
  }

  if (
    /\b(?:puoi|potresti|mi|vorrei che tu)\b[\s\S]{0,35}\b(?:pagare|effettuare|completare)\b[\s\S]{0,20}\b(?:pagamento|checkout)\b/.test(q) ||
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
