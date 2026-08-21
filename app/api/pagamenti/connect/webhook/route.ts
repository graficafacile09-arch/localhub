import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verificaEventoStripe } from "@/lib/pagamenti/stripe";
import {
  getStripePlatformWebhookSecret,
  statoOnboardingDaAccount,
} from "@/lib/pagamenti/stripe-connect";
import type Stripe from "stripe";

/**
 * POST /api/pagamenti/connect/webhook
 *
 * Webhook Stripe CONNECT della piattaforma: ascolta gli eventi account-level
 * dei connected account e aggiorna lo stato di onboarding del venditore su
 * Supabase (RPC `pagamenti_stripe_connect_stato_salva`).
 *
 * NOTA: Stripe invia i webhook con POST (non GET). La firma viene verificata
 * con il signing secret DELLA PIATTAFORMA (STRIPE_WEBHOOK_SECRET, whsec_…):
 * fail-closed, un evento con firma non valida viene rifiutato (400).
 *
 * Eventi gestiti:
 *   - account.updated → ricalcola onboarding_status / payouts_enabled /
 *     charges_enabled dall'account e li salva (idempotente).
 *
 * Registra l'endpoint nel Dashboard Stripe (Developers → Webhooks) con
 * eventi: account.updated.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const secret = getStripePlatformWebhookSecret();
  if (!secret || !signature) {
    return new Response("Firma mancante.", { status: 400 });
  }

  const evento = verificaEventoStripe(rawBody, signature, secret);
  if (!evento) {
    return new Response("Firma non valida.", { status: 400 });
  }

  // Solo eventi account-level: il resto (checkout/payout) è gestito dal
  // webhook principale /api/webhook/pagamenti/stripe.
  if (evento.type !== "account.updated") {
    return new Response("Ignorato.", { status: 200 });
  }

  const account = evento.data?.object as Stripe.Account | undefined;
  const accountId = (evento as { account?: string | null }).account ?? account?.id;
  if (!accountId || !account) {
    return new Response("Account mancante.", { status: 200 });
  }

  const stato = statoOnboardingDaAccount(account);
  const db = createAdminSupabaseClient();
  const { error } = await db.rpc("pagamenti_stripe_connect_stato_salva", {
    p_account_id: accountId,
    p_onboarding_status: stato.status,
    p_payouts_enabled: stato.payoutsEnabled,
    p_charges_enabled: stato.chargesEnabled,
  });

  if (error) {
    console.error(`[connect-webhook] aggiornamento account ${accountId}: ${error.message}`);
    // 200 anche in caso di errore di scrittura (evita retry infiniti di Stripe
    // su eventi non-riprocessabili); l'errore resta nei log per diagnosi.
    return new Response("Registrato (aggiornamento rinviato).", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}
