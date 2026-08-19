/**
 * PAGAMENTI — TIPI CONDIVISI (Fase 1 Foundation).
 *
 * Solo tipi e interfacce: nessuna implementazione di provider in questa
 * fase. Lo strato lib/pagamenti/ è l'UNICO punto dell'app che conosce i
 * provider (Klarna, Scalapay, PayPal, Stripe): il resto del progetto usa
 * solo questi tipi e il registry (fase successiva).
 */

/** Provider di pagamento supportati dall'architettura. */
export type ProviderPagamento = "klarna" | "scalapay" | "paypal" | "stripe";

/**
 * Stato del pagamento di un ordine (separato dallo stato logistico).
 * Le transizioni consentite sono formalizzate in lib/pagamenti/stati.ts
 * (e successivamente specchiate in una RPC PostgreSQL).
 */
export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "expired"
  | "canceled"
  | "refunded"
  | "partially_refunded";

/**
 * Credenziali di un account pagamento del negozio, risolte SOLO
 * server-side (mai dal browser). `secret` non viene mai letto/restituito
 * da API: è write-only (configurazione) + decifrato in RPC service-role.
 */
export interface CredenzialiGateway {
  clientId?: string;
  secret?: string;
  /** Webhook signing secret del negozio (FASE F1: verifica firma Stripe). */
  webhookSecret?: string;
  /**
   * ID dell'account Stripe Connect collegato (stripe_user_id, `acct_…`).
   * Quando presente il gateway usa la secret key DELLA PIATTAFORMA
   * (STRIPE_SECRET_KEY) e inoltra ogni richiesta con l'header
   * `Stripe-Account` (pattern Connect). Nessun token/secret del merchant.
   */
  stripeAccountId?: string;
  testMode: boolean;
}

/**
 * Riga dell'ordine da includere nella sessione (FASE F2.3).
 * Tutti i valori provengono dagli SNAPSHOT del DB (ordini_righe), mai dal
 * client: il gateway li usa per costruire un line_item Stripe per riga.
 */
export interface RigaCheckout {
  /** Nome prodotto dallo snapshot DB (ordini_righe.nome_prodotto). */
  nome: string;
  /** Quantità dalla riga DB. */
  quantita: number;
  /** Prezzo unitario in euro dal DB (ordini_righe.prezzo_unitario). */
  prezzoUnitario: number;
  /** Variante (ordini_righe.variante_nome): inclusa nel nome quando presente. */
  variante?: string | null;
}

/** Contesto di checkout necessario a creare una sessione di pagamento. */
export interface ContestoCheckout {
  ordineId: string;
  negozioId: string;
  numeroOrdine: string;
  importo: number;
  valuta: string;
  metodo: string;
  returnUrl: string;
  cancelUrl: string;
  /**
   * Righe dell'ordine (FASE F2.3): quando presente, il gateway crea UN
   * line_item Stripe per riga (quantità e prezzo unitario dal DB). Assente
   * → comportamento legacy (line item unico sul totale, difesa in profondità).
   */
  righe?: RigaCheckout[];
  /**
   * Costo spedizione (una sola volta per ordine, FASE F2.3): aggiunto come
   * line item dedicato così il totale sessione coincide con ordine.totale.
   */
  costoSpedizione?: number;
  /**
   * Commissione piattaforma SNAPSHOT dell'ordine (ordini.commissione_importo),
   * letta dal DB server-side. Usata SOLO per Stripe Connect: impostata come
   * application_fee_amount (in centesimi) quando il negozio ha un connected
   * account. Mai calcolata/ricevuta dal client.
   */
  commissioneImporto?: number;
  /**
   * Dati del consumatore per i gateway che li richiedono (Scalapay).
   * Letti dallo snapshot DB dell'ordine (cliente_nome/cognome/email/telefono),
   * mai dal browser. Assenti → il gateway Scalapay rifiuta fail-closed.
   */
  consumer?: {
    nome: string;
    cognome: string;
    email: string | null;
    telefono: string | null;
  };
}

/**
 * Interfaccia comune di un provider di pagamento.
 * Ogni gateway (gateway-klarna.ts, gateway-scalapay.ts, ...) implementa
 * QUESTA interfaccia: l'app orchestrale usa solo `PaymentGateway` e il
 * registry, senza mai importare implementazioni specifiche.
 * NOTA: nessuna implementazione in questa fase — l'interfaccia è il
 * contratto per le fasi successive.
 */
export interface PaymentGateway {
  provider: ProviderPagamento;

  /** Crea la sessione/ordine presso il provider e restituisce il redirect. */
  creaSessione(
    ctx: ContestoCheckout,
    cred: CredenzialiGateway
  ): Promise<{ paymentId: string; redirectUrl: string; expiresAt?: Date }>;

  /**
   * Verifica la firma del webhook e restituisce l'identità dell'evento.
   * `null` = firma non valida (da rifiutare).
   */
  verificaFirma(
    rawBody: string,
    headers: Headers,
    cred: CredenzialiGateway
  ): Promise<{ eventId: string; eventType: string; paymentId: string } | null>;

  /** Stato del pagamento letto dal provider (fallback di riconciliazione). */
  statoPagamento(paymentId: string, cred: CredenzialiGateway): Promise<PaymentStatus>;

  /** Cattura un'autorizzazione (auth → paid). */
  cattura(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ transactionId: string }>;

  /** Annulla un pagamento non ancora catturato. */
  annulla(paymentId: string, cred: CredenzialiGateway): Promise<void>;

  /** Rimborso totale (importo undefined) o parziale. */
  rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ refundId: string }>;
}

