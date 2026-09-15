/** Catalogo statico dei metodi di pagamento esposti al checkout. */

export type MetodoPagamento =
  | "carta"
  | "klarna"
  | "bonifico_istantaneo"
  | "bonifico";

export type VoceCatalogoMetodo = {
  metodo: MetodoPagamento;
  etichetta: string;
  nomeBreve: string;
  descrizione: string;
  provider: "stripe" | null;
  richiedeGateway: boolean;
};

export const CATALOGO_METODI_PAGAMENTO: readonly VoceCatalogoMetodo[] = [
  {
    metodo: "carta",
    etichetta: "Carta di credito/debito",
    nomeBreve: "Carta",
    descrizione: "Pagamento sicuro con Stripe.",
    provider: "stripe",
    richiedeGateway: true,
  },
  {
    metodo: "klarna",
    etichetta: "Klarna",
    nomeBreve: "Klarna",
    descrizione: "Paga in più soluzioni tramite Stripe, se disponibile.",
    provider: "stripe",
    richiedeGateway: true,
  },
  {
    metodo: "bonifico_istantaneo",
    etichetta: "Bonifico istantaneo",
    nomeBreve: "Bonifico istantaneo",
    descrizione: "Paga tramite il tuo conto bancario con Stripe, se disponibile.",
    provider: "stripe",
    richiedeGateway: true,
  },
  {
    metodo: "bonifico",
    etichetta: "Bonifico bancario",
    nomeBreve: "Bonifico",
    descrizione: "Pagamento da concordare direttamente con il negozio.",
    provider: null,
    richiedeGateway: false,
  },
] as const;

export function voceCatalogoMetodo(metodo: string): VoceCatalogoMetodo | undefined {
  return CATALOGO_METODI_PAGAMENTO.find((voce) => voce.metodo === metodo);
}

export function isMetodoSupportato(metodo: string): metodo is MetodoPagamento {
  return CATALOGO_METODI_PAGAMENTO.some((voce) => voce.metodo === metodo);
}
