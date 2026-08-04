import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteHaRuoli } from "@/lib/auth/roles";
import { cestinaNegozio } from "@/lib/amministratore/negozi";

/**
 * Sposta un negozio nel Cestino (soft delete) — azione di piattaforma,
 * riservata agli amministratori. Può cestinare QUALSIASI negozio.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
  if (!(await utenteHaRuoli(user.id, ["admin"]))) {
    return apiError("FORBIDDEN", "Accesso riservato agli amministratori.", 403);
  }

  const { negozioId } = await context.params;

  try {
    await cestinaNegozio(negozioId, user.id);
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
