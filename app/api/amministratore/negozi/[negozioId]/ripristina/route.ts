import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { ripristinaNegozio } from "@/lib/amministratore/negozi";

/**
 * Ripristino di un negozio dal Cestino — riservato alla sessione admin.
 * Il commerciante può eliminare il proprio negozio ma non ripristinarlo.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

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
