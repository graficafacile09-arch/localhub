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
    console.error("[/api/amministratore/negozi] Errore:", err);
    return apiError(
      "FETCH_FAILED",
      "Impossibile caricare i negozi. Riprova tra poco.",
      500
    );
  }
}
