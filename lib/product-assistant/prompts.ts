import type { VisionContext } from "./types";

export function buildVisionPrompt(context?: VisionContext): string {
  const contesto = context?.negozioNome
    ? ` Negozio: ${context.negozioNome}.`
    : "";

  return `Riconosci il prodotto nella foto e descrivi SOLO il prodotto, non la scena.

REGOLE FONDAMENTALI:
- Descrivi ESCLUSIVAMENTE il prodotto, non la fotografia
- Ignora completamente: sfondo, tavolo, superficie, mani, persona, stanza, finestre, monitor accesi, scrivania, scaffali, pavimento
- Per prodotti tecnici (elettronica, informatica): usa linguaggio tecnico con specifiche (modello, processore, display, dimensioni)
- Per prodotti alimentari: descrivi il prodotto (tipo, gusto, formato, ingredienti principali se visibili)
- Per oggetti in generale: parla solo dell'oggetto riconosciuto, delle sue caratteristiche e del suo utilizzo
- Non dire "nella foto" o "nell'immagine" o "si vede"
- Descrivi come se stessi presentando il prodotto in un catalogo e-commerce

Restituisci SOLO JSON senza spiegazioni:
{
  "nome": "nome prodotto (max 80 caratteri)",
  "categoria": "categoria merceologica (es: Alimentari, Abbigliamento, Beauty, Casa, Elettronica, Sport)",
  "marca": "marca o null se non riconoscibile",
  "prezzo_suggerito": prezzo in euro o null,
  "descrizione": "descrizione del prodotto in max 30 parole, orientata al prodotto",
  "confidenza": 0-100
}
Regole: non inventare. confidenza onesta.${contesto}`;
}
