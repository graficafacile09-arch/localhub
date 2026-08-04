import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteHaRuoli } from "@/lib/auth/roles";
import { getTemplateDisponibili } from "@/lib/merchant/template-store";

/**
 * Template disponibili per il COMMERCIANTE (solo lettura).
 * I template sono una funzione di piattaforma: l'amministratore li crea,
 * modifica ed elimina; il commerciante li sceglie durante la creazione del
 * negozio (o li applica al proprio). Nessuna scrittura qui.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!(await utenteHaRuoli(user.id, ["merchant", "admin"]))) {
    return apiError("FORBIDDEN", "Accesso riservato ai commercianti.", 403);
  }

  try {
    const templates = await getTemplateDisponibili();
    return apiOk({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
