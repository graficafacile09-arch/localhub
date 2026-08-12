/**
 * PAGAMENTI — REGISTRY DEI GATEWAY (generalizzazione provider).
 *
 * Unico punto dell'app che conosce la mappa provider → implementazione di
 * `PaymentGateway`. L'orchestrazione (sessioni.ts) e le future route
 * usano SOLO questo registry, mai un import diretto di un gateway
 * specifico (contratto già dichiarato in lib/pagamenti/types.ts).
 *
 * Provider ammessi dall'architettura: stripe, klarna, scalapay, paypal.
 * Implementati: stripe e klarna. scalapay/paypal sono ammessi dal registry
 * ma senza factory (→ `getGatewayProvider` ritorna null, fail-closed)
 * finché non arriveranno i rispettivi gateway.
 */

import { GatewayKlarna, type GatewayKlarnaOptions } from "./gateway-klarna";
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

/**
 * Opzioni runtime per l'istanziazione di un gateway (SOLO TEST: consente di
 * puntare al server mock del provider — host/port/protocol per Stripe SDK,
 * baseUrl per il gateway HTTP Klarna).
 */
export type GatewayRuntimeOptions = GatewayStripeOptions | GatewayKlarnaOptions;

type GatewayFactory = (opts?: GatewayRuntimeOptions) => PaymentGateway;

/**
 * Factory per provider: `null` = provider ammesso ma NON ancora implementato
 * (Scalapay, PayPal arriveranno come gateway dedicati in fase successiva).
 * `opts` inoltrato al gateway (server mock, solo test — pattern F1/F2.3).
 */
const FACTORY_GATEWAY: Readonly<Record<string, GatewayFactory | null>> = {
  stripe: (opts) => new GatewayStripe(opts as GatewayStripeOptions),
  klarna: (opts) => new GatewayKlarna(opts as GatewayKlarnaOptions),
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
  opts?: GatewayRuntimeOptions
): PaymentGateway | null {
  const factory = FACTORY_GATEWAY[provider];
  return factory ? factory(opts) : null;
}
