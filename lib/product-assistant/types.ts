// ─── Stato/condizione del prodotto ────────────────────────────────────────────
export type ProductCondition = "nuovo" | "usato" | "ricondizionato";

// ─── Suggerimento restituito dall'AI dopo l'analisi dell'immagine ──────────────
export type ProductVisionSuggestion = {
  nome: string;
  descrizione: string;
  categoria: string;
  sottocategoria: string | null;
  marca: string | null;
  colore: string | null;
  materiale: string | null;
  paroleChiave: string[];
  prezzoSuggerito: number | null;
  statoCondizione: ProductCondition;
  quantitaSuggerita: number;
  /** Livello di confidenza del riconoscimento, da 0 a 100 */
  confidenza: number;
  /** URL immagine principale se restituita dal provider (opzionale) */
  immaginePrincipale: string | null;
};

// ─── Risposta completa dell'API vision (include il flag lowConfidence) ─────────
export type VisionApiResponse = {
  success: true;
  suggestion: ProductVisionSuggestion;
  /** true se confidenza < 60 — il frontend deve mostrare un avviso */
  lowConfidence: boolean;
};

// ─── Immagine passata al provider (predisposta per immagini multiple) ──────────
export type VisionImage = {
  buffer: Buffer;
  filename: string;
  /** Ruolo dell'immagine nel prodotto */
  role: "primary" | "gallery" | "detail";
};

// ─── Contesto opzionale passato al provider per migliorare il prompt ──────────
export type VisionContext = {
  negozioNome?: string;
  negozioCategoria?: string;
};
