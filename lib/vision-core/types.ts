// Tipo locale del core: nessuna dipendenza da lib/product-assistant.
// La struttura è identica a ProductVisionSuggestion del percorso venditori,
// così il core può essere riusato da RadiciScan senza accoppiamenti.

export type VisionCondition = "nuovo" | "usato" | "ricondizionato";

export type VisionSuggestion = {
  nome: string;
  descrizione: string;
  categoria: string;
  sottocategoria: string | null;
  marca: string | null;
  colore: string | null;
  materiale: string | null;
  paroleChiave: string[];
  prezzoSuggerito: number | null;
  statoCondizione: VisionCondition;
  quantitaSuggerita: number;
  confidenza: number;
  immaginePrincipale: string | null;
  descrizioneCompleta: string | null;
  caratteristiche: string[];
  pesoVolume: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  altTextImmagine: string | null;
  filtriCatalogo: Record<string, string> | null;
  formato: string | null;
  tipoConfezione: string | null;
  codiceEan: string | null;
  produttore: string | null;
  ingredienti: string[];
  allergeni: string[];
};

export type VisionPromptContext = {
  negozioNome?: string;
  negozioCategoria?: string;
};
