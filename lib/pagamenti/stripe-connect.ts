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

/** Revoca il collegamento dell'account Stripe Connect (deauthorize). */
export async function deauthorizeStripeAccount(
  accountId: string,
  opts?: GatewayStripeOptions
): Promise<void> {
  const stripe = new Stripe(getStripePlatformSecretKey(), opts?.host ? {
    host: opts.host,
    port: opts.port,
    protocol: opts.protocol ?? "https",
  } : undefined);
  await stripe.oauth.deauthorize({
    client_id: getStripeConnectClientId(),
    stripe_user_id: accountId,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// STRIPE CONNECT EXPRESS — onboarding tramite Account Link (ACCOUNTS V2).
//
// Il venditore NON passa da connect.stripe.com/oauth: la piattaforma crea
// un account V2 (v2/core/accounts) con configuration merchant via API,
// genera un Account Link (onboarding hosted) e reindirizza il browser del
// venditore sul portale Stripe. Lo stato onboarding viene aggiornato per
// POLLING (pagina /ritorno-stripe): gli eventi account dei connected
// account V2 viaggiano su Event Destination V2 e NON sul webhook v1
// (/api/pagamenti/connect/webhook resta per gli account legacy v1).
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
 * Deriva lo stato onboarding LEGGIBILE da un connected account Stripe.
 * Accetta ENTRAMBE le shape:
 *   - V2 (v2.core.account): stato dalle configuration del merchant
 *     (capabilities card_payments + stripe_balance.payouts);
 *   - V1 (Stripe.Account legacy, eventi webhook v1): invariato.
 *   - restricted: una capability è in stato `restricted` (V2) oppure
 *     Stripe ha bloccato l'account (V1: requirements.disabled_reason);
 *   - complete:   pagamenti E payout abilitati;
 *   - pending:    in ogni altro caso (KYC/IBAN in attesa).
 */
export function statoOnboardingDaAccount(
  account: Stripe.V2.Core.Account | Stripe.Account
): StatoOnboardingStripe {
  // Account V2 (v2.core.account): lo stato si ricava dalle capability
  // della configuration merchant (card_payments = incassi pagamenti,
  // stripe_balance.payouts = erogazioni; capability di sola lettura).
  if (account.object === "v2.core.account") {
    const caps = account.configuration?.merchant?.capabilities;
    const cardStatus = caps?.card_payments?.status;
    const payoutsStatus = caps?.stripe_balance?.payouts?.status;
    const chargesEnabled = cardStatus === "active";
    const payoutsEnabled = payoutsStatus === "active";
    const status: StatoOnboardingStripe["status"] =
      cardStatus === "restricted" || payoutsStatus === "restricted"
        ? "restricted"
        : chargesEnabled && payoutsEnabled
          ? "complete"
          : "pending";
    return {
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted: chargesEnabled || payoutsEnabled,
      status,
      disabledReason: null,
      currentlyDue: [],
    };
  }

  // Account V1 (Stripe.Account legacy / eventi webhook v1): invariato.
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
 * Crea un account Stripe Connect V2 (v2/core/accounts) per la piattaforma.
 * Account con configuration MERCHANT (Merchant of Record, direct charges)
 * e dashboard express. Prefill opzionale (email del venditore + nome
 * business) per ridurre i campi da compilare nell'onboarding hosted.
 * Nessuna credenziale merchant. La modalità (livemode) è quella della
 * piattaforma e arriva dal campo `livemode` dell'oggetto creato.
 */
export async function createStripeExpressAccount(
  prefill: { email?: string | null; businessName?: string | null },
  opts?: GatewayStripeOptions
): Promise<{ accountId: string; livemode: boolean }> {
  const stripe = platformStripe(opts);
  const account = await stripe.v2.core.accounts.create({
    contact_email: prefill.email || undefined,
    display_name: prefill.businessName || undefined,
    dashboard: "express",
    // Responsabilità richieste da Stripe V2 per la configuration merchant
    // (capability stripe_balance.stripe_transfers; i due campi sono
    // OBBLIGATORI nei create params — requirements_collector non esiste in
    // creazione: in V2 è la piattaforma a raccogliere i requisiti). Scelta
    // coerente col flusso Express v1 precedente: la piattaforma paga le fee
    // Stripe (fees_collector) e assorbe le perdite/dispute (losses_collector).
    defaults: {
      currency: "eur",
      responsibilities: {
        fees_collector: "application_express",
        losses_collector: "application",
      },
    },
    identity: { country: "IT" },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
          klarna_payments: { requested: true },
        },
      },
    },
    include: ["configuration.merchant", "requirements"],
  });
  if (!account.id) throw new Error("Stripe non ha restituito l'id dell'account V2.");
  return { accountId: account.id, livemode: account.livemode === true };
}

/**
 * Crea un Account Link V2 (v2/core/account_links) di onboarding per un
 * connected account. Ritorna l'URL hosted (single-use) a cui reindirizzare
 * il venditore. `configurations: ["merchant"]` raccoglie nell'onboarding i
 * requisiti della configuration merchant. return_url → pagina di ritorno
 * post-onboarding; refresh_url → riprova quando il link è scaduto/usato.
 */
export async function createStripeAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
  opts?: GatewayStripeOptions
): Promise<string> {
  const stripe = platformStripe(opts);
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant"],
        return_url: returnUrl,
        refresh_url: refreshUrl,
        collection_options: {
          fields: "currently_due",
          future_requirements: "omit",
        },
      },
    },
  });
  if (!link.url) throw new Error("Stripe non ha restituito l'URL di onboarding.");
  return link.url;
}

/** Stato di onboarding corrente di un connected account V2 (per la pagina di ritorno). */
export async function getStripeAccountOnboarding(
  accountId: string,
  opts?: GatewayStripeOptions
): Promise<StatoOnboardingStripe> {
  const stripe = platformStripe(opts);
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "requirements"],
  });
  return statoOnboardingDaAccount(account);
}
