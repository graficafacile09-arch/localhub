/** Registry dei provider gateway; PayPal è preparato ma non ancora implementato. */

import { GatewayStripe, type GatewayStripeOptions } from "./stripe";
import type { PaymentGateway } from "./types";

/** Provider conosciuti dall'architettura; non implica che siano pubblicamente attivi. */
export const PROVIDER_CONOSCIUTI = ["stripe", "paypal"] as const;
export type ProviderConosciuto = (typeof PROVIDER_CONOSCIUTI)[number];

/** Gateway realmente dispatchabili in questo blocco: PayPal resta fail-closed. */
export const PROVIDER_GATEWAY_AMMESSI = ["stripe"] as const;
export type ProviderGatewayAmmesso = (typeof PROVIDER_GATEWAY_AMMESSI)[number];

export function isProviderConosciuto(value: unknown): value is ProviderConosciuto {
  return value === "stripe" || value === "paypal";
}

export function isProviderGatewayAmmesso(value: unknown): value is ProviderGatewayAmmesso {
  return value === "stripe";
}

export type GatewayRuntimeOptions = GatewayStripeOptions;

type GatewayFactory = (opts?: GatewayRuntimeOptions) => PaymentGateway;

const FACTORY_GATEWAY: Readonly<Record<string, GatewayFactory | null>> = {
  stripe: (opts) => new GatewayStripe(opts as GatewayStripeOptions),
};

/** Metodo di pagamento → provider gateway. Il mapping pubblico resta invariato altrove. */
export function providerDaMetodoPagamento(metodo: string | undefined | null): string | null {
  if (
    metodo === "carta" ||
    metodo === "klarna" ||
    metodo === "sepa_debit" ||
    metodo === "bonifico_istantaneo"
  ) {
    return "stripe";
  }
  if (metodo === "paypal") return "stripe";
  // Il bonifico diretto al venditore è un pagamento manuale fuori gateway.
  if (metodo === "bonifico_diretto_venditore") return null;
  return null;
}

/** True solo per gateway con runtime effettivamente disponibile in questo blocco. */
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
