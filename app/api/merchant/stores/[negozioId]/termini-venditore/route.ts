import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const VERSIONE_TERMINI = "2026-09-v1";

export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const { negozioId } = await context.params;
  if (!(await canManageStore(sessione.user.id, negozioId))) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("venditori_termini_accettazioni")
    .select("id, versione, accettato_at")
    .eq("negozio_id", negozioId)
    .eq("user_id", sessione.user.id)
    .eq("versione", VERSIONE_TERMINI)
    .maybeSingle();

  if (error) {
    console.error("[termini-venditore] GET:", error);
    return apiError("FETCH_FAILED", "Impossibile verificare l'accettazione dei termini.", 500);
  }

  return apiOk({ versione: VERSIONE_TERMINI, accettati: Boolean(data), accettazione: data });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const { negozioId } = await context.params;
  if (!(await canManageStore(sessione.user.id, negozioId))) {
    return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
  }

  const body = (await request.json().catch(() => ({}))) as { accetta?: boolean; versione?: string };
  if (body.accetta !== true || (body.versione && body.versione !== VERSIONE_TERMINI)) {
    return apiError("VALIDATION_ERROR", "È necessario accettare la versione corrente dei termini.", 422);
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("venditori_termini_accettazioni")
    .upsert(
      { negozio_id: negozioId, user_id: sessione.user.id, versione: VERSIONE_TERMINI, accettato_at: new Date().toISOString() },
      { onConflict: "negozio_id,user_id,versione" }
    )
    .select("id, versione, accettato_at")
    .single();

  if (error) {
    console.error("[termini-venditore] POST:", error);
    return apiError("SAVE_FAILED", "Impossibile registrare l'accettazione dei termini.", 500);
  }

  return apiOk({ versione: VERSIONE_TERMINI, accettati: true, accettazione: data });
}
