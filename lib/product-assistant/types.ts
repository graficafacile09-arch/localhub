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

  // ─── Nuovi campi AI arricchiti ─────────────────────────────────────────────

  /**
   * Descrizione commerciale completa e dettagliata (300-800 caratteri),
   * adatta alla scheda prodotto del catalogo.
   */
  descrizioneCompleta: string | null;

  /** Caratteristiche principali del prodotto (bullet point) */
  caratteristiche: string[];

  /**
   * Peso o volume se leggibile dall'immagine/etichetta.
   * Esempi: "500g", "1.5L", "10x15cm", null se non determinabile.
   */
  pesoVolume: string | null;

  /** Titolo SEO ottimizzato per i motori di ricerca (max 60 caratteri) */
  seoTitle: string | null;

  /** Meta description SEO (max 160 caratteri) */
  seoDescription: string | null;

  /** Testo alternativo dell'immagine per accessibilità e SEO */
  altTextImmagine: string | null;

  /**
   * Attributi chiave per il filtro del catalogo.
   * Esempio: { "taglia": "M", "stagione": "estate", "tipo_tessuto": "cotone biologico" }
   */
  filtriCatalogo: Record<string, string> | null;

  // ─── Nuovi campi da etichetta ───────────────────────────────────────────────

  /** Formato o quantità esatta (es: "250ml", "500g", "1L") */
  formato: string | null;

  /** Tipo di confezione (es: "bottiglia vetro", "lattina alluminio", "scatola cartone") */
  tipoConfezione: string | null;

  /** Codice EAN-13 a 13 cifre se leggibile */
  codiceEan: string | null;

  /** Nome del produttore/fabbricante se leggibile */
  produttore: string | null;

  /** Lista ingredienti se leggibili sull'etichetta */
  ingredienti: string[];

  /** Lista allergeni se leggibili sull'etichetta */
  allergeni: string[];
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
