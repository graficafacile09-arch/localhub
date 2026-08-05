import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { applyTemplateToStore } from "@/lib/merchant/template-store";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ negozioId: string; templateId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, templateId } = await context.params;
  const supabase = createAdminSupabaseClient();

  const { data: store, error: storeErr } = await supabase
    .from("negozi")
    .select("owner_user_id")
    .eq("id", negozioId)
    .single();

  if (storeErr || !store) {
    return apiError("NOT_FOUND", "Negozio non trovato.", 404);
  }

  if (store.owner_user_id !== user.id) {
    return apiError("FORBIDDEN", "Non sei autorizzato a modificare questo negozio.", 403);
  }

  try {
    await applyTemplateToStore(negozioId, templateId);
    return apiOk({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return apiError("APPLY_FAILED", message, 500);
  }
}
