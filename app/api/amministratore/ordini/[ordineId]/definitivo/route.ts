import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { eliminaOrdineDefinitivo } from "@/lib/amministratore/ordini";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/amministratore/ordini/[ordineId]/definitivo
 *
 * Elimina DEFINITIVAMENTE un ordine dal database — SOLO se è nel Cestino
 * (deleted_at non null). Azione distruttiva e irreversibile, riservata
 * ESCLUSIVAMENTE alla sessione admin (requireApiArea PRIMA di tutto).
 * Un ordine ancora attivo/non cestinato non viene MAI eliminato (409).
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { ordineId } = await context.params;
  if (!UUID_RE.test(ordineId)) {
    return apiError("VALIDATION_ERROR", "Id ordine non valido.", 422);
  }

  // Recupera numero/negozio + verifica che sia NEL Cestino prima di agire.
  const db = createAdminSupabaseClient();
  const { data: ordine } = await db
    .from("ordini")
    .select("numero, negozio_nome, negozio_id, deleted_at")
    .eq("id", ordineId)
    .single();

  if (!ordine) {
    return apiError("ORDINE_NON_TROVATO", "Ordine non trovato.", 404);
  }
  if (ordine.deleted_at === null) {
    return apiError(
      "ORDINE_NON_NEL_CESTINO",
      "L'ordine deve essere nel Cestino per essere eliminato definitivamente.",
      409
    );
  }

  try {
    await eliminaOrdineDefinitivo(ordineId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }

  // Registra attività (numero/negozio recuperati PRIMA della cancellazione).
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.ORDINE_ELIMINATO_DEFINITIVO,
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
  revalidatePath("/amministratore/attivita");

  return apiOk({ deleted: true, ordineId });
}
