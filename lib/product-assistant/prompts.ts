import type { VisionContext } from "./types";

/**
 * Costruisce il prompt da inviare al modello di Computer Vision.
 *
 * Centralizzato qui: per migliorare il riconoscimento basta modificare
 * questa funzione senza toccare nessun provider.
 */
export function buildVisionPrompt(context?: VisionContext): string {
  const contestoNegozio = context?.negozioNome
    ? `Il negozio si chiama "${context.negozioNome}"${context.negozioCategoria ? ` e appartiene alla categoria "${context.negozioCategoria}"` : ""}.`
    : "";

  return `Sei un assistente AI specializzato nel riconoscimento di prodotti commerciali da fotografie.
${contestoNegozio ? `\n${contestoNegozio}\n` : ""}
Analizza l'immagine del prodotto e restituisci ESCLUSIVAMENTE un oggetto JSON valido, senza testo aggiuntivo, senza markdown, senza spiegazioni.

Il JSON deve avere esattamente questa struttura:

{
  "nome": "Nome commerciale del prodotto (massimo 80 caratteri)",
  "descrizione": "Descrizione commerciale professionale adatta ad un e-commerce (100-200 caratteri)",
  "categoria": "Categoria principale del prodotto (es: Abbigliamento, Elettronica, Casa, Sport, Beauty, Alimentari, ecc.)",
  "sottocategoria": "Sottocategoria più specifica o null se non determinabile",
  "marca": "Marca o produttore se visibile/riconoscibile, altrimenti null",
  "colore": "Colore principale del prodotto o null se non applicabile",
  "materiale": "Materiale principale (es: cotone, plastica, acciaio) o null se non visibile",
  "parole_chiave": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "prezzo_suggerito": numero indicativo in euro (senza simbolo) o null se non stimabile,
  "stato_condizione": "nuovo" oppure "usato" oppure "ricondizionato",
  "quantita_suggerita": 1,
  "confidenza": numero intero da 0 a 100 che indica quanto sei sicuro del riconoscimento
}

Regole obbligatorie:
- Rispondi SOLO con il JSON, nessun altro testo
- "confidenza" deve riflettere onestamente la certezza: se l'immagine è sfocata, parziale o ambigua, usa un valore basso (sotto 60)
- "parole_chiave" deve contenere termini SEO utili per la ricerca del prodotto
- "stato_condizione" è quasi sempre "nuovo" a meno che non si vedano chiari segni di usura
- "quantita_suggerita" è sempre 1 salvo casi evidenti (es. confezione multipla)
- Se un campo non è determinabile, usa null (non stringhe vuote)`;
}
