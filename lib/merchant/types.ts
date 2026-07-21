export type MerchantRole = "owner" | "manager";

export type MerchantStoreSummary = {
  id: string;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  attivo: boolean;
  role: MerchantRole;
};

export type MerchantProduct = {
  id: string;
  negozio_id: string;
  nome: string;
  descrizione: string | null;
  categoria: string | null;
  sottocategoria: string | null;
  marca: string | null;
  colore: string | null;
  materiale: string | null;
  parole_chiave: string[] | null;
  prezzo: number | null;
  prezzo_suggerito: number | null;
  immagine_principale: string | null;
  quantita_disponibile: number | null;
  stato_condizione: "nuovo" | "usato" | "ricondizionato" | null;
  attivo: boolean;
  origine_pubblicazione: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MerchantProductInput = {
  nome: string;
  descrizione: string;
  categoria: string;
  sottocategoria?: string | null;
  marca?: string;
  colore?: string;
  materiale?: string;
  paroleChiave?: string[] | null;
  prezzo: number;
  prezzoSuggerito?: number | null;
  quantitaDisponibile: number | null;
  statoCondizione?: "nuovo" | "usato" | "ricondizionato" | null;
  immaginePrincipale: string;
  attivo: boolean;
  originePubblicazione?: string;
};

export type MerchantQueryResult<T> = {
  data: T;
  setupRequired: boolean;
  errorMessage: string | null;
};
