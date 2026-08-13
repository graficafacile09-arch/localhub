import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { getSiteUrl } from "@/lib/site";
import { buildStripeConnectUrl } from "@/lib/pagamenti/stripe-connect";

/**
 * POST /api/merchant/stores/[negozioId]/pagamenti/stripe/connect
 *
 * Avvia il flusso Stripe Connect (OAuth) per il negozio: restituisce l'URL
 * di autorizzazione a cui il browser del venditore deve essere reindirizzato.
 * NESSUN secret viene richiesto al venditore: Stripe gestisce login/creazione
 * account, KYC e autorizzazione; al ritorno il callback salva solo
 * `stripe_user_id` + nome business.
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

  try {
    const redirectUri = `${getSiteUrl()}/api/merchant/stores/${negozioId}/pagamenti/stripe/callback`;
    const { url } = buildStripeConnectUrl(negozioId, redirectUri);
    return apiOk({ url });
  } catch {
    return apiError(
      "STRIPE_CONNECT_NON_CONFIGURATO",
      "Stripe Connect non è configurato a livello di piattaforma.",
      500
    );
  }
}
