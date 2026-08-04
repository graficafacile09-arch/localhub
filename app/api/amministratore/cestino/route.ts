import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteHaRuoli } from "@/lib/auth/roles";
import { getNegoziCestino } from "@/lib/amministratore/negozi";

/**
 * Cestino GLOBALE della piattaforma — solo amministratori.
 * Elenca tutti i negozi eliminati (soft delete), di qualunque proprietario.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!(await utenteHaRuoli(user.id, ["admin"]))) {
    return apiError("FORBIDDEN", "Accesso riservato agli amministratori.", 403);
  }

  try {
    const stores = await getNegoziCestino();
    return apiOk({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
