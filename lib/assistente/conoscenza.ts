import { FAQ_CATEGORIES } from "@/lib/faq-data";
import { normalizzaRichiesta } from "./local-intents";

export function cercaConoscenzaPino(query: string): { titolo: string; risposta: string; url: string } | null {
  const q = normalizzaRichiesta(query ?? "").trim();
  if (!q) return null;
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  let best: { titolo: string; risposta: string; score: number } | null = null;
  for (const categoria of FAQ_CATEGORIES) for (const item of categoria.domande) {
    const titolo = normalizzaRichiesta(item.domanda);
    const testo = normalizzaRichiesta(item.domanda + " " + item.risposta + " " + categoria.titolo);
    let score = titolo.includes(q) ? 12 : 0;
    for (const token of tokens) if (titolo.includes(token)) score += 5; else if (testo.includes(token)) score += 1;
    if (!best || score > best.score) best = { titolo: item.domanda, risposta: item.risposta, score };
  }
  if (!best || best.score < (tokens.length <= 1 ? 10 : 9)) return null;
  return { titolo: best.titolo, risposta: best.risposta + "\n\nApprofondisci: [FAQ](/faq).", url: "/faq" };
}
