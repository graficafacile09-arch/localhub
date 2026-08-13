import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripeConnectAccount } from "@/lib/pagamenti/config";
import { deauthorizeStripeAccount } from "@/lib/pagamenti/stripe-connect";

/**
 * POST /api/merchant/stores/[negozioId]/pagamenti/stripe/disconnect
 *
 * Scollega l'account Stripe Connect del negozio: revoca l'autorizzazione
 * presso Stripe (deauthorize, best-effort) e azzera il collegamento locale.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const connect = await getStripeConnectAccount(negozioId);
  if (connect) {
    await deauthorizeStripeAccount(connect.accountId).catch(() => {});
  }

  const db = createAdminSupabaseClient();
  const { error } = await db.rpc("pagamenti_stripe_connect_disconnetti", {
    p_negozio_id: negozioId,
  });
  if (error) return apiError("SAVE_FAILED", "Impossibile scollegare Stripe.", 500);

  return apiOk({ disconnected: true });
}
