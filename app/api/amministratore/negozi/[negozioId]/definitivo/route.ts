import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { eliminaDefinitivamenteNegozio } from "@/lib/amministratore/negozi";

/**
 * Elimina DEFINITIVAMENTE un negozio dal database — SOLO se è nel Cestino
 * (deleted_at non null). Azione distruttiva e irreversibile, riservata
 * ESCLUSIVAMENTE alla sessione admin. Prodotti e media collegati vengono
 * eliminati insieme al negozio.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { negozioId } = await context.params;

  try {
    await eliminaDefinitivamenteNegozio(negozioId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }

  revalidatePath("/amministratore/cestino");
  revalidatePath("/amministratore/attivita");
  revalidatePath("/negozi");
  revalidatePath("/");

  return apiOk({ deleted: true, storeId: negozioId });
}
