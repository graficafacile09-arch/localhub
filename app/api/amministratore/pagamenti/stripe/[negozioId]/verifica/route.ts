import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { verificaStatoStripeAdmin } from "@/lib/amministratore/pagamenti-stripe";

/**
 * POST /api/amministratore/pagamenti/stripe/[negozioId]/verifica
 *
 * Verifica lo stato LIVE del connected account Stripe del negozio presso
 * Stripe (getStripeAccountOnboarding) e lo persiste con la RPC esistente
 * `pagamenti_stripe_connect_stato_salva`. Utile quando il webhook/polling
 * non ha ancora aggiornato i flag (es. account V2 o onboarding appena
 * completato). Fail-closed: negozio senza account collegato → 404; errore
 * Stripe → 502 senza scritture.
 *
 * Solo admin. Nessun secret esposto: la risposta contiene solo lo stato
 * pubblico del collegamento aggiornato.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { error: errArea } = await requireApiArea("admin");
  if (errArea) return errArea;

  const { negozioId } = await context.params;
  if (!negozioId) {
    return apiError("VALIDATION_ERROR", "negozioId mancante.", 422);
  }

  const esito = await verificaStatoStripeAdmin(negozioId);
  if (!esito.ok) {
    return apiError(esito.codice, esito.messaggio, esito.status);
  }
  return apiOk({ negozio: esito.negozio, live: esito.live });
}