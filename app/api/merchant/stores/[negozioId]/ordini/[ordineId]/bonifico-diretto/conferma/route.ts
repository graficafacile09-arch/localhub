import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { inviaEmailConfermaBonificoDiretto } from "@/lib/cliente/ordine-email";

export async function POST(
  _request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const { negozioId, ordineId } = await context.params;

  const db = createAdminSupabaseClient();
  const { data, error: rpcError } = await db.rpc("conferma_bonifico_diretto", {
    p_ordine_id: ordineId,
    p_negozio_id: negozioId,
    p_merchant_user_id: sessione.user.id,
  });

  if (rpcError) {
    console.error("[bonifico-diretto] conferma RPC:", rpcError.message);
    return apiError("SAVE_FAILED", "Impossibile confermare il pagamento.", 500);
  }
  const esito = (data ?? {}) as { ok?: boolean; codice?: string; messaggio?: string; cambiato?: boolean };
  if (esito.ok !== true) {
    const status = esito.codice === "FORBIDDEN" ? 403 : esito.codice === "ORDINE_NON_TROVATO" ? 404 : 409;
    return apiError(esito.codice ?? "CONFIRM_FAILED", esito.messaggio ?? "Conferma non consentita.", status);
  }

  await inviaEmailConfermaBonificoDiretto(ordineId).catch(() => {});
  revalidatePath(`/merchant/${negozioId}/ordini/${ordineId}`);
  revalidatePath(`/merchant/${negozioId}/ordini`);
  revalidatePath(`/cliente/ordini/${ordineId}`);
  revalidatePath(`/ordini/conferma/${ordineId}`);
  return apiOk({ cambiato: esito.cambiato === true });
}
