import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripeConnectAccount } from "@/lib/pagamenti/config";
import { disconnectStripeAccount } from "@/lib/pagamenti/stripe-connect";

/**
 * POST /api/merchant/stores/[negozioId]/pagamenti/stripe/disconnect
 *
 * Scollega l'account Stripe Connect del negozio: per gli account creati via
 * API (Accounts v2 e v1 Express) cancella l'account presso Stripe
 * (best-effort); per gli account OAuth esistenti (non cancellabili via API)
 * l'errore viene ignorato. In ogni caso azzera il collegamento locale.
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
    await disconnectStripeAccount(connect.accountId).catch(() => {});
  }

  const db = createAdminSupabaseClient();
  const { error } = await db.rpc("pagamenti_stripe_connect_disconnetti", {
    p_negozio_id: negozioId,
  });
  if (error) return apiError("SAVE_FAILED", "Impossibile scollegare Stripe.", 500);

  return apiOk({ disconnected: true });
}
