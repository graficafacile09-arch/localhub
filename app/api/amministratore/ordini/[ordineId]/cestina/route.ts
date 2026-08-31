import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { cestinaOrdineAdmin } from "@/lib/amministratore/ordini";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

/**
 * Sposta un ordine nel Cestino (soft delete) — azione di piattaforma,
 * riservata alla sessione admin. Può cestinare QUALSIASI ordine.
 * L'ordine NON viene cancellato fisicamente: resta nel Cestino.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { ordineId } = await context.params;

  // Recupera numero/negozio ordine prima del cestinamento per il log
  const db = createAdminSupabaseClient();
  const { data: ordine } = await db
    .from("ordini")
    .select("numero, negozio_nome, negozio_id")
    .eq("id", ordineId)
    .single();

  try {
    await cestinaOrdineAdmin(ordineId, sessione.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("TRASH_FAILED", message, 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.ORDINE_CESTINATO,
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

  return apiOk({ trashed: true, ordineId });
}