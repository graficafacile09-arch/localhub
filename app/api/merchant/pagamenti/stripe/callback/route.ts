import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { getSiteUrl } from "@/lib/site";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  estraiEVerificaStatoConnect,
  exchangeStripeOAuthCode,
  getStripeAccountName,
} from "@/lib/pagamenti/stripe-connect";

/**
 * GET /api/merchant/pagamenti/stripe/callback
 *
 * Callback OAuth Stripe Connect a PATH FISSO (redirect_uri registrato su
 * Stripe con match esatto). Il negozio NON viene preso dal path: viene
 * estratto ESCLUSIVAMENTE dallo `state` firmato (HMAC-SHA256, fail-closed),
 * poi verificato con `canManageStore` (ownership). Completa lo scambio OAuth
 * e salva SOLO `stripe_user_id` + nome business. Nessun token/secret salvato.
 */
function redirectErrore(): Response {
  return Response.redirect(`${getSiteUrl()}/merchant?stripe=error`, 302);
}

function redirectTo(negozioId: string, esito: string): Response {
  return Response.redirect(
    `${getSiteUrl()}/merchant/${negozioId}/pagamenti?stripe=${esito}`,
    302
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const errore = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Unico punto autoritativo per il negozio: lo state firmato. Mai dal path.
  const negozioId = state ? estraiEVerificaStatoConnect(state) : null;

  // Rifiuto esplicito, codice assente o state invalido/manomesso → errore.
  if (errore || !code || !negozioId) {
    return negozioId ? redirectTo(negozioId, "error") : redirectErrore();
  }

  // Ownership: il venditore deve poter gestire il negozio estratto dallo state.
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return redirectErrore();
  const allowed = await canManageStore(sessione.user.id, negozioId);
  if (!allowed) return redirectErrore();

  try {
    const { accountId, livemode } = await exchangeStripeOAuthCode(code);
    const accountName = await getStripeAccountName(accountId).catch(() => null);

    const db = createAdminSupabaseClient();
    const { data, error: rpcErr } = await db.rpc("pagamenti_stripe_connect_salva", {
      p_negozio_id: negozioId,
      p_account_id: accountId,
      p_account_name: accountName,
      p_test_mode: !livemode,
    });
    if (rpcErr) return redirectTo(negozioId, "error");
    const esito = data as { ok?: boolean } | null;
    if (esito?.ok !== true) return redirectTo(negozioId, "error");

    return redirectTo(negozioId, "connected");
  } catch {
    return redirectTo(negozioId, "error");
  }
}
