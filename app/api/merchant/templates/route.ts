import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getTemplateDisponibili } from "@/lib/merchant/template-store";

/**
 * Template disponibili per la sessione COMMERCIANTE (solo lettura).
 * I template sono una funzione di piattaforma: l'amministratore li crea,
 * modifica ed elimina; il commerciante li sceglie durante la creazione del
 * negozio (o li applica al proprio). Nessuna scrittura qui.
 */
export async function GET() {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;

  try {
    const templates = await getTemplateDisponibili();
    return apiOk({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}
