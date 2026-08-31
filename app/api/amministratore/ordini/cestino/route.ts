import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getOrdiniCestino } from "@/lib/amministratore/ordini";

/**
 * GET /api/amministratore/ordini/cestino
 *
 * Elenco degli ordini nel Cestino (soft deleted), SOLO sessione admin.
 * È il complemento della gestione ordini: dopo l'eliminazione (soft delete)
 * l'ordine resta recuperabile qui e da /amministratore/cestino.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const ordini = await getOrdiniCestino();
    return apiOk({ ordini });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("CESTINO_ORDINI_READ_FAILED", message, 500);
  }
}