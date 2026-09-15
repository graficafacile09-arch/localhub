/** Contratti condivisi della gestione pagamenti Stripe. */

/** Provider gateway unico dell'applicazione. */
export type ProviderPagamento = "stripe";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "expired"
  | "canceled"
  | "refunded"
  | "partially_refunded";

/** Credenziali/configurazione risolte esclusivamente server-side. */
export interface CredenzialiGateway {
  clientId?: string;
  secret?: string;
  webhookSecret?: string;
  /** Account Stripe Connect del venditore. */
  stripeAccountId?: string;
  testMode: boolean;
}

export interface RigaCheckout {
  nome: string;
  quantita: number;
  prezzoUnitario: number;
  variante?: string | null;
}

export interface ContestoCheckout {
  ordineId: string;
  negozioId: string;
  numeroOrdine: string;
  importo: number;
  valuta: string;
  /** carta | klarna | bonifico_istantaneo. */
  metodo: string;
  returnUrl: string;
  cancelUrl: string;
  righe?: RigaCheckout[];
  costoSpedizione?: number;
  /** Snapshot della commissione piattaforma in euro. */
  commissioneImporto?: number;
  consumer?: {
    nome: string;
    cognome: string;
    email: string | null;
    telefono: string | null;
  };
}

export type RefundRequestOptions = {
  idempotencyKey: string;
  operationId: string;
};

export interface PaymentGateway {
  provider: ProviderPagamento;

  creaSessione(
    ctx: ContestoCheckout,
    cred: CredenzialiGateway
  ): Promise<{ paymentId: string; redirectUrl: string; expiresAt?: Date }>;

  verificaFirma(
    rawBody: string,
    headers: Headers,
    cred: CredenzialiGateway
  ): Promise<{ eventId: string; eventType: string; paymentId: string } | null>;

  statoPagamento(paymentId: string, cred: CredenzialiGateway): Promise<PaymentStatus>;

  cattura(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ transactionId: string }>;

  annulla(paymentId: string, cred: CredenzialiGateway): Promise<void>;

  rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway,
    options?: RefundRequestOptions
  ): Promise<{ refundId: string }>;
}
