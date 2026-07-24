import type { VisionContext } from "./types";

export function buildVisionPrompt(context?: VisionContext): string {
  return `Riconosci il prodotto nella foto. Rispondi SOLO con JSON, niente altro. Nessun reasoning, nessuna spiegazione, nessun markdown.

{
  "nome": "nome prodotto",
  "categoria": "categoria merceologica",
  "marca": "marca o null",
  "descrizione": "descrizione breve max 200 caratteri",
  "prezzo_suggerito": prezzo in euro o null,
  "confidenza": 0-100
}

Regole: non inventare mai dati. marca e prezzo null se non sicuri. confidenza onesta. Mai usare markdown o testo extra. Solo JSON.`.trim();
}
