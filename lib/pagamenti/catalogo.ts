/** Catalogo statico dei metodi di pagamento esposti al checkout. */

export type MetodoPagamento =
  | "carta"
  | "klarna"
  | "paypal"
  | "sepa_debit"
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
    metodo: "paypal",
    etichetta: "PayPal",
    nomeBreve: "PayPal",
    descrizione: "Paga con PayPal tramite Stripe Checkout, se disponibile.",
    provider: "stripe",
    richiedeGateway: true,
  },
  {
    metodo: "sepa_debit",
    etichetta: "SEPA Direct Debit",
    nomeBreve: "SEPA",
    descrizione: "Addebito diretto SEPA tramite Stripe Checkout, se disponibile.",
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
] as const;

export function voceCatalogoMetodo(metodo: string): VoceCatalogoMetodo | undefined {
  return CATALOGO_METODI_PAGAMENTO.find((voce) => voce.metodo === metodo);
}

export function isMetodoSupportato(metodo: string): metodo is MetodoPagamento {
  return CATALOGO_METODI_PAGAMENTO.some((voce) => voce.metodo === metodo);
}
