/** Registry unico del gateway Stripe. */

import { GatewayStripe, type GatewayStripeOptions } from "./stripe";
import type { PaymentGateway } from "./types";

export const PROVIDER_GATEWAY_AMMESSI = ["stripe"] as const;
export type ProviderGatewayAmmesso = (typeof PROVIDER_GATEWAY_AMMESSI)[number];

export function isProviderGatewayAmmesso(value: unknown): value is ProviderGatewayAmmesso {
  return typeof value === "string" && value === "stripe";
}

export type GatewayRuntimeOptions = GatewayStripeOptions;

type GatewayFactory = (opts?: GatewayRuntimeOptions) => PaymentGateway;

const FACTORY_GATEWAY: Readonly<Record<string, GatewayFactory | null>> = {
  stripe: (opts) => new GatewayStripe(opts as GatewayStripeOptions),
};

/** Metodo di pagamento → provider gateway (fail-closed). */
export function providerDaMetodoPagamento(metodo: string | undefined | null): string | null {
  if (metodo === "carta" || metodo === "klarna" || metodo === "bonifico_istantaneo") {
    return "stripe";
  }
  return null;
}

export function providerGatewayImplementato(provider: string): boolean {
  return provider === "stripe";
}

export function getGatewayProvider(
  provider: string,
  opts?: GatewayRuntimeOptions
): PaymentGateway | null {
  const factory = FACTORY_GATEWAY[provider];
  return factory ? factory(opts) : null;
}
