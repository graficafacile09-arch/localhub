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
