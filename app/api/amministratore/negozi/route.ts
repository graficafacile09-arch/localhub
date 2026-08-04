import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteHaRuoli } from "@/lib/auth/roles";
import { getNegoziAttiviSintesi } from "@/lib/amministratore/negozi";

/**
 * Elenco sintetico dei negozi ATTIVI (solo admin).
 * Usato dal picker "sorgente" per la creazione dei template di piattaforma.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!(await utenteHaRuoli(user.id, ["admin"]))) {
    return apiError("FORBIDDEN", "Accesso riservato agli amministratori.", 403);
  }

  try {
    const stores = await getNegoziAttiviSintesi();
    return apiOk({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
