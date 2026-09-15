import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getNegoziStripeConnectAdmin } from "@/lib/amministratore/pagamenti-stripe";

/**
 * GET /api/amministratore/pagamenti/stripe
 *
 * Vista di supervisione Stripe Connect per l'amministrazione: elenco di
 * TUTTI i negozi con lo stato del proprio connected account (account_id,
 * account_name, onboarding_status, charges_enabled, payouts_enabled,
 * stato complessivo) + riepilogo aggregato per i KPI.
 *
 * Solo admin (requireApiArea("admin"), pattern di tutte le API
 * amministrative). Nessun dato sensibile esposto: solo campi pubblici del
 * collegamento; nessuna credenziale/secret.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const risultato = await getNegoziStripeConnectAdmin();
    return apiOk(risultato);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}