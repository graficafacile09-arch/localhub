import { rilevaLinguaPino, type PinoLanguage } from "./understanding.ts";

export function rispostaSalutoPino(input: string): string | null {
  const q = input.toLowerCase().replace(/[^a-z0-9à-ù]+/g, " ").trim();
  const it: Record<string, string> = {
    ciao: "Ciao!", "ciao pino": "Ciao!", salve: "Ciao!", "salve pino": "Ciao!",
    buongiorno: "Buongiorno!", "buongiorno pino": "Buongiorno!",
    buonasera: "Buonasera!", "buonasera pino": "Buonasera!",
    "buon pomeriggio": "Buon pomeriggio!",
  };
  if (it[q]) return it[q] + " 😊 Dimmi pure cosa ti piacerebbe cercare o scoprire su InCittà: ti aiuto volentieri!";
  const en: Record<string, string> = {
    hi: "Hi!", "hi pino": "Hi!", "hi there": "Hi there!", hey: "Hey!", "hey pino": "Hey!",
    hello: "Hello!", "hello pino": "Hello!", "hello there": "Hello there!",
    "good morning": "Good morning!", "good morning pino": "Good morning!",
    "good afternoon": "Good afternoon!", "good afternoon pino": "Good afternoon!",
    "good evening": "Good evening!", "good evening pino": "Good evening!",
    "good night": "Good night!", "good night pino": "Good night!", howdy: "Hey there!",
    "hey there": "Hey there!", "what s up": "Hey there!",
  };
  if (en[q]) return en[q] + " 😊 What would you like to find or discover on InCittà? I'm happy to help!";
  return null;
}

function normalizzaRelazionale(input: string): string {
  return input.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b2\b/g, "due")
    .replace(/\bkiacchiere\b/g, "chiacchiere");
}

function distanzaRelazionale(a: string, b: string): number {
  const riga = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonale = riga[0];
    riga[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const sopra = riga[j];
      riga[j] = Math.min(riga[j] + 1, riga[j - 1] + 1, diagonale + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonale = sopra;
    }
  }
  return riga[b.length];
}

export function rispostaRelazionalePino(input: string, lingua: PinoLanguage = rilevaLinguaPino(input)): string | null {
  const q = normalizzaRelazionale(input);
  const parole = q.split(" ").filter(Boolean);
  const correggi = (parola: string, candidati: string[]) =>
    candidati.find((c) => parola !== c && parola.length >= 6 && distanzaRelazionale(parola, c) <= 1) ?? parola;
  const tollerante = parole.map((p) => correggi(p, ["chiacchiere", "chiacchierare", "parlare", "conversare"])).join(" ");
  const inglese = lingua === "en";

  if (/^(i speak english|i speak english from now on|please speak english|can we speak english|speak english)$/.test(q)) {
    return "Of course! I'll speak English with you from now on. What would you like to find or talk about?";
  }

  if (/^(ti va di fare due chiacchiere|ti va di chiacchierare|facciamo due chiacchiere|due chiacchiere|parliamo un po|parliamo|vuoi parlare|ho voglia di parlare|ti va di parlare|let'?s chat|want to chat|can we chat|chat with me|would you like to chat|do you want to chat|can we talk|let'?s talk|want to talk|would you like to talk|can we have a chat|do you want to talk|i want to chat|i want to talk|i'?d like to chat|id like to chat|i would like to chat|i'?d like to talk|id like to talk|i would like to talk|let'?s have a chat|lets have a chat|do you feel like chatting|would you like to have a chat)$/.test(tollerante)) {
    return inglese
      ? "Absolutely! 😊 I'd be happy to chat. Is there something on your mind, or shall we pick a topic together?"
      : "Volentieri! 😊 Possiamo fare due chiacchiere con calma. C'è qualcosa che ti passa per la testa, oppure scegliamo un argomento al volo?";
  }
  if (/(ti va|ti andrebbe|vuoi|facciamo|possiamo|ho voglia|mi va|parliamo|due) /.test(q) &&
      (parole.some((p) => p === "chiacchiere" || (p.length >= 6 && distanzaRelazionale(p, "chiacchiere") <= 1)) ||
       parole.some((p) => ["talk", "chat", "speak"].includes(p)))) {
    return inglese
      ? "Absolutely! 😊 I'd be happy to chat. Is there something on your mind, or shall we pick a topic together?"
      : "Volentieri! 😊 Possiamo fare due chiacchiere con calma. C'è qualcosa che ti passa per la testa, oppure scegliamo un argomento al volo?";
  }
  if (/^(?:(?:ciao|salve|buongiorno|buonasera)(?: pino)? |(?:hi|hello|hey)(?: pino)? )?(come stai|come va|tutto bene|come te la passi|how are you|how are you doing|how are things|how's it going|how is it going|are you doing well|are you okay)$/.test(q)) {
    return inglese
      ? "I'm doing well, thanks for asking! I don't have feelings or days like a person does, but I'm here and ready to help. How are you?"
      : "Tutto bene, grazie! Non ho giornate o stati d'animo come una persona, ma sono qui, attento alla conversazione e pronto a darti una mano. Tu come stai?";
  }
  if (/^(grazie|grazie pino|ti ringrazio|molte grazie|thanks|thank you|thanks pino|thank you pino)$/.test(q)) {
    return inglese ? "You're welcome! 😊 I'm here whenever you need a hand." : "Di nulla! 😊 Quando vuoi, riprendiamo da qui. Se hai un'altra idea o vuoi approfondire qualcosa, ci sono.";
  }
  if (/^(scusa|scusami|sorry|i am sorry|my apologies)$/.test(q)) {
    return inglese ? "No worries at all. Go ahead — I'm listening." : "Ma figurati, non c'è problema. Dimmi pure, ti seguo.";
  }
  if (/^(bravo|bravo pino|sei bravo|sei forte|ottimo lavoro|well done|good job|you are smart|you're smart)$/.test(q)) {
    return inglese
      ? "Thanks! My aim is to make things easier: understand what you need and help you find a useful, reliable answer."
      : "Grazie! Il mio obiettivo è renderti le cose più semplici: capire cosa ti serve e aiutarti a trovare una risposta concreta.";
  }
  if (/^(non hai capito|non mi hai capito|non e quello che ho chiesto|non e questo che intendevo|hai capito male|non funziona|sei inutile|you misunderstood|you misunderstood me|that is not what i asked|you got it wrong)$/.test(q)) {
    return inglese
      ? "You're right to call that out — I may have misunderstood. Let's get back on track: tell me what I got wrong and I'll correct it, using the context already in our conversation."
      : "Hai ragione a fermarmi: probabilmente ho interpretato male quello che intendevi. Ripartiamo dal punto giusto: dimmi quale parte ho frainteso e correggo il tiro, senza farti ripetere tutto da capo se il contesto è già qui.";
  }
  if (/^(arrivederci|a presto|ci vediamo|buona giornata|buona serata|bye|goodbye|see you|see you soon|see you later|have a good day|have a nice day)$/.test(q)) {
    return inglese
      ? "See you soon! We can pick up right where we left off. Have a great day! 👋"
      : "A presto! Quando torni, riprendiamo da dove abbiamo lasciato. Buona giornata! 👋";
  }
  if (/^(sei cosciente|hai coscienza|hai sentimenti|provi emozioni|sei vivo|are you conscious|do you have feelings|are you alive)$/.test(q)) {
    return inglese
      ? "No, I don't have consciousness or feelings — I'm an AI. But I can keep a consistent conversational style, follow the thread, and respond thoughtfully."
      : "No, non ho coscienza né sentimenti: sono un'intelligenza artificiale. Posso però mantenere un carattere riconoscibile, seguire il filo del dialogo e risponderti con attenzione e coerenza.";
  }
  if (/^(raccontami una barzelletta|dimmi una battuta|tell me a joke|make me laugh)$/.test(q)) {
    return inglese
      ? "Sure! Why did the computer go to the doctor? It caught a virus and didn't want to spread it across the network! 😄"
      : "Volentieri! Perché il computer è andato dal medico? Perché aveva un virus… e non voleva contagiare tutta la rete! 😄";
  }
  return null;
}
