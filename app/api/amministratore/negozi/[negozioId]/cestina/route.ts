import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { cestinaNegozio } from "@/lib/amministratore/negozi";

/**
 * Sposta un negozio nel Cestino (soft delete) — azione di piattaforma,
 * riservata alla sessione admin. Può cestinare QUALSIASI negozio.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { negozioId } = await context.params;

  try {
    await cestinaNegozio(negozioId, sessione.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("TRASH_FAILED", message, 500);
  }

  revalidatePath("/amministratore/cestino");
  revalidatePath("/amministratore/attivita");
  revalidatePath("/negozi");
  revalidatePath("/");

  return apiOk({ trashed: true, storeId: negozioId });
}
