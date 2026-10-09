import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";

const MESSAGGIO_DEFAULT =
  "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";

const TABELLE = {
  production: "site_maintenance",
  preview: "site_maintenance_preview",
} as const;

type Target = keyof typeof TABELLE;

async function leggiStato(db: ReturnType<typeof createAdminSupabaseClient>, target: Target) {
  const { data, error } = await db
    .from(TABELLE[target])
    .select("enabled, message, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) throw new Error("Impossibile leggere le impostazioni di manutenzione.");
  return {
    enabled: Boolean(data.enabled),
    message: String(data.message || MESSAGGIO_DEFAULT),
    updatedAt: data.updated_at,
    table: TABELLE[target],
  };
}

export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  try {
    const db = createAdminSupabaseClient();
    const [production, preview] = await Promise.all([
      leggiStato(db, "production"),
      leggiStato(db, "preview"),
    ]);
    return apiOk({ production, preview });
  } catch {
    return apiError("READ_FAILED", "Impossibile leggere lo stato di manutenzione di produzione e anteprima.", 500);
  }
}

export async function PATCH(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    (body.target !== "production" && body.target !== "preview") ||
    typeof body.enabled !== "boolean" ||
    typeof body.message !== "string"
  ) {
    return apiError("VALIDATION_ERROR", "Richiesta non valida: specifica destinazione, stato e messaggio.", 422);
  }

  const target = body.target as Target;
  const message = body.message.trim();
  if (message.length < 5 || message.length > 500) {
    return apiError("VALIDATION_ERROR", "Il messaggio deve contenere da 5 a 500 caratteri.", 422);
  }

  const table = TABELLE[target];
  const db = createAdminSupabaseClient();
  const { data, error: dbError } = await db
    .from(table)
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
    return apiError("UPDATE_FAILED", `Salvataggio non riuscito per ${target === "production" ? "il sito pubblico" : "l'anteprima privata"}.`, 500);
  }

  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.IMPOSTAZIONI_MODIFICATE,
    targetType: TARGET_TYPES.IMPOSTAZIONI,
    targetId: table,
    targetName: target === "production" ? "Manutenzione sito pubblico" : "Manutenzione anteprima privata",
    result: "success",
    detail: { enabled: Boolean(data.enabled), target },
  });

  return apiOk({
    target,
    enabled: Boolean(data.enabled),
    message: String(data.message),
    updatedAt: data.updated_at,
    table,
  });
}
