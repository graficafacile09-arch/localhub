import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import {
  eliminaTuttiDalCestino,
  getNegoziCestino,
} from "@/lib/amministratore/negozi";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * Cestino GLOBALE della piattaforma — solo sessione admin.
 * L'area di sessione "admin" viene concessa solo all'admin autorizzato
 * (email + ruolo): qualsiasi altra sessione riceve 403.
 * Elenca tutti i negozi eliminati (soft delete), di qualunque proprietario.
 */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const stores = await getNegoziCestino();
    return apiOk({ stores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("FETCH_FAILED", message, 500);
  }
}

/**
 * Elimina DEFINITIVAMENTE tutti i negozi presenti nel Cestino.
 * Azione distruttiva e irreversibile, riservata ESCLUSIVAMENTE alla
 * sessione admin. Vengono eliminati SOLO i negozi con deleted_at non
 * null (mai un negozio attivo); il logging è coerente con l'eliminazione
 * singola (un'attività per negozio).
 */
export async function DELETE() {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const eliminati = await eliminaTuttiDalCestino();

    // Registra un'attività per ogni negozio eliminato (come la singola).
    for (const negozio of eliminati) {
      await registraAttivitaAdmin({
        adminUserId: sessione.user.id,
        adminEmail: sessione.user.email ?? "",
        operationType: OPERATION_TYPES.NEGOZIO_ELIMINATO_DEFINITIVO,
        targetType: TARGET_TYPES.NEGOZIO,
        targetId: negozio.id,
        targetName: negozio.nome ?? negozio.id,
        negozioId: negozio.id,
        negozioNome: negozio.nome,
        result: "success",
      });
    }

    revalidatePath("/amministratore/cestino");
    revalidatePath("/amministratore/attivita");
    revalidatePath("/negozi");
    revalidatePath("/");

    return apiOk({
      deleted: eliminati.length,
      storeIds: eliminati.map((n) => n.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("DELETE_FAILED", message, 500);
  }
}
