import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getUtentiReali } from "@/lib/amministratore/utenti-queries";

/** Elenco dei commercianti disponibili per l'assegnazione di un negozio. */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const utenti = await getUtentiReali("commerciante");
    return apiOk({
      proprietari: utenti.map((utente) => ({
        id: utente.id,
        nome: utente.nome,
        email: utente.email,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("OWNERS_FETCH_FAILED", message, 500);
  }
}
