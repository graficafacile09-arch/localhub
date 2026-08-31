import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { eliminaOrdiniDalCestino, getOrdiniCestino } from "@/lib/amministratore/ordini";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * GET /api/amministratore/ordini/cestino
 *
 * Elenco degli ordini nel Cestino (soft deleted), SOLO sessione admin.
 * È il complemento della gestione ordini: dopo l'eliminazione (soft delete)
 * l'ordine resta recuperabile qui e da /amministratore/cestino.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const ordini = await getOrdiniCestino();
    return apiOk({ ordini });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("CESTINO_ORDINI_READ_FAILED", message, 500);
  }
}

/**
 * DELETE /api/amministratore/ordini/cestino
 *
 * Svuota il Cestino ordini: elimina DEFINITIVAMENTE TUTTI gli ordini con
 * deleted_at non null (mai un ordine attivo). Azione distruttiva e
 * irreversibile, riservata ESCLUSIVAMENTE alla sessione admin; il logging
 * è coerente con l'eliminazione singola (un'attività per ordine).
 */
export async function DELETE() {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const eliminati = await eliminaOrdiniDalCestino();

    // Registra un'attività per ogni ordine eliminato definitivamente.
    for (const ordine of eliminati) {
      await registraAttivitaAdmin({
        adminUserId: sessione.user.id,
        adminEmail: sessione.user.email ?? "",
        operationType: OPERATION_TYPES.ORDINE_ELIMINATO_DEFINITIVO,
        targetType: TARGET_TYPES.ORDINE,
        targetId: ordine.id,
        targetName: ordine.numero ?? ordine.id,
        result: "success",
      });
    }

    revalidatePath("/amministratore/ordini");
    revalidatePath("/amministratore/cestino");
    revalidatePath("/amministratore/attivita");

    return apiOk({
      deleted: eliminati.length,
      ordineIds: eliminati.map((o) => o.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }
}