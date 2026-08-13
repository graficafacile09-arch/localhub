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

/**
 * Costruisce i line_item della Checkout Session (FASE F2.3).
 * Quando il contesto porta le RIGHE dell'ordine (snapshot del DB, mai dal
 * client), crea UN line_item per riga con prezzo unitario e quantità dalla
 * riga DB (la variante è inclusa nel nome); aggiunge il costo spedizione
 * come line item dedicato, così il totale della sessione coincide con
 * ordine.totale (calcolato dal DB alla creazione). Senza righe → fallback
 * legacy: line item unico pari al totale (usato dai test gateway esistenti
 * e difesa in profondità per ordini senza righe caricate).
 */
function costruisciLineItems(
  ctx: ContestoCheckout
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const valuta = ctx.valuta.toLowerCase() || "eur";

  if (Array.isArray(ctx.righe) && ctx.righe.length > 0) {
    const items: Stripe.Checkout.SessionCreateParams.LineItem[] = ctx.righe.map((riga) => ({
      quantity: riga.quantita,
      price_data: {
        currency: valuta,
        unit_amount: Math.round(riga.prezzoUnitario * 100),
        product_data: {
          name: riga.variante ? `${riga.nome} — ${riga.variante}` : riga.nome,
          description: `Ordine InCittà ${ctx.numeroOrdine}`,
        },
      },
    }));

    const spedizione = Number(ctx.costoSpedizione ?? 0);
    if (spedizione > 0) {
      items.push({
        quantity: 1,
        price_data: {
          currency: valuta,
          unit_amount: Math.round(spedizione * 100),
          product_data: {
            name: "Spedizione",
            description: `Consegna per l'ordine InCittà ${ctx.numeroOrdine}`,
          },
        },
      });
    }
    return items;
  }

  // Fallback legacy: line item unico pari al totale (comportamento F1).
  return [
    {
      quantity: 1,
      price_data: {
        currency: valuta,
        unit_amount: Math.round(Number(ctx.importo) * 100),
        product_data: {
          name: `Ordine ${ctx.numeroOrdine}`,
          description: `Ordine InCittà ${ctx.numeroOrdine} presso il negozio.`,
        },
      },
    },
  ];
}

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
  // Stripe Connect: la piattaforma usa la PROPRIA secret key e inoltra ogni
  // richiesta con l'header `Stripe-Account` (vedi richiestaPer). MAI la
  // secret key del merchant (non viene nemmeno salvata).
  const secret = cred.stripeAccountId
    ? (process.env.STRIPE_SECRET_KEY ?? "").trim()
    : (cred.secret ?? "").trim();
  if (!secret) {
    throw new PagamentoGatewayError(
      cred.stripeAccountId ? "STRIPE_PLATFORM_NON_CONFIGURATA" : "STRIPE_NON_CONFIGURATO",
      cred.stripeAccountId
        ? "Stripe Connect non configurato a livello di piattaforma."
        : "Stripe non configurato per questo negozio."
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
 * Opzioni di richiesta per account Connect: quando è presente un account
 * collegato, ogni chiamata viene eseguita `on behalf of` quell'account
 * (header `Stripe-Account`). undefined = integrazione direct (legacy).
 */
function richiestaPer(cred: CredenzialiGateway): { stripeAccount?: string } | undefined {
  return cred.stripeAccountId ? { stripeAccount: cred.stripeAccountId } : undefined;
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
      // Dynamic Payment Methods: omettendo `payment_method_types`, Stripe
      // Checkout mostra i metodi abilitati nel Dashboard (carta di default)
      // più i wallet Apple Pay / Google Pay quando disponibili e configurati.
      // FASE F2.3 — un line_item per riga (prezzo/quantità dagli snapshot
      // del DB via ContestoCheckout.righe): il client non ha alcun controllo
      // su prezzi, quantità, totale o spedizione. Senza righe nel contesto
      // resta il fallback legacy (line item unico sul totale del DB).
      line_items: costruisciLineItems(ctx),
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
    }, richiestaPer(cred));

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
    const session = await stripe.checkout.sessions.retrieve(paymentId, undefined, richiestaPer(cred));
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
    const session = await stripe.checkout.sessions.retrieve(paymentId, undefined, richiestaPer(cred));
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    return { transactionId: paymentIntent ?? paymentId };
  }

  /** Annulla: scade la sessione Checkout non ancora completata. */
  async annulla(paymentId: string, cred: CredenzialiGateway): Promise<void> {
    const stripe = clientStripe(cred, this.opts);
    await stripe.checkout.sessions.expire(paymentId, undefined, richiestaPer(cred));
  }

  /** Rimborso totale (importo undefined) o parziale sull'ordine. */
  async rimborsa(
    paymentId: string,
    importo: number | undefined,
    cred: CredenzialiGateway
  ): Promise<{ refundId: string }> {
    const stripe = clientStripe(cred, this.opts);
    const session = await stripe.checkout.sessions.retrieve(paymentId, undefined, richiestaPer(cred));
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
    }, richiestaPer(cred));
    return { refundId: refund.id };
  }
}
