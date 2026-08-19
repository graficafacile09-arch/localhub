/**
 * PAGAMENTI — CONFIG NEGOZIO (FASE F1 + generalizzazione provider).
 *
 * Legge la configurazione di UN provider per un negozio da
 * `negozio_pagamenti` passando ESCLUSIVAMENTE dalla RPC
 * `pagamenti_credenziali_leggi` (security definer, service-role) con
 * decifratura (`p_decifra = true`):
 * - la chiave PAYMENTS_ENCRYPTION_KEY arriva da process.env (mai dal
 *   browser, mai nel codice, mai nei log);
 * - i secret NON vengono mai esposti da API pubbliche;
 * - negozio NON configurato / provider inattivo / senza secret → `null`
 *   (fail-closed: il checkout mostra "Carta non disponibile" invece di un
 *   errore opaco).
 *
 * La RPC sottostante è già genericizzata per provider (`p_provider`): il
 * core `getConfigProviderNegozio(negozioId, provider)` ne è la proiezione
 * server; `getConfigStripeNegozio` / `isStripeProntoPerNegozio` restano
 * come WRAPPER retrocompatibili (F1) — il comportamento Stripe è identico.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isProviderPagamentoValido } from "./crypto";
import type { CredenzialiGateway } from "./types";

/** Configurazione di un provider per un negozio, risolta SERVER-SIDE. */
export type ConfigProviderNegozio = {
  negozioId: string;
  provider: string;
  testMode: boolean;
  /** Client id / merchant id del provider (es. Merchant ID Klarna): MAI esposto al client. */
  clientId: string | null;
  /** Secret key del provider (es. sk_... Stripe): MAI esposta al client. */
  secretKey: string;
  /** Webhook signing secret del provider (es. whsec_... Stripe): MAI esposta al client. */
  webhookSecret: string;
  /** Account collegato (Stripe Connect: stripe_user_id `acct_…`). Non sensibile. */
  accountId?: string;
  /** Nome business dell'account collegato (solo per la UI). Non sensibile. */
  accountName?: string | null;
};

/** Alias retrocompatibile (F1): la config Stripe è una config provider generica. */
export type ConfigStripeNegozio = ConfigProviderNegozio;

type EsitoRpcLettura = {
  ok?: boolean;
  presente?: boolean;
  attivo?: boolean;
  test_mode?: boolean;
  client_id?: string | null;
  payee_email?: string | null;
  iban?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  has_secret?: boolean;
  secret?: string | null;
  webhook_secret?: string | null;
  codice?: string;
  messaggio?: string;
};

/** Chiave di cifratura: SOLO server-side, SOLO se realmente necessaria. */
function chiaveCifraturaOrNull(): string | null {
  const key = process.env.PAYMENTS_ENCRYPTION_KEY;
  if (!key || key.trim().length === 0) return null;
  return key.trim();
}

/**
 * Legge e decifra la configurazione Stripe del negozio (service-role).
 * Ritorna `null` se: RPC in errore, negozio non presente, provider non
 * attivo, secret assente oppure chiave di cifratura mancante (fail-closed).
 * Il webhook secret è opzionale (richiesto solo per ricevere webhook):
 * senza, la configurazione NON viene considerata pronta per il checkout.
 */
/**
 * Legge e decifra la configurazione di un provider per un negozio
 * (service-role). `provider` deve essere nella allowlist
 * (isProviderPagamentoValido — include bonifico oltre ai gateway online).
 * Ritorna `null` se: RPC in errore, negozio non presente, provider non
 * attivo, secret assente oppure chiave di cifratura mancante (fail-closed).
 * Il webhook secret è opzionale (richiesto solo per ricevere webhook):
 * senza, la configurazione NON viene considerata pronta per il checkout.
 */
export async function getConfigProviderNegozio(
  negozioId: string,
  provider: string
): Promise<ConfigProviderNegozio | null> {
  if (!negozioId || !isProviderPagamentoValido(provider)) return null;
  const chiave = chiaveCifraturaOrNull();

  let data: unknown;
  try {
    const db = createAdminSupabaseClient();
    const { data: rpcData, error } = await db.rpc("pagamenti_credenziali_leggi", {
      p_negozio_id: negozioId,
      p_provider: provider,
      p_decifra: true,
      p_chiave: chiave,
    });
    if (error) {
      console.error(`[pagamenti] lettura config ${provider} (negozio ${negozioId}): ${error.message}`);
      return null;
    }
    data = rpcData;
  } catch (e) {
    console.error(
      `[pagamenti] lettura config ${provider}: impossibile inizializzare il client admin`
    );
    return null;
  }

  const esito = (data ?? null) as EsitoRpcLettura | null;
  if (!esito || esito.ok !== true || esito.presente !== true || esito.attivo !== true) {
    return null;
  }

  const secretKey =
    typeof esito.secret === "string" && esito.secret.trim() ? esito.secret.trim() : null;
  const webhookSecret =
    typeof esito.webhook_secret === "string" && esito.webhook_secret.trim()
      ? esito.webhook_secret.trim()
      : null;

  // Fail-closed: senza secret key il gateway non può operare.
  if (!secretKey) return null;

  const accountId =
    typeof esito.account_id === "string" && esito.account_id.trim()
      ? esito.account_id.trim()
      : undefined;
  const accountName =
    typeof esito.account_name === "string" && esito.account_name.trim()
      ? esito.account_name.trim()
      : null;

  return {
    negozioId,
    provider,
    testMode: esito.test_mode !== false,
    clientId:
      typeof esito.client_id === "string" && esito.client_id.trim()
        ? esito.client_id.trim()
        : null,
    secretKey,
    webhookSecret: webhookSecret ?? "",
    accountId,
    accountName,
  };
}

/** Wrapper retrocompatibile (F1): configurazione Stripe del negozio. */
export async function getConfigStripeNegozio(
  negozioId: string
): Promise<ConfigStripeNegozio | null> {
  return getConfigProviderNegozio(negozioId, "stripe");
}

/**
 * Account Stripe Connect collegato al negozio (sola lettura, dati pubblici).
 * Ritorna null se il negozio non ha collegato Stripe via Connect (nessun
 * account_id, provider non attivo o assente).
 */
export async function getStripeConnectAccount(
  negozioId: string
): Promise<{ accountId: string; accountName: string | null; testMode: boolean } | null> {
  if (!negozioId) return null;
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("negozio_pagamenti")
      .select("account_id, account_name, test_mode")
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
    };
  } catch {
    return null;
  }
}

/**
 * Negozio proprietario di un account Stripe Connect (per il webhook):
 * mappa `stripe_user_id` → negozio_id. Usata dal webhook per risolvere
 * il negozio mittente degli eventi Connect (fail-closed: null se ignoto).
 */
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
    const negozioId = data?.[0]?.negozio_id;
    return negozioId ? String(negozioId) : null;
  } catch {
    return null;
  }
}

/**
 * Risolve le credenziali gateway per un negozio + provider, gestendo
 * entrambi i modelli:
 *   - Stripe Connect: account collegato (stripeAccountId, nessun secret);
 *   - legacy/direct (Stripe manuale, PayPal, Klarna): secret + webhook secret.
 * Ritorna `pronto=false` se il provider non è realmente utilizzabile.
 */
export async function risolviCredenzialiGateway(
  negozioId: string,
  provider: string
): Promise<{ pronto: boolean; cred: CredenzialiGateway | null }> {
  if (provider === "stripe") {
    const connect = await getStripeConnectAccount(negozioId);
    if (connect) {
      return {
        pronto: true,
        cred: {
          stripeAccountId: connect.accountId,
          secret: undefined,
          webhookSecret: undefined,
          clientId: undefined,
          testMode: connect.testMode,
        },
      };
    }
  }

  const cfg = await getConfigProviderNegozio(negozioId, provider);
  // Scalapay firma i webhook con la STESSA API key usata come Bearer: non
  // esiste un webhook secret separato. "Pronto" = secret key presente.
  const webhookSecret = provider === "scalapay" ? cfg?.secretKey ?? "" : cfg?.webhookSecret ?? "";
  if (!cfg || webhookSecret.length === 0) {
    return { pronto: false, cred: null };
  }
  return { pronto: true, cred: credenzialiGatewayDaConfig(cfg) };
}

/**
 * TRUE se il negozio può realmente accettare pagamenti con il provider
 * (Stripe Connect collegato, oppure configurato+attivo con secret e webhook
 * secret). Semantica comune a tutti i provider.
 */
export async function isProviderProntoPerNegozio(
  negozioId: string,
  provider: string
): Promise<boolean> {
  return (await risolviCredenzialiGateway(negozioId, provider)).pronto;
}

/** Wrapper retrocompatibile (F1): TRUE se il negozio può accettare carte. */
export async function isStripeProntoPerNegozio(negozioId: string): Promise<boolean> {
  return isProviderProntoPerNegozio(negozioId, "stripe");
}

/**
 * Credenziali per il gateway (interfaccia CredenzialiGateway).
 * SOLO server-side; mai inviate al client.
 * Include anche il webhook secret: serve a `verificaFirma` dei gateway
 * HTTP (es. Klarna) per convalidare gli eventi in arrivo.
 */
export function credenzialiGatewayDaConfig(cfg: ConfigProviderNegozio): CredenzialiGateway {
  return {
    clientId: cfg.clientId ?? undefined,
    secret: cfg.secretKey,
    webhookSecret: cfg.webhookSecret || undefined,
    stripeAccountId: cfg.accountId,
    testMode: cfg.testMode,
  };
}

/**
 * TRUE se il prodotto appartiene a un negozio che può accettare pagamenti
 * con il provider richiesto (configurato e attivo). PRE-FLIGHT usato dalle
 * route checkout PRIMA di creare l'ordine: il client non può mai scegliere
 * un metodo gateway per un negozio non pronto (defense in depth; la UI già
 * filtra i metodi). Genericizzato per provider: il caso d'uso storico
 * "carta" è servito dal wrapper retrocompatibile cartaDisponibilePerProdotto.
 */
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
    return await isProviderProntoPerNegozio(String(data.negozio_id), provider);
  } catch {
    return false;
  }
}

/**
 * TRUE se il prodotto appartiene a un negozio che può accettare carte
 * (Stripe configurato e attivo). WRAPPER retrocompatibile (F1) sul check
 * generico per provider: il comportamento è identico.
 */
export async function cartaDisponibilePerProdotto(prodottoId: string): Promise<boolean> {
  return providerDisponibilePerProdotto(prodottoId, "stripe");
}
