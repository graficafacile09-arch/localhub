/**
 * PAGAMENTI — REGISTRY DEI GATEWAY (generalizzazione provider).
 *
 * Unico punto dell'app che conosce la mappa provider → implementazione di
 * `PaymentGateway`. L'orchestrazione (sessioni.ts) e le future route
 * usano SOLO questo registry, mai un import diretto di un gateway
 * specifico (contratto già dichiarato in lib/pagamenti/types.ts).
 *
 * Provider ammessi dall'architettura: stripe, klarna, scalapay, paypal.
 * In questa fase è implementato SOLO stripe: klarna/scalapay/paypal sono
 * ammessi dal registry ma senza factory (→ `getGatewayProvider` ritorna
 * null, fail-closed) finché non arriveranno i rispettivi gateway.
 */

import { GatewayStripe, type GatewayStripeOptions } from "./stripe";
import type { PaymentGateway } from "./types";

/** Provider di pagamento online ammessi dal registry (in ordine di priorità). */
export const PROVIDER_GATEWAY_AMMESSI = [
  "stripe",
  "klarna",
  "scalapay",
  "paypal",
] as const;

export type ProviderGatewayAmmesso = (typeof PROVIDER_GATEWAY_AMMESSI)[number];

/** True se il provider è ammesso dal registry (implementato o meno). */
export function isProviderGatewayAmmesso(value: unknown): value is ProviderGatewayAmmesso {
  return (
    typeof value === "string" &&
    (PROVIDER_GATEWAY_AMMESSI as readonly string[]).includes(value)
  );
}

type GatewayFactory = (opts?: GatewayStripeOptions) => PaymentGateway;

/**
 * Factory per provider: `null` = provider ammesso ma NON ancora implementato
 * (Klarna, Scalapay, PayPal arriveranno come gateway dedicati in fase
 * successiva; fino ad allora l'unico provider utilizzabile è "stripe").
 * `opts` consente di puntare a un server mock (solo test, pattern F1/F2.3).
 */
const FACTORY_GATEWAY: Readonly<Record<string, GatewayFactory | null>> = {
  stripe: (opts) => new GatewayStripe(opts),
  klarna: null,
  scalapay: null,
  paypal: null,
};

/** True se il provider ha un gateway implementato nel registry. */
export function providerGatewayImplementato(provider: string): boolean {
  return typeof FACTORY_GATEWAY[provider] === "function";
}

/**
 * Istanzia il gateway per il provider (fail-closed: mai lancia).
 * Ritorna null se il provider non è ammesso o non ancora implementato.
 */
export function getGatewayProvider(
  provider: string,
  opts?: GatewayStripeOptions
): PaymentGateway | null {
  const factory = FACTORY_GATEWAY[provider];
  return factory ? factory(opts) : null;
}
