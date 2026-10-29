import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const DEFAULT_MESSAGE = "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";
const TABLE = process.env.VERCEL_ENV === "production" ? "site_maintenance" : "site_maintenance_preview";
const TARGET = process.env.VERCEL_ENV === "production" ? "production" : "preview";

export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;
  try {
    const { data, error: dbError } = await createAdminSupabaseClient()
      .from(TABLE).select("enabled, message, updated_at").eq("id", 1).single();
    if (dbError || !data) throw dbError ?? new Error("Stato non disponibile");
    return apiOk({ target: TARGET, enabled: Boolean(data.enabled), message: String(data.message || DEFAULT_MESSAGE), updatedAt: data.updated_at });
  } catch {
    return apiError("READ_FAILED", "Impossibile leggere lo stato di manutenzione.", 500);
  }
}

export async function PATCH(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;
  const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean") return apiError("VALIDATION_ERROR", "Stato non valido.", 422);
  const { data, error: dbError } = await createAdminSupabaseClient()
    .from(TABLE)
    .update({ enabled: body.enabled, updated_at: new Date().toISOString(), updated_by: sessione.user.id })
    .eq("id", 1).select("enabled, updated_at").single();
  if (dbError || !data) return apiError("UPDATE_FAILED", "Non è stato possibile aggiornare lo stato del sito.", 500);
  return apiOk({ target: TARGET, enabled: Boolean(data.enabled), updatedAt: data.updated_at });
}
