/**
 * Identità stabile di Pino, assistente AI di InCittà.online.
 * Le domande dirette sull'identità ricevono una risposta deterministica,
 * senza passare dal planner o avviare ricerche nel catalogo.
 */
export function rispostaIdentitaPino(messaggio: string): string | null {
  const testo = messaggio
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase();

  const domandaIdentita =
    /\b(chi sei|cosa sei|come ti chiami|qual e il tuo nome|il tuo nome|sei un ai|sei una ai|sei un'intelligenza artificiale|chi e pino|who are you|what are you|what is your name|what's your name|whats your name|are you an ai|are you artificial intelligence|who is pino)\b/.test(testo);

  if (!domandaIdentita) return null;

  const inglese =
    /\b(who are you|what are you|what is your name|what's your name|whats your name|are you an ai|are you artificial intelligence|who is pino)\b/.test(testo);

  return inglese
    ? "I'm Pino, InCittà.online's AI assistant for discovering local businesses, products, offers and events. I help you understand what you need, search the local catalog, compare relevant options and stay within your budget. I'm an AI, not a person, and I only present local details that I can verify from the information available to me. What are you looking for?"
    : "Sono Pino, l'assistente AI di InCittà.online. Ti aiuto a scoprire negozi, prodotti, offerte ed eventi del territorio, a capire quali opzioni fanno al caso tuo e a confrontarle anche in base al budget. Sono un'intelligenza artificiale, non una persona: ti presento informazioni locali solo quando posso verificarle nei dati disponibili. Da cosa vuoi partire?";
}
