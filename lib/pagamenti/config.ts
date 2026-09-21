/** Configurazione server-side dei pagamenti del negozio. */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isProviderPagamentoValido } from "./crypto";
import type {
  CredenzialiGateway,
  PaypalPlatformConfig,
  PaypalSellerContext,
} from "./types";
import { paypalSellerPronto } from "./types";

export type ConfigProviderNegozio = {
  negozioId: string;
  provider: string;
  testMode: boolean;
  clientId: string | null;
  secretKey: string;
  webhookSecret: string;
  accountId?: string;
  accountName?: string | null;
};

export type ConfigStripeNegozio = ConfigProviderNegozio;

type EsitoRpcLettura = {
  ok?: boolean;
  presente?: boolean;
  attivo?: boolean;
  test_mode?: boolean;
  client_id?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  secret?: string | null;
  webhook_secret?: string | null;
  codice?: string;
  messaggio?: string;
};

function chiaveCifraturaOrNull(): string | null {
  const key = process.env.PAYMENTS_ENCRYPTION_KEY;
  return key?.trim() || null;
}

/** Configurazione PayPal platform-level, letta esclusivamente server-side. */
export function getConfigPaypalPiattaforma(): PaypalPlatformConfig | null {
  const clientId = (process.env.PAYPAL_PARTNER_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.PAYPAL_PARTNER_SECRET ?? "").trim();
  const apiBaseUrl = (process.env.PAYPAL_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const webhookId = (process.env.PAYPAL_WEBHOOK_ID ?? "").trim() || null;

  if (!clientId || !clientSecret || !apiBaseUrl) return null;
  try {
    const parsed = new URL(apiBaseUrl);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return {
    clientId,
    clientSecret,
    apiBaseUrl,
    webhookId,
    testMode: apiBaseUrl.toLowerCase().includes("sandbox"),
  };
}

export async function getConfigProviderNegozio(
  negozioId: string,
  provider: string
): Promise<ConfigProviderNegozio | null> {
  if (!negozioId || !isProviderPagamentoValido(provider)) return null;

  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db.rpc("pagamenti_credenziali_leggi", {
      p_negozio_id: negozioId,
      p_provider: provider,
      p_decifra: true,
      p_chiave: chiaveCifraturaOrNull(),
    });
    if (error) return null;

    const esito = (data ?? null) as EsitoRpcLettura | null;
    if (!esito || esito.ok !== true || esito.presente !== true || esito.attivo !== true) {
      return null;
    }

    const secretKey = typeof esito.secret === "string" ? esito.secret.trim() : "";
    if (!secretKey) return null;

    return {
      negozioId,
      provider,
      testMode: esito.test_mode !== false,
      clientId: typeof esito.client_id === "string" ? esito.client_id.trim() || null : null,
      secretKey,
      webhookSecret:
        typeof esito.webhook_secret === "string" ? esito.webhook_secret.trim() : "",
      accountId:
        typeof esito.account_id === "string" && esito.account_id.trim()
          ? esito.account_id.trim()
          : undefined,
      accountName:
        typeof esito.account_name === "string" && esito.account_name.trim()
          ? esito.account_name.trim()
          : null,
    };
  } catch {
    return null;
  }
}

export async function getConfigStripeNegozio(
  negozioId: string
): Promise<ConfigStripeNegozio | null> {
  return getConfigProviderNegozio(negozioId, "stripe");
}

export type StatoStripeConnect = {
  accountId: string;
  accountName: string | null;
  testMode: boolean;
  onboardingStatus: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  klarnaEnabled: boolean;
};

export async function getStripeConnectAccount(
  negozioId: string
): Promise<StatoStripeConnect | null> {
  if (!negozioId) return null;
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("negozio_pagamenti")
      .select(
        "account_id, account_name, test_mode, onboarding_status, payouts_enabled, charges_enabled, klarna_enabled"
      )
      .eq("negozio_id", negozioId)
      .eq("provider", "stripe")
      .eq("attivo", true)
      .maybeSingle();
    if (error || !data) return null;

    const accountId = data.account_id ? String(data.account_id).trim() : "";
    if (!accountId) return null;

    return {
      accountId,
      accountName: data.account_name ? String(data.account_name) : null,
      testMode: data.test_mode === true,
      onboardingStatus: data.onboarding_status ? String(data.onboarding_status) : "pending",
      payoutsEnabled: data.payouts_enabled === true,
      chargesEnabled: data.charges_enabled === true,
      klarnaEnabled: data.klarna_enabled === true,
    };
  } catch {
    return null;
  }
}

export type EsitoStripeConnectRelink =
  | {
      ok: true;
      id: string;
      negozioId: string;
      accountId: string;
      accountName: string | null;
      testMode: boolean;
      onboardingStatus: string;
      payoutsEnabled: boolean;
      chargesEnabled: boolean;
      klarnaEnabled: boolean;
    }
  | {
      ok: false;
      codice: "NOT_FOUND" | "AMBIGUOUS" | "FETCH_FAILED";
    };

/**
 * Lookup opt-in per il solo re-link: cerca un account Stripe locale inattivo.
 * Non viene usato dalla readiness ordinaria, dal checkout o dai webhook.
 */
export async function getStripeConnectAccountForRelink(
  negozioId: string
): Promise<EsitoStripeConnectRelink> {
  if (!negozioId) return { ok: false, codice: "NOT_FOUND" };

  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("negozio_pagamenti")
      .select(
        "id, negozio_id, account_id, account_name, test_mode, onboarding_status, payouts_enabled, charges_enabled, klarna_enabled"
      )
      .eq("negozio_id", negozioId)
      .eq("provider", "stripe")
      .eq("attivo", false)
      .not("account_id", "is", null)
      .maybeSingle();

    if (error) return { ok: false, codice: "FETCH_FAILED" };
    if (!data?.account_id) return { ok: false, codice: "NOT_FOUND" };

    const accountId = String(data.account_id).trim();
    if (!accountId) return { ok: false, codice: "NOT_FOUND" };

    const { data: collegamenti, error: collegamentiError } = await db
      .from("negozio_pagamenti")
      .select("negozio_id")
      .eq("provider", "stripe")
      .eq("account_id", accountId);

    if (collegamentiError || (collegamenti ?? []).length !== 1 || String(collegamenti?.[0]?.negozio_id) !== negozioId) {
      return { ok: false, codice: "AMBIGUOUS" };
    }

    return {
      ok: true,
      id: String(data.id),
      negozioId,
      accountId,
      accountName: data.account_name ? String(data.account_name) : null,
      testMode: data.test_mode === true,
      onboardingStatus: data.onboarding_status ? String(data.onboarding_status) : "pending",
      payoutsEnabled: data.payouts_enabled === true,
      chargesEnabled: data.charges_enabled === true,
      klarnaEnabled: data.klarna_enabled === true,
    };
  } catch {
    return { ok: false, codice: "FETCH_FAILED" };
  }
}

export async function getNegozioIdByStripeAccount(accountId: string): Promise<string | null> {
  const id = (accountId ?? "").trim();
  if (!id) return null;
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("negozio_pagamenti")
      .select("negozio_id")
      .eq("provider", "stripe")
      .eq("account_id", id)
      .eq("attivo", true)
      .limit(1);
    return data?.[0]?.negozio_id ? String(data[0].negozio_id) : null;
  } catch {
    return null;
  }
}

export async function getPaypalSellerContext(
  negozioId: string
): Promise<PaypalSellerContext | null> {
  if (!negozioId) return null;
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("negozio_pagamenti")
      .select("merchant_id, onboarding_status, payments_receivable, primary_email_confirmed, test_mode")
      .eq("negozio_id", negozioId)
      .eq("provider", "paypal")
      .eq("attivo", true)
      .maybeSingle();
    if (error || !data || typeof data.merchant_id !== "string" || !data.merchant_id.trim()) {
      return null;
    }

    const status = String(data.onboarding_status ?? "not_started");
    if (status !== "not_started" && status !== "pending" && status !== "complete" && status !== "restricted") {
      return null;
    }

    return {
      merchantId: data.merchant_id.trim(),
      onboardingStatus: status,
      paymentsReceivable: data.payments_receivable === true,
      primaryEmailConfirmed: data.primary_email_confirmed === true,
      testMode: data.test_mode !== false,
    };
  } catch {
    return null;
  }
}

export async function risolviCredenzialiGateway(
  negozioId: string,
  provider: string
): Promise<{ pronto: boolean; cred: CredenzialiGateway | null }> {
  if (provider === "paypal") {
    const paypal = getConfigPaypalPiattaforma();
    const paypalSeller = await getPaypalSellerContext(negozioId);
    if (!paypal || !paypalSeller) return { pronto: false, cred: null };
    if (!paypalSellerPronto(paypalSeller)) {
      return { pronto: false, cred: null };
    }
    return {
      pronto: true,
      cred: {
        testMode: paypal.testMode,
        paypal,
        paypalSeller,
      },
    };
  }
  if (provider !== "stripe") return { pronto: false, cred: null };

  const connect = await getStripeConnectAccount(negozioId);
  if (connect) {
    if (!connect.chargesEnabled || !connect.payoutsEnabled) {
      return { pronto: false, cred: null };
    }
    return {
      pronto: true,
      cred: {
        stripeAccountId: connect.accountId,
        testMode: connect.testMode,
      },
    };
  }

  const config = await getConfigStripeNegozio(negozioId);
  if (!config) return { pronto: false, cred: null };
  return { pronto: true, cred: credenzialiGatewayDaConfig(config) };
}

export async function isProviderProntoPerNegozio(
  negozioId: string,
  provider: string
): Promise<boolean> {
  return (await risolviCredenzialiGateway(negozioId, provider)).pronto;
}

export async function isStripeProntoPerNegozio(negozioId: string): Promise<boolean> {
  return isProviderProntoPerNegozio(negozioId, "stripe");
}

export function credenzialiGatewayDaConfig(
  cfg: ConfigProviderNegozio
): CredenzialiGateway {
  return {
    clientId: cfg.clientId ?? undefined,
    secret: cfg.secretKey,
    webhookSecret: cfg.webhookSecret || undefined,
    stripeAccountId: cfg.accountId,
    testMode: cfg.testMode,
  };
}

export async function providerDisponibilePerProdotto(
  prodottoId: string,
  provider: string
): Promise<boolean> {
  if (!prodottoId || !/^\d+$/.test(String(prodottoId))) return false;
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("prodotti")
      .select("negozio_id")
      .eq("id", Number(prodottoId))
      .single();
    if (!data?.negozio_id) return false;
    return isProviderProntoPerNegozio(String(data.negozio_id), provider);
  } catch {
    return false;
  }
}

export async function cartaDisponibilePerProdotto(prodottoId: string): Promise<boolean> {
  return providerDisponibilePerProdotto(prodottoId, "stripe");
}
