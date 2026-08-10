import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { getReclamiVenditore } from "@/lib/ordine-reclami";

/**
 * GET /api/merchant/stores/[negozioId]/ordini/[ordineId]/reclami
 *
 * Reclami degli ordini del negozio, SOLO per il venditore proprietario
 * (ownership server-side: canManageStore + filtro negozio_id + ordine_id).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, ordineId } = await context.params;

  try {
    const reclami = await getReclamiVenditore(user.id, negozioId, ordineId);
    return apiOk({ reclami });
  } catch (err) {
    console.error("[api-merchant-reclami] GET:", (err as Error)?.message);
    return apiError("RECLAMI_READ_FAILED", "Impossibile caricare i reclami.", 500);
  }
}
