import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { ripristinaOrdineAdmin } from "@/lib/amministratore/ordini";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

/**
 * Ripristino di un ordine dal Cestino — riservato alla sessione admin.
 * Azzera deleted_at/deleted_by (stesso pattern di ripristinaNegozio()).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { ordineId } = await context.params;

  // Recupera numero/negozio ordine prima del ripristino per il log
  const db = createAdminSupabaseClient();
  const { data: ordine } = await db
    .from("ordini")
    .select("numero, negozio_nome, negozio_id")
    .eq("id", ordineId)
    .single();

  try {
    await ripristinaOrdineAdmin(ordineId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("RESTORE_FAILED", message, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.ORDINE_RIPRISTINATO,
    targetType: TARGET_TYPES.ORDINE,
    targetId: ordineId,
    targetName: ordine?.numero ?? ordineId,
    negozioId: String(ordine?.negozio_id ?? "") || null,
    negozioNome: ordine?.negozio_nome ?? null,
    result: "success",
  });

  revalidatePath("/amministratore/ordini");
  revalidatePath(`/amministratore/ordini/${ordineId}`);
  revalidatePath("/amministratore/cestino");

  return apiOk({ restored: true, ordineId });
}