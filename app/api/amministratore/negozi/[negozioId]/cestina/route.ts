import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { cestinaNegozio } from "@/lib/amministratore/negozi";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

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

  // Recupera nome negozio prima del cestinamento per il log
  const db = createAdminSupabaseClient();
  const { data: negozio } = await db
    .from("negozi")
    .select("nome")
    .eq("id", negozioId)
    .single();

  try {
    await cestinaNegozio(negozioId, sessione.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("TRASH_FAILED", message, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.NEGOZIO_CESTINATO,
    targetType: TARGET_TYPES.NEGOZIO,
    targetId: negozioId,
    targetName: negozio?.nome ?? negozioId,
    negozioId,
    negozioNome: negozio?.nome ?? null,
    result: "success",
  });

  revalidatePath("/amministratore/cestino");
  revalidatePath("/amministratore/attivita");
  revalidatePath("/negozi");
  revalidatePath("/");

  return apiOk({ trashed: true, storeId: negozioId });
}
