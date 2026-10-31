/**
 * Risposte cordiali ai saluti autonomi rivolti a Pino.
 * Mantiene la lingua dell'utente e non avvia ricerche non richieste.
 */
export function rispostaSalutoPino(input: string): string | null {
  const q = input.toLowerCase().replace(/[^a-z0-9à-ù]+/g, " ").trim();

  const it: Record<string, string> = {
    ciao: "Ciao!", "ciao pino": "Ciao!", salve: "Ciao!", "salve pino": "Ciao!",
    buongiorno: "Buongiorno!", "buongiorno pino": "Buongiorno!",
    buonasera: "Buonasera!", "buonasera pino": "Buonasera!",
    "buon pomeriggio": "Buon pomeriggio!",
  };
  if (it[q]) return `${it[q]} 😊 Dimmi pure cosa ti piacerebbe cercare o scoprire su InCittà: ti aiuto volentieri!`;

  const en: Record<string, string> = {
    hi: "Hi!", "hi pino": "Hi!", hey: "Hey!", hello: "Hello!",
    "hello pino": "Hello!", "good morning": "Good morning!", "good evening": "Good evening!",
  };
  if (en[q]) return `${en[q]} 😊 What would you like to find or discover on InCittà? I'm happy to help!`;
  return null;
}


/**
 * Risposte relazionali brevi: danno a Pino una voce coerente anche fuori
 * dalle ricerche. Si attivano solo su messaggi autonomi.
 */
export function rispostaRelazionalePino(input: string): string | null {
  const q = input.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(grazie|grazie pino|ti ringrazio|molte grazie|thanks|thank you|thanks pino|thank you pino)$/.test(q)) {
    return "Di nulla! 😊 Quando vuoi, riprendiamo da qui. Se hai un'altra idea o vuoi approfondire qualcosa, ci sono.";
  }
  if (/^(come stai|come va|tutto bene|come te la passi|how are you|how are you pino|are you doing well)$/.test(q)) {
    return "Tutto bene, grazie! Non ho giornate o stati d'animo come una persona, ma sono qui, attento alla conversazione e pronto a darti una mano. Tu come stai?";
  }
  if (/^(scusa|scusami|sorry|i am sorry|my apologies)$/.test(q)) {
    return "Ma figurati, non c'è problema. Dimmi pure, ti seguo.";
  }
  if (/^(bravo|bravo pino|sei bravo|sei forte|ottimo lavoro|well done|good job|you are smart)$/.test(q)) {
    return "Grazie! Il mio obiettivo è renderti le cose più semplici: capire cosa ti serve e aiutarti a trovare una risposta concreta.";
  }
  if (/^(non hai capito|non mi hai capito|non e quello che ho chiesto|non e questo che intendevo|hai capito male|non funziona|sei inutile|you misunderstood|that is not what i asked|you got it wrong)$/.test(q)) {
    return "Hai ragione a fermarmi: probabilmente ho interpretato male quello che intendevi. Ripartiamo dal punto giusto: dimmi quale parte ho frainteso e correggo il tiro, senza farti ripetere tutto da capo se il contesto è già qui.";
  }
  if (/^(arrivederci|a presto|ci vediamo|buona giornata|buona serata|bye|goodbye|see you|see you soon)$/.test(q)) {
    return "A presto! Quando torni, riprendiamo da dove abbiamo lasciato. Buona giornata! 👋";
  }
  if (/^(sei cosciente|hai coscienza|hai sentimenti|provi emozioni|sei vivo|are you conscious|do you have feelings|are you alive)$/.test(q)) {
    return "No, non ho coscienza né sentimenti: sono un'intelligenza artificiale. Posso però mantenere un carattere riconoscibile, seguire il filo del dialogo e risponderti con attenzione e coerenza.";
  }
  if (/^(raccontami una barzelletta|dimmi una battuta|tell me a joke|make me laugh)$/.test(q)) {
    return "Volentieri! Perché il computer è andato dal medico? Perché aveva un virus… e non voleva contagiare tutta la rete! 😄";
  }
  return null;
}
