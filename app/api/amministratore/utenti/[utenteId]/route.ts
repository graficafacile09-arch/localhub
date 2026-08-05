import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/roles";

const RUOLI_DB = {
  amministratore: "admin",
  commerciante: "merchant",
  utente: "customer",
} as const;

type RuoloArea = keyof typeof RUOLI_DB;

function ruoloValido(value: unknown): value is RuoloArea {
  return value === "amministratore" || value === "commerciante" || value === "utente";
}

async function adminRoute() {
  const result = await requireApiArea("admin");
  return result.error ? { error: result.error, db: null } : { error: null, db: createAdminSupabaseClient() };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ utenteId: string }> }
) {
  const { error, db } = await adminRoute();
  if (error || !db) return error;
  const { utenteId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Object.keys(body).length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun campo da aggiornare.", 422);
  }

  if ("ruolo" in body) {
    if (!ruoloValido(body.ruolo)) {
      return apiError("VALIDATION_ERROR", "Ruolo non valido.", 422);
    }
    const { data: user, error: userError } = await db.auth.admin.getUserById(utenteId);
    if (userError || !user.user) return apiError("NOT_FOUND", "Utente non trovato.", 404);
    if (isAdminEmail(user.user.email ?? "")) {
      return apiError("PROTECTED_USER", "L'account amministratore autorizzato non può cambiare ruolo.", 422);
    }
    if (body.ruolo === "amministratore" && !isAdminEmail(user.user.email ?? "")) {
      return apiError("VALIDATION_ERROR", "Il ruolo amministratore è riservato all'account autorizzato.", 422);
    }

    const { data: ruoliPrecedenti, error: letturaRuoliError } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", utenteId);
    if (letturaRuoliError) return apiError("ROLE_FAILED", letturaRuoliError.message, 422);

    const { error: deleteRoleError } = await db
      .from("user_roles")
      .delete()
      .eq("user_id", utenteId);
    if (deleteRoleError) return apiError("ROLE_FAILED", deleteRoleError.message, 422);

    const { error: insertRoleError } = await db
      .from("user_roles")
      .insert({ user_id: utenteId, role: RUOLI_DB[body.ruolo] });
    if (insertRoleError) {
      if (ruoliPrecedenti && ruoliPrecedenti.length > 0) {
        await db.from("user_roles").insert(
          ruoliPrecedenti.map((riga) => ({ user_id: utenteId, role: riga.role }))
        );
      }
      return apiError("ROLE_FAILED", insertRoleError.message, 422);
    }
  }

  if (body && "stato" in body) {
    if (body.stato !== "attivo" && body.stato !== "disattivato") {
      return apiError("VALIDATION_ERROR", "Stato non valido.", 422);
    }
    const { data: user, error: userError } = await db.auth.admin.getUserById(utenteId);
    if (userError || !user.user) return apiError("NOT_FOUND", "Utente non trovato.", 404);
    if (isAdminEmail(user.user.email ?? "")) {
      return apiError("PROTECTED_USER", "L'account amministratore autorizzato non può essere disattivato.", 422);
    }

    const { error: banError } = body.stato === "disattivato"
      ? await db.auth.admin.updateUserById(utenteId, { ban_duration: "876000h" })
      : await db.auth.admin.updateUserById(utenteId, { ban_duration: "none" });
    if (banError) return apiError("STATUS_FAILED", banError.message, 422);
  }

  return apiOk({ updated: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ utenteId: string }> }
) {
  const { error, db } = await adminRoute();
  if (error || !db) return error;
  const { utenteId } = await context.params;
  const { data: user, error: userError } = await db.auth.admin.getUserById(utenteId);
  if (userError || !user.user) return apiError("NOT_FOUND", "Utente non trovato.", 404);
  if (isAdminEmail(user.user.email ?? "")) {
    return apiError("PROTECTED_USER", "L'account amministratore autorizzato non può essere eliminato.", 422);
  }

  const { error: deleteError } = await db.auth.admin.deleteUser(utenteId);
  if (deleteError) return apiError("DELETE_FAILED", deleteError.message, 422);
  return apiOk({ deleted: true, userId: utenteId });
}
