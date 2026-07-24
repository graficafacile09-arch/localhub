import type { VisionContext } from "./types";

export function buildVisionPrompt(context?: VisionContext): string {
  const contesto = context?.negozioNome
    ? ` Negozio: ${context.negozioNome}.`
    : "";

  return `Riconosci il prodotto nella foto. Restituisci SOLO JSON senza spiegazioni:
{
  "nome": "nome prodotto (max 80 caratteri)",
  "categoria": "categoria merceologica (es: Alimentari, Abbigliamento, Beauty, Casa, Elettronica, Sport)",
  "marca": "marca o null se non riconoscibile",
  "prezzo_suggerito": prezzo in euro o null,
  "descrizione": "descrivi in max 25 parole",
  "confidenza": 0-100
}
Regole: non inventare. confidenza onesta.${contesto}`;
}
