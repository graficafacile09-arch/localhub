import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { avviaOnboardingStripeAdmin } from "@/lib/amministratore/pagamenti-stripe";

/**
 * POST /api/amministratore/pagamenti/stripe/[negozioId]/onboarding
 *
 * Genera (o riapre) l'Account Link di onboarding Stripe Connect per un
 * negozio, per conto dell'amministratore:
 *   - negozio con connected account → riusa l'account e genera un nuovo
 *     Account Link (single-use) per riprendere l'onboarding;
 *   - negozio NON collegato → crea un account Express via API (stesso
 *     helper della route merchant /api/pagamenti/connect/crea) e lo salva
 *     con la RPC esistente `pagamenti_stripe_connect_crea`.
 *
 * IMPORTANTE: l'URL restituito punta al portale HOSTED Stripe (KYC/IBAN
 * a carico del negoziante, mai sostituito dall'admin). L'amministratore
 * deve condividere il link con il titolare del negozio.
 *
 * Solo admin. Nessun secret esposto: la risposta contiene solo l'URL
 * single-use dell'Account Link e l'id account (pubblico).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("admin");
  if (errArea) return errArea;

  const { negozioId } = await context.params;
  if (!negozioId) {
    return apiError("VALIDATION_ERROR", "negozioId mancante.", 422);
  }

  const esito = await avviaOnboardingStripeAdmin(negozioId, sessione.user.email ?? null);
  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }
  return apiOk({ url: esito.url, accountId: esito.accountId, creato: esito.creato });
}