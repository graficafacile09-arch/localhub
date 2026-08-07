import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { eliminaDefinitivamenteNegozio } from "@/lib/amministratore/negozi";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

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
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { negozioId } = await context.params;

  // Recupera nome negozio prima dell'eliminazione per il log
  const db = createAdminSupabaseClient();
  const { data: negozio } = await db
    .from("negozi")
    .select("nome")
    .eq("id", negozioId)
    .single();

  try {
    await eliminaDefinitivamenteNegozio(negozioId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.NEGOZIO_ELIMINATO_DEFINITIVO,
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

  return apiOk({ deleted: true, storeId: negozioId });
}