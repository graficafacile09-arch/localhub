/** Contratti condivisi della gestione pagamenti Stripe e PayPal Multiparty. */

export type ProviderPagamento = "stripe" | "paypal";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "expired"
  | "canceled"
  | "refunded"
  | "partially_refunded";

/** Configurazione platform-level PayPal: server-side, mai serializzata al client. */
export interface PaypalPlatformConfig {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  webhookId: string | null;
  testMode: boolean;
}

/** Seller PayPal letto server-side da public.negozio_pagamenti. */
export interface PaypalSellerContext {
  merchantId: string;
  onboardingStatus: "not_started" | "pending" | "complete" | "restricted";
  paymentsReceivable: boolean;
  primaryEmailConfirmed: boolean;
  testMode: boolean;
}

/** Readiness B4: tutte le condizioni devono essere vere. */
export function paypalSellerPronto(seller: PaypalSellerContext): boolean {
  return (
    seller.merchantId.trim().length > 0 &&
    seller.onboardingStatus === "complete" &&
    seller.paymentsReceivable === true &&
    seller.primaryEmailConfirmed === true
  );
}

/** Credenziali/configurazione risolte esclusivamente server-side. */
export interface CredenzialiGateway {
  clientId?: string;
  secret?: string;
  webhookSecret?: string;
  /** Account Stripe Connect del venditore. */
  stripeAccountId?: string;
  /** Configurazione platform-level PayPal, mai esposta al client. */
  paypal?: PaypalPlatformConfig;
  /** Seller PayPal risolto dal DB, mai fornito dal browser. */
  paypalSeller?: PaypalSellerContext;
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
  /** carta | klarna | bonifico_istantaneo | paypal. */
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

/** Dati stabili dell'operazione passati al gateway prima della chiamata HTTP. */
export interface GatewayOperationContext {
  /** PayPal-Request-Id; Stripe lo ignora per compatibilità. */
  idempotencyKey?: string;
  /** Seller risolto server-side; mai un valore proveniente dal browser. */
  seller?: PaypalSellerContext;
  /** Snapshot già calcolato dall'ordine; non viene ricalcolato dal gateway. */
  platformFee?: number;
}

export type RefundRequestOptions = GatewayOperationContext & {
  idempotencyKey: string;
  operationId: string;
};

export interface PaymentGateway {
  provider: ProviderPagamento;

  creaSessione(
    ctx: ContestoCheckout,
    cred: CredenzialiGateway,
    operation?: GatewayOperationContext
  ): Promise<{ paymentId: string; redirectUrl: string; expiresAt?: Date }>;

  verificaFirma(
    rawBody: string,
    headers: Headers,
    cred: CredenzialiGateway
  ): Promise<{ eventId: string; eventType: string; paymentId: string } | null>;

  statoPagamento(
    paymentId: string,
    cred: CredenzialiGateway,
    operation?: GatewayOperationContext
  ): Promise<PaymentStatus>;

  cattura(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway,
    operation?: GatewayOperationContext
  ): Promise<{ transactionId: string }>;

  /** Cancel semantico del provider; non implica expire Checkout Stripe. */
  annulla(
    paymentId: string,
    cred: CredenzialiGateway,
    operation?: GatewayOperationContext
  ): Promise<void>;

  rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway,
    options?: RefundRequestOptions
  ): Promise<{ refundId: string }>;
}
