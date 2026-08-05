import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getNegoziCestino } from "@/lib/amministratore/negozi";

/**
 * Cestino GLOBALE della piattaforma — solo sessione admin.
 * L'area di sessione "admin" viene concessa solo all'admin autorizzato
 * (email + ruolo): qualsiasi altra sessione riceve 403.
 * Elenca tutti i negozi eliminati (soft delete), di qualunque proprietario.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const stores = await getNegoziCestino();
    return apiOk({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
