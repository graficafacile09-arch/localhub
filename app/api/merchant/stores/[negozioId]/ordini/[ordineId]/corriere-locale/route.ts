import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

async function requireMerchantStore(userId: string, negozioId: string) {
  const result = await getMerchantStoreForUser(userId, negozioId);
  if (!result.data) return null;
  return result.data;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const { negozioId, ordineId } = await context.params;
  const store = await requireMerchantStore(sessione.user.id, negozioId);
  if (!store) return apiError("FORBIDDEN", "Non hai accesso a questo negozio.", 403);

  const admin = createAdminSupabaseClient();
  const { data: ordine } = await admin
    .from("ordini")
    .select("id,negozio_id,modalita,spedizione_carrier,spedizione_servizio,stato,stato_spedizione")
    .eq("id", ordineId)
    .eq("negozio_id", negozioId)
    .maybeSingle();

  if (!ordine) return apiError("NOT_FOUND", "Ordine non trovato.", 404);
  if (ordine.modalita !== "spedizione" || ordine.spedizione_carrier !== "locale" || ordine.spedizione_servizio !== "locale") {
    return apiError("NOT_LOCAL_DELIVERY", "Questo ordine non utilizza il corriere locale.", 422);
  }

  const [{ data: couriers, error: courierError }, { data: delivery }] = await Promise.all([
    admin.from("user_roles").select("user_id").eq("role", "courier"),
    admin.from("corrieri_locali").select("corriere_user_id,stato,assegnata_at").eq("ordine_id", ordineId).maybeSingle(),
  ]);
  if (courierError) return apiError("COURIER_READ_ERROR", "Impossibile leggere i corrieri approvati.", 500);

  const courierIds = (couriers ?? []).map((row) => row.user_id);
  const approvals = courierIds.length
    ? await admin.from("account_approvazioni").select("user_id").in("user_id", courierIds).eq("stato", "approved")
    : { data: [], error: null };
  if (approvals.error) return apiError("COURIER_READ_ERROR", "Impossibile leggere i corrieri approvati.", 500);

  const approvedIds = new Set((approvals.data ?? []).map((row) => row.user_id));
  const { data: users } = approvedIds.size
    ? await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    : { data: { users: [] } };
  const userMap = new Map((users?.users ?? []).map((user) => [user.id, user]));

  return apiOk({
    ordine: { stato: ordine.stato, statoSpedizione: ordine.stato_spedizione },
    consegna: delivery ?? { corriere_user_id: null, stato: "da_assegnare", assegnata_at: null },
    corrieri: [...approvedIds].map((userId) => ({
      userId,
      nome:
        userMap.get(userId)?.user_metadata?.nome ??
        userMap.get(userId)?.user_metadata?.first_name ??
        (userMap.get(userId)?.user_metadata?.full_name ?? "").trim().split(/\\s+/)[0] ?? "",
      cognome:
        userMap.get(userId)?.user_metadata?.cognome ??
        userMap.get(userId)?.user_metadata?.last_name ??
        (userMap.get(userId)?.user_metadata?.full_name ?? "").trim().split(/\\s+/).slice(1).join(" ") ?? "",
      email: userMap.get(userId)?.email ?? "",
    })),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string; ordineId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const { negozioId, ordineId } = await context.params;
  const store = await requireMerchantStore(sessione.user.id, negozioId);
  if (!store) return apiError("FORBIDDEN", "Non hai accesso a questo negozio.", 403);

  const body = await request.json().catch(() => null);
  const corriereUserId =
    typeof body?.corriereUserId === "string" && body.corriereUserId.trim()
      ? body.corriereUserId.trim()
      : null;

  const admin = createAdminSupabaseClient();
  const { data: ordine } = await admin
    .from("ordini")
    .select("id,negozio_id,modalita,spedizione_carrier,spedizione_servizio,stato,stato_spedizione")
    .eq("id", ordineId)
    .eq("negozio_id", negozioId)
    .maybeSingle();

  if (!ordine) return apiError("NOT_FOUND", "Ordine non trovato.", 404);
  if (ordine.modalita !== "spedizione" || ordine.spedizione_carrier !== "locale" || ordine.spedizione_servizio !== "locale") {
    return apiError("NOT_LOCAL_DELIVERY", "Questo ordine non utilizza il corriere locale.", 422);
  }

  const { data: delivery } = await admin
    .from("corrieri_locali")
    .select("stato")
    .eq("ordine_id", ordineId)
    .maybeSingle();
  if (delivery && ["consegnata", "annullata"].includes(delivery.stato)) {
    return apiError("FINAL_STATE", "La consegna è già in uno stato finale.", 409);
  }

  if (!corriereUserId) {
    const now = new Date().toISOString();
    const { error: deliveryError } = await admin
      .from("corrieri_locali")
      .upsert(
        { ordine_id: ordineId, corriere_user_id: null, stato: "da_assegnare", assegnata_at: null, updated_at: now },
        { onConflict: "ordine_id" }
      );
    if (deliveryError) return apiError("ASSIGNMENT_ERROR", "Impossibile rimuovere l'assegnazione.", 500);
    const { error: orderError } = await admin.from("ordini").update({ stato_spedizione: "non_affidata", updated_at: now }).eq("id", ordineId);
    if (orderError) return apiError("ASSIGNMENT_ERROR", "Impossibile sincronizzare lo stato della spedizione.", 500);
    revalidatePath(`/merchant/${negozioId}/ordini`);
    revalidatePath(`/merchant/${negozioId}/ordini/${ordineId}`);
    return apiOk({ stato: "da_assegnare", corriereUserId: null });
  }

  const [{ data: role }, { data: approval }, { data: courierUser }] = await Promise.all([
    admin.from("user_roles").select("user_id").eq("user_id", corriereUserId).eq("role", "courier").maybeSingle(),
    admin.from("account_approvazioni").select("user_id").eq("user_id", corriereUserId).eq("stato", "approved").maybeSingle(),
    admin.auth.admin.getUserById(corriereUserId),
  ]);
  if (!role || !approval || !courierUser?.user) {
    return apiError("COURIER_NOT_APPROVED", "Il corriere selezionato non è approvato.", 422);
  }

  const now = new Date().toISOString();
  const { error: deliveryError } = await admin
    .from("corrieri_locali")
    .upsert(
      { ordine_id: ordineId, corriere_user_id: corriereUserId, stato: "assegnata", assegnata_at: now, updated_at: now },
      { onConflict: "ordine_id" }
    );
  if (deliveryError) return apiError("ASSIGNMENT_ERROR", "Impossibile affidare la consegna.", 500);

  const { error: orderError } = await admin.from("ordini").update({ stato_spedizione: "affidata", updated_at: now }).eq("id", ordineId);
  if (orderError) return apiError("ASSIGNMENT_ERROR", "Assegnazione salvata ma stato spedizione non sincronizzato.", 500);

  revalidatePath(`/merchant/${negozioId}/ordini`);
  revalidatePath(`/merchant/${negozioId}/ordini/${ordineId}`);
  return apiOk({ stato: "assegnata", corriereUserId });
}
