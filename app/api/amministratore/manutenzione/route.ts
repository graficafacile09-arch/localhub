import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

const MESSAGGIO_DEFAULT =
  "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";

export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const db = createAdminSupabaseClient();
  const { data, error: dbError } = await db
    .from("site_maintenance")
    .select("enabled, message, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (dbError || !data) {
    return apiError("READ_FAILED", "Impossibile leggere le impostazioni di manutenzione. Verifica che la migrazione sia stata applicata.", 500);
  }

  return apiOk({
    enabled: Boolean(data.enabled),
    message: String(data.message || MESSAGGIO_DEFAULT),
    updatedAt: data.updated_at,
  });
}

export async function PATCH(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.enabled !== "boolean" || typeof body.message !== "string") {
    return apiError("VALIDATION_ERROR", "Richiesta non valida: servono stato e messaggio.", 422);
  }

  const message = body.message.trim();
  if (message.length < 5 || message.length > 500) {
    return apiError("VALIDATION_ERROR", "Il messaggio deve contenere da 5 a 500 caratteri.", 422);
  }

  const db = createAdminSupabaseClient();
  const { data, error: dbError } = await db
    .from("site_maintenance")
    .update({
      enabled: body.enabled,
      message,
      updated_at: new Date().toISOString(),
      updated_by: sessione.user.id,
    })
    .eq("id", 1)
    .select("enabled, message, updated_at")
    .single();

  if (dbError || !data) {
    return apiError("UPDATE_FAILED", "Salvataggio non riuscito. Verifica che la migrazione sia stata applicata.", 500);
  }

  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.IMPOSTAZIONI_MODIFICATE,
    targetType: TARGET_TYPES.IMPOSTAZIONI,
    targetId: "site_maintenance",
    targetName: "Modalità manutenzione sito",
    result: "success",
    detail: { enabled: Boolean(data.enabled) },
  });

  return apiOk({
    enabled: Boolean(data.enabled),
    message: String(data.message),
    updatedAt: data.updated_at,
  });
}
