/**
 * PAGAMENTI — STRIPE CONNECT (Fase 1): helper OAuth/account connection.
 *
 * Il venditore collega il proprio account Stripe SENZA inserire credenziali
 * tecniche: la piattaforma usa Stripe Connect OAuth (flusso
 * `connect.stripe.com/oauth/authorize` → authorization code → token).
 *
 * Dati richiesti a livello PIATTAFORMA (env, mai del merchant):
 *   - STRIPE_CONNECT_CLIENT_ID  (ca_…, Connect application client id);
 *   - STRIPE_SECRET_KEY         (sk_… della piattaforma: scambio OAuth +
 *                                sessioni Checkout on-behalf-of);
 *   - STRIPE_WEBHOOK_SECRET     (whsec_… della piattaforma: firma webhook
 *                                Connect; opzionale).
 *
 * NESSUN secret/token del merchant viene salvato: si conserva solo lo
 * `stripe_user_id` (account collegato) e un nome business per la UI.
 *
 * Sicurezza:
 *   - `state` firmato HMAC-SHA256 con la chiave server (PAYMENTS_ENCRYPTION_KEY)
 *     per CSRF + binding al negozio; fail-closed.
 *   - nessun token nei log.
 */

import Stripe from "stripe";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GatewayStripeOptions } from "./stripe";

/**
 * Path fisso del callback OAuth Stripe Connect (redirect_uri registrato su
 * Stripe). È volutamente INDIPENDENTE dal negozioId: il negozio viene
 * vincolato esclusivamente dallo `state` firmato (HMAC). Stripe OAuth
 * richiede un match esatto del redirect_uri, quindi non può contenere un
 * segmento dinamico per negozio.
 */
export const STRIPE_CONNECT_CALLBACK_PATH = "/api/merchant/pagamenti/stripe/callback";

/** Client id dell'applicazione Connect della piattaforma (ca_…). */
export function getStripeConnectClientId(): string {
  const id = (process.env.STRIPE_CONNECT_CLIENT_ID ?? "").trim();
  if (!id) throw new Error("STRIPE_CONNECT_CLIENT_ID non configurata");
  return id;
}

/** Secret key della piattaforma (sk_…): scambio OAuth + richieste Connect. */
export function getStripePlatformSecretKey(): string {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY non configurata");
  return key;
}

/** Webhook signing secret della piattaforma (whsec_…), se configurato. */
export function getStripePlatformWebhookSecret(): string | null {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  return secret.length > 0 ? secret : null;
}

/** Chiave server per firmare lo state OAuth (mai esposta, mai nei log). */
function chiaveState(): string {
  const key = (process.env.PAYMENTS_ENCRYPTION_KEY ?? "").trim();
  if (!key) throw new Error("PAYMENTS_ENCRYPTION_KEY non configurata");
  return key;
}

/** Firma lo state OAuth: `negozioId:nonce:hmac` (binding + CSRF). */
export function firmaStatoConnect(negozioId: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${negozioId}:${nonce}`;
  const hmac = createHmac("sha256", chiaveState()).update(payload).digest("base64url");
  return `${payload}:${hmac}`;
}

/**
 * Estrae il negozioId dallo `state` firmato e ne verifica l'integrità HMAC.
 * Ritorna il negozioId SOLO se la firma è valida, altrimenti null (fail-closed).
 * È l'unico punto in cui il callback ricava il negozio: mai dal path/URL.
 */
export function estraiEVerificaStatoConnect(state: string): string | null {
  if (!state) return null;
  const parts = state.split(":");
  if (parts.length !== 3) return null;
  const negozioId = parts[0];
  if (!negozioId) return null;
  const payload = `${parts[0]}:${parts[1]}`;
  const attesa = createHmac("sha256", chiaveState()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(attesa, "utf8");
    const b = Buffer.from(parts[2], "utf8");
    return a.length === b.length && timingSafeEqual(a, b) ? negozioId : null;
  } catch {
    return null;
  }
}

/** Verifica lo state OAuth (integrità + binding al negozio). Fail-closed. */
export function verificaStatoConnect(state: string, negozioId: string): boolean {
  return !!negozioId && estraiEVerificaStatoConnect(state) === negozioId;
}

/**
 * Costruisce l'URL di autorizzazione Stripe Connect (login O creazione
 * account). Ritorna anche lo `state` firmato (utile per i test).
 */
export function buildStripeConnectUrl(
  negozioId: string,
  redirectUri: string
): { url: string; state: string } {
  const state = firmaStatoConnect(negozioId);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getStripeConnectClientId(),
    scope: "read_write",
    redirect_uri: redirectUri,
    state,
  });
  return { url: `https://connect.stripe.com/oauth/authorize?${params.toString()}`, state };
}

/** Scambia un authorization code OAuth → account id (stripe_user_id). */
export async function exchangeStripeOAuthCode(
  code: string,
  opts?: GatewayStripeOptions
): Promise<{ accountId: string; livemode: boolean }> {
  const stripe = new Stripe(getStripePlatformSecretKey(), opts?.host ? {
    host: opts.host,
    port: opts.port,
    protocol: opts.protocol ?? "https",
  } : undefined);
  const res = await stripe.oauth.token({ grant_type: "authorization_code", code });
  const accountId = (res.stripe_user_id ?? "").trim();
  if (!accountId) throw new Error("OAuth Stripe: stripe_user_id mancante nella risposta");
  return { accountId, livemode: res.livemode === true };
}

/** Nome business leggibile dell'account collegato (per la UI, non sensibile). */
export async function getStripeAccountName(
  accountId: string,
  opts?: GatewayStripeOptions
): Promise<string | null> {
  const stripe = new Stripe(getStripePlatformSecretKey(), opts?.host ? {
    host: opts.host,
    port: opts.port,
    protocol: opts.protocol ?? "https",
  } : undefined);
  const account = await stripe.accounts.retrieve(accountId);
  const name =
    account.business_profile?.name ||
    account.settings?.dashboard?.display_name ||
    account.email ||
    null;
  return name ? String(name) : null;
}

/**
 * Scollega un connected account Stripe della piattaforma.
 *
 * Accounts v2: `stripe.oauth.deauthorize` è v1-only (richiede l'OAuth). Per
 * gli account creati via API (v1 Express e v2) il meccanismo di scollegamento
 * supportato è la CANCELLAZIONE dell'account (DELETE /v1/accounts/{id}), che
 * funziona anche per account v2. Per gli account collegati via OAuth
 * (Standard, vecchio flusso) Stripe non consente alla piattaforma di
 * cancellarli (l'account appartiene al venditore): in quel caso l'errore
 * viene ignorato dal chiamante e il collegamento viene rimosso SOLO a livello
 * locale (comportamento identico al passato).
 */
export async function disconnectStripeAccount(
  accountId: string,
  opts?: GatewayStripeOptions
): Promise<void> {
  const stripe = platformStripe(opts);
  await stripe.accounts.del(accountId);
}

// ═══════════════════════════════════════════════════════════════════════
// STRIPE CONNECT EXPRESS — onboarding tramite Account Link.
//
// Il venditore NON passa da connect.stripe.com/oauth: la piattaforma crea
// un account EXPRESS via API, genera un Account Link (onboarding hosted) e
// reindirizza il browser del venditore sul portale Stripe. Stripe notifica
// i progressi con il webhook `account.updated` (vedi
// /api/pagamenti/connect/webhook) che aggiorna lo stato su Supabase.
// ═══════════════════════════════════════════════════════════════════════

/** Client Stripe con la secret key della PIATTAFORMA (mai quella del merchant). */
function platformStripe(opts?: GatewayStripeOptions): Stripe {
  return new Stripe(getStripePlatformSecretKey(), opts?.host ? {
    host: opts.host,
    port: opts.port,
    protocol: opts.protocol ?? "https",
  } : undefined);
}

/** Stato di onboarding di un connected account (fonte: account.retrieve). */
export type StatoOnboardingStripe = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  status: "pending" | "complete" | "restricted";
  disabledReason: string | null;
  /** Requisiti ancora da soddisfare (currently_due), per la UI. */
  currentlyDue: string[];
};

/**
 * Deriva lo stato onboarding LEGGIBILE dai flag dell'account Stripe.
 *   - restricted: Stripe ha bloccato l'account (requirements.disabled_reason);
 *   - complete:   pagamenti E payout abilitati;
 *   - pending:    in ogni altro caso (KYC/IBAN in attesa).
 */
export function statoOnboardingDaAccount(account: Stripe.Account): StatoOnboardingStripe {
  const disabledReason =
    typeof account.requirements?.disabled_reason === "string"
      ? account.requirements.disabled_reason
      : null;
  const currentlyDue = Array.isArray(account.requirements?.currently_due)
    ? account.requirements.currently_due.filter((x): x is string => typeof x === "string")
    : [];
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;

  let status: StatoOnboardingStripe["status"];
  if (disabledReason) status = "restricted";
  else if (chargesEnabled && payoutsEnabled) status = "complete";
  else status = "pending";

  return {
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    status,
    disabledReason,
    currentlyDue,
  };
}

/**
 * Crea un connected account Stripe per la piattaforma via ACCOUNTS V2
 * (POST /v2/core/accounts, configuration merchant).
 *
 * Accounts v1 (POST /v1/accounts) è bloccato da Stripe per le nuove
 * integrazioni: la creazione passa dall'API v2, che è interoperabile con le
 * API v1 del resto del flusso (Account Link, retrieve, eventi account.updated,
 * direct charges con header Stripe-Account).
 *
 * Nota dashboard: la documentazione offre 'express' | 'full' | 'none', ma per
 * questa piattaforma 'express' viene rifiutato da Stripe ("account
 * configuration is not supported"); 'full' è verificato funzionante e dà al
 * venditore l'accesso al dashboard del proprio account.
 *
 * Prefill opzionale (email del venditore + nome business) per ridurre i
 * campi da compilare nell'onboarding hosted. Nessuna credenziale merchant.
 */
export async function createStripeExpressAccount(
  prefill: { email?: string | null; businessName?: string | null },
  opts?: GatewayStripeOptions
): Promise<{ accountId: string; livemode: boolean }> {
  const stripe = platformStripe(opts);
  const account = await stripe.v2.core.accounts.create({
    dashboard: "full",
    ...(prefill.email ? { contact_email: prefill.email } : {}),
    ...(prefill.businessName ? { display_name: prefill.businessName } : {}),
    identity: { country: "IT" },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
        },
      },
    },
    defaults: {
      currency: "eur",
      responsibilities: {
        // Direct charges: il venditore paga le proprie commissioni Stripe dal
        // proprio saldo (fees_collector 'stripe'); la piattaforma trattiene la
        // propria application_fee a monte.
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
  });
  const accountId = account.id;
  if (!accountId) throw new Error("Stripe non ha restituito l'id dell'account.");
  return { accountId, livemode: account.livemode === true };
}

/**
 * Crea un Account Link di onboarding per un connected account EXPRESS.
 * Ritorna l'URL hosted (single-use) a cui reindirizzare il venditore.
 * return_url → pagina di ritorno post-onboarding; refresh_url → riprova
 * quando il link è scaduto/già visitato.
 */
export async function createStripeAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
  opts?: GatewayStripeOptions
): Promise<string> {
  const stripe = platformStripe(opts);
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  if (!link.url) throw new Error("Stripe non ha restituito l'URL di onboarding.");
  return link.url;
}

/** Stato di onboarding corrente di un connected account (per la pagina di ritorno). */
export async function getStripeAccountOnboarding(
  accountId: string,
  opts?: GatewayStripeOptions
): Promise<StatoOnboardingStripe> {
  const stripe = platformStripe(opts);
  const account = await stripe.accounts.retrieve(accountId);
  return statoOnboardingDaAccount(account);
}
