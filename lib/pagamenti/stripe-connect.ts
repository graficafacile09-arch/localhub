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
