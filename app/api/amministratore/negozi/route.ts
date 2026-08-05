import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getNegoziAttiviSintesi } from "@/lib/amministratore/negozi";

/**
 * Elenco sintetico dei negozi ATTIVI (solo sessione admin).
 * Usato dal picker "sorgente" per la creazione dei template di piattaforma.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const stores = await getNegoziAttiviSintesi();
    return apiOk({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
