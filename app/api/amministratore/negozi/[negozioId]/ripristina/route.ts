import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteHaRuoli } from "@/lib/auth/roles";
import { ripristinaNegozio } from "@/lib/amministratore/negozi";

/**
 * Ripristino di un negozio dal Cestino — ESCLUSIVAMENTE amministratore.
 * Il commerciante può eliminare il proprio negozio ma non ripristinarlo.
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
    await ripristinaNegozio(negozioId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("RESTORE_FAILED", message, 500);
  }

  revalidatePath("/amministratore/cestino");
  revalidatePath("/negozi");
  revalidatePath("/");

  return apiOk({ restored: true, storeId: negozioId });
}
