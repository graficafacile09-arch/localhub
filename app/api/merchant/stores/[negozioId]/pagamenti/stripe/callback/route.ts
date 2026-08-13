import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { getSiteUrl } from "@/lib/site";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  verificaStatoConnect,
  exchangeStripeOAuthCode,
  getStripeAccountName,
} from "@/lib/pagamenti/stripe-connect";

/**
 * GET /api/merchant/stores/[negozioId]/pagamenti/stripe/callback
 *
 * Callback OAuth di Stripe Connect (redirect_uri). Verifica lo state firmato
 * (CSRF + binding al negozio), scambia il codice e salva SOLO l'account id
 * (`stripe_user_id`) + nome business. Nessun token/secret viene salvato.
 * Poi reindirizza alla dashboard del venditore.
 */
function redirectTo(negozioId: string, esito: string): Response {
  return Response.redirect(
    `${getSiteUrl()}/merchant/${negozioId}/impostazioni?stripe=${esito}`,
    302
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { negozioId } = await context.params;
  const url = new URL(request.url);

  const errore = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Rifiuto esplicito da parte del venditore, o state assente/invalido.
  if (errore || !code || !state || !verificaStatoConnect(state, negozioId)) {
    return redirectTo(negozioId, "error");
  }

  // Ownership: il venditore deve poter gestire il negozio.
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return redirectTo(negozioId, "error");
  const allowed = await canManageStore(sessione.user.id, negozioId);
  if (!allowed) return redirectTo(negozioId, "error");

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
