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
Analizza l'immagine del prodotto.

REGOLA ASSOLUTA: restituisci SOLO un oggetto JSON valido. NIENTE altro.
- NIENTE markdown, niente \`\`\`json, niente \`\`\`
- NIENTE testo prima o dopo il JSON
- NIENTE spiegazioni, commenti, prefazioni, conclusioni
- La risposta deve INIZIARE con { e FINIRE con }
- Se non rispetti questa regola, il sistema si rompe.

Il JSON DEVE avere esattamente questa struttura (copia fedelmente i nomi dei campi in snake_case):

{
  "nome": "Nome commerciale del prodotto (massimo 80 caratteri)",
  "descrizione": "Descrizione commerciale breve adatta alla card del catalogo (100-200 caratteri)",
  "descrizione_completa": "Descrizione commerciale completa e dettagliata, stile scheda prodotto e-commerce (300-800 caratteri). Usa tono persuasivo ma professionale, includi materiali, finiture, usi consigliati.",
  "categoria": "Categoria principale del prodotto (es: Abbigliamento, Elettronica, Casa, Sport, Beauty, Alimentari, ecc.)",
  "sottocategoria": "Sottocategoria più specifica o null se non determinabile (es: Running, Skincare, Divani)",
  "marca": "Marca o produttore se visibile/riconoscibile, altrimenti null",
  "colore": "Colore principale del prodotto o null se non applicabile",
  "materiale": "Materiale principale (es: cotone, plastica, acciaio, pelle) o null se non visibile",
  "caratteristiche": ["caratteristica 1", "caratteristica 2", "caratteristica 3", "caratteristica 4", "caratteristica 5"],
  "peso_volume": "Peso o volume se leggibile dall'etichetta (es: 500g, 1.5L, 10x15cm) o null",
  "parole_chiave": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "filtri_catalogo": {
    "taglia": "valore o null",
    "stagione": "valore o null",
    "genere": "valore o null",
    "tipo_tessuto": "valore o null",
    "certificazione": "valore o null"
  },
  "prezzo_suggerito": numero indicativo in euro (senza simbolo) o null se non stimabile,
  "stato_condizione": "nuovo" oppure "usato" oppure "ricondizionato",
  "quantita_suggerita": 1,
  "confidenza": numero intero da 0 a 100 che indica quanto sei sicuro del riconoscimento,
  "seo_title": "Titolo SEO ottimizzato per Google (max 60 caratteri, includi marca e parola chiave principale) o null",
  "seo_description": "Meta description SEO (max 160 caratteri, attraente con call-to-action) o null",
  "alt_text_immagine": "Testo alternativo dell'immagine per accessibilita e SEO (descrivi cosa si vede nella foto) o null"
}

Regole obbligatorie:
- "confidenza" deve riflettere onestamente la certezza: se l'immagine è sfocata, parziale o ambigua, usa un valore basso (sotto 60)
- "parole_chiave" deve contenere termini SEO utili per la ricerca del prodotto
- "stato_condizione" è quasi sempre "nuovo" a meno che non si vedano chiari segni di usura
- "quantita_suggerita" è sempre 1 salvo casi evidenti (es. confezione multipla)
- "caratteristiche" deve elencare da 3 a 8 punti chiave del prodotto (materiali, funzionalità, dimensioni, usi)
- "filtri_catalogo" deve contenere solo attributi oggettivi e utili per filtraggio, ometti quelli non determinabili
- Se un campo non è determinabile, usa null (non stringhe vuote)
- RICORDA: la risposta DEVE iniziare con { e DEVE finire con }, senza nient'altro prima o dopo.`;
}
