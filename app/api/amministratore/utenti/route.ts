import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/roles";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";
import { getUtenteAdminById } from "@/lib/amministratore/utenti-queries";

const RUOLI_DB = {
  amministratore: "admin",
  commerciante: "merchant",
  utente: "customer",
} as const;

type RuoloArea = keyof typeof RUOLI_DB;

function ruoloValido(value: unknown): value is RuoloArea {
  return value === "amministratore" || value === "commerciante" || value === "utente";
}

export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const confermaPassword = typeof body?.confermaPassword === "string" ? body.confermaPassword : "";
  const ruolo: RuoloArea = ruoloValido(body?.ruolo) ? body.ruolo : "utente";

  if (!nome || !email || !password) {
    return apiError("VALIDATION_ERROR", "Nome, email e password sono obbligatori.", 422);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return apiError("VALIDATION_ERROR", "Formato email non valido.", 422);
  }
  if (password.length < 8) {
    return apiError("VALIDATION_ERROR", "La password deve contenere almeno 8 caratteri.", 422);
  }
  if (password !== confermaPassword) {
    return apiError("VALIDATION_ERROR", "Le password non coincidono.", 422);
  }
  if (ruolo === "amministratore" && !isAdminEmail(email)) {
    return apiError("VALIDATION_ERROR", "Il ruolo amministratore è riservato all'account autorizzato.", 422);
  }

  const db = createAdminSupabaseClient();
  const { data: creato, error: erroreCreazione } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });

  if (erroreCreazione || !creato.user) {
    return apiError(
      "CREATE_FAILED",
      erroreCreazione?.message ?? "Impossibile creare l'utente.",
      422
    );
  }

  const userId = creato.user.id;
  const { error: erroreRuolo } = await db
    .from("user_roles")
    .insert({ user_id: userId, role: RUOLI_DB[ruolo] });

  if (erroreRuolo) {
    await db.auth.admin.deleteUser(userId);
    return apiError("ROLE_FAILED", erroreRuolo.message ?? "Impossibile assegnare il ruolo.", 422);
  }

  // Ritorna il record COMPLETO nella stessa forma della tabella (stessa
  // lettura getUtenteAdminById): la UI riceve lo stesso oggetto che
  // mostrerebbe dopo un refresh.
  const utente = await getUtenteAdminById(userId);
  if (!utente) {
    await db.auth.admin.deleteUser(userId);
    return apiError("CREATE_FAILED", "Utente creato ma non leggibile dal pannello.", 422);
  }

  // Registra l'attività (creazione account).
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.UTENTE_MODIFICATO,
    targetType: TARGET_TYPES.UTENTE,
    targetId: userId,
    targetName: email,
    result: "success",
    detail: { azione: "creato", ruolo },
  });

  return apiOk({ utente }, 201);
}
