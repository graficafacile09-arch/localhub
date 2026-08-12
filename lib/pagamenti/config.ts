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
  };
}

/** Wrapper retrocompatibile (F1): configurazione Stripe del negozio. */
export async function getConfigStripeNegozio(
  negozioId: string
): Promise<ConfigStripeNegozio | null> {
  return getConfigProviderNegozio(negozioId, "stripe");
}

/**
 * TRUE se il negozio può realmente accettare pagamenti con il provider
 * (configurato, attivo e con secret). Semantica comune a tutti i provider
 * in questa fase: serve anche il webhook secret (senza non possiamo
 * confermare il pagamento). Da affinare per provider quando arriveranno i
 * gateway dedicati (es. Klarna/Scalapay potrebbero non richiederlo).
 */
export async function isProviderProntoPerNegozio(
  negozioId: string,
  provider: string
): Promise<boolean> {
  const cfg = await getConfigProviderNegozio(negozioId, provider);
  // Serve anche il webhook secret: senza non possiamo confermare il pagamento.
  return !!cfg && cfg.webhookSecret.length > 0;
}

/** Wrapper retrocompatibile (F1): TRUE se il negozio può accettare carte. */
export async function isStripeProntoPerNegozio(negozioId: string): Promise<boolean> {
  return isProviderProntoPerNegozio(negozioId, "stripe");
}

/**
 * Credenziali per il gateway (interfaccia CredenzialiGateway).
 * SOLO server-side; mai inviate al client.
 */
export function credenzialiGatewayDaConfig(cfg: ConfigProviderNegozio): CredenzialiGateway {
  return {
    clientId: cfg.clientId ?? undefined,
    secret: cfg.secretKey,
    testMode: cfg.testMode,
  };
}

/**
 * TRUE se il prodotto appartiene a un negozio che può accettare carte
 * (Stripe configurato e attivo). PRE-FLIGHT usato da POST /api/cliente/ordini
 * PRIMA di creare l'ordine: il client non può mai scegliere "carta" per un
 * negozio non pronto (defense in depth; la UI già filtra i metodi).
 */
export async function cartaDisponibilePerProdotto(prodottoId: string): Promise<boolean> {
  if (!prodottoId || !/^\d+$/.test(String(prodottoId))) return false;
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("prodotti")
      .select("negozio_id")
      .eq("id", Number(prodottoId))
      .single();
    if (!data?.negozio_id) return false;
    return await isStripeProntoPerNegozio(String(data.negozio_id));
  } catch {
    return false;
  }
}
