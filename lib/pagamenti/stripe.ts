/**
 * PAGAMENTI — GATEWAY STRIPE (FASE F1).
 *
 * Implementa l'interfaccia `PaymentGateway` (lib/pagamenti/types.ts) per
 * Stripe Checkout (modalità "payment", cattura automatica). L'unico punto
 * dell'app che conosce l'SDK Stripe.
 *
 * Sicurezza:
 *   - la SECRET key arriva SOLO dalle credenziali decifrate server-side
 *     (lib/pagamenti/config.ts → negozio_pagamenti), mai dal client;
 *   - gli importi usati sono SEMPRE quelli calcolati dal DB (ContestoCheckout
 *     popolato dal server): mai un importo proveniente dal browser;
 *   - la verifica webhook usa il signing secret del negozio (whsec_...).
 */

import Stripe from "stripe";
import type {
  ContestoCheckout,
  CredenzialiGateway,
  PaymentGateway,
  PaymentStatus,
} from "./types";

/** Errore applicativo del gateway (mai esposto al client in chiaro). */
export class PagamentoGatewayError extends Error {
  codice: string;
  constructor(codice: string, messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

/** Durata della sessione Stripe (minimo consentito: 30 minuti). */
const SESSIONE_MINUTI = 30;

/** Opzioni del gateway (solo per TEST: server HTTP locale al posto di api.stripe.com). */
export type GatewayStripeOptions = {
  host?: string;
  port?: number;
  protocol?: "http" | "https";
};

function clientStripe(cred: CredenzialiGateway, opts?: GatewayStripeOptions): Stripe {
  const secret = (cred.secret ?? "").trim();
  if (!secret) {
    throw new PagamentoGatewayError(
      "STRIPE_NON_CONFIGURATO",
      "Stripe non configurato per questo negozio."
    );
  }
  if (!opts?.host) return new Stripe(secret);
  return new Stripe(secret, {
    host: opts.host,
    port: opts.port,
    protocol: opts.protocol ?? "https",
  });
}

/**
 * Verifica la firma di un webhook Stripe e restituisce l'evento decodificato.
 * `null` = firma non valida (da rifiutare con HTTP 400). Funzione esportata
 * separatamente perché la risoluzione multi-negozio prova i signing secret
 * delle configurazioni attive (la firma identifica anche l'account).
 */
export function verificaEventoStripe(
  rawBody: string,
  signature: string,
  webhookSecret: string
): Stripe.Event | null {
  const secret = (webhookSecret ?? "").trim();
  if (!secret || !signature) return null;
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
}

/** Estrae il payment id (sessione) da un evento Stripe, se presente. */
export function paymentIdDaEvento(event: Stripe.Event): string {
  const obj = event.data?.object as
    | { id?: string }
    | undefined;
  return typeof obj?.id === "string" ? obj.id : "";
}

/** Crea il client Stripe e una Checkout Session per l'ordine. */
export class GatewayStripe implements PaymentGateway {
  provider = "stripe" as const;

  private opts: GatewayStripeOptions;

  /** `opts` consente di puntare a un server mock (solo test). */
  constructor(opts?: GatewayStripeOptions) {
    this.opts = opts ?? {};
  }

  async creaSessione(
    ctx: ContestoCheckout,
    cred: CredenzialiGateway
  ): Promise<{ paymentId: string; redirectUrl: string; expiresAt?: Date }> {
    const stripe = clientStripe(cred, this.opts);

    const importo = Number(ctx.importo);
    if (!Number.isFinite(importo) || importo <= 0) {
      throw new PagamentoGatewayError("IMPORTO_NON_VALIDO", "Importo dell'ordine non valido.");
    }

    const expiresAt = new Date(Date.now() + SESSIONE_MINUTI * 60_000);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // L'importo è SEMPRE quello calcolato dal DB (ordine.totale): il client
      // non ha alcun controllo su prezzo/totale/spedizione.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: ctx.valuta.toLowerCase() || "eur",
            unit_amount: Math.round(importo * 100),
            product_data: {
              name: `Ordine ${ctx.numeroOrdine}`,
              description: `Ordine InCittà ${ctx.numeroOrdine} presso il negozio.`,
            },
          },
        },
      ],
      success_url: `${ctx.returnUrl}${ctx.returnUrl.includes("?") ? "&" : "?"}esito=ok`,
      cancel_url: `${ctx.cancelUrl}${ctx.cancelUrl.includes("?") ? "&" : "?"}esito=annullato`,
      client_reference_id: ctx.ordineId,
      metadata: {
        ordine_id: ctx.ordineId,
        negozio_id: ctx.negozioId,
        numero: ctx.numeroOrdine,
      },
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      // Tassonomia obbligatoria per Stripe: attività commerciale locale.
      payment_intent_data: {
        description: `Ordine ${ctx.numeroOrdine} — ${ctx.negozioId}`,
      },
    });

    if (!session.url) {
      throw new PagamentoGatewayError(
        "SESSIONE_SENZA_URL",
        "Stripe non ha restituito un URL di pagamento."
      );
    }

    return {
      paymentId: session.id,
      redirectUrl: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : expiresAt,
    };
  }

  async verificaFirma(
    rawBody: string,
    headers: Headers,
    cred: CredenzialiGateway
  ): Promise<{ eventId: string; eventType: string; paymentId: string } | null> {
    const signature = headers.get("stripe-signature");
    if (!signature) return null;
    const event = verificaEventoStripe(rawBody, signature, cred.webhookSecret ?? "");
    if (!event) return null;
    return {
      eventId: event.id,
      eventType: event.type,
      paymentId: paymentIdDaEvento(event),
    };
  }

  async statoPagamento(paymentId: string, cred: CredenzialiGateway): Promise<PaymentStatus> {
    const stripe = clientStripe(cred, this.opts);
    const session = await stripe.checkout.sessions.retrieve(paymentId);
    if (session.status === "expired") return "expired";
    if (session.status === "complete" && session.payment_status === "paid") return "paid";
    return "pending";
  }

  /** Cattura: con Checkout "payment" la cattura è automatica → no-op. */
  async cattura(
    paymentId: string,
    _importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ transactionId: string }> {
    const stripe = clientStripe(cred, this.opts);
    const session = await stripe.checkout.sessions.retrieve(paymentId);
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    return { transactionId: paymentIntent ?? paymentId };
  }

  /** Annulla: scade la sessione Checkout non ancora completata. */
  async annulla(paymentId: string, cred: CredenzialiGateway): Promise<void> {
    const stripe = clientStripe(cred, this.opts);
    await stripe.checkout.sessions.expire(paymentId);
  }

  /** Rimborso totale (importo undefined) o parziale sull'ordine. */
  async rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ refundId: string }> {
    const stripe = clientStripe(cred, this.opts);
    const session = await stripe.checkout.sessions.retrieve(paymentId);
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntent) {
      throw new PagamentoGatewayError(
        "RIMBORSO_NON_POSSIBILE",
        "Nessun payment intent associato alla sessione."
      );
    }
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent,
      amount: importo !== undefined && Number(importo) > 0 ? Math.round(Number(importo) * 100) : undefined,
    });
    return { refundId: refund.id };
  }
}
