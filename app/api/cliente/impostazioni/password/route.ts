import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MIN_PASSWORD = 6;

/**
 * POST /api/cliente/impostazioni/password
 *
 * Cambio password dell'Area Clienti.
 *
 * La password viene gestita ESCLUSIVAMENTE da Supabase Auth
 * (auth.updateUser): non viene mai letta né salvata nel DB applicativo.
 * La sessione corrente dell'utente autenticato è quella usata per la
 * modifica; le altre sessioni dell'account restano attive (comportamento
 * standard di updateUser) e la password viene verificata lato Auth.
 */
export async function POST(request: Request) {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;
  const user = sessione.user;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const password = typeof body.password === "string" ? body.password : "";
  const conferma = typeof body.conferma === "string" ? body.conferma : "";

  if (password.length < MIN_PASSWORD) {
    return apiError(
      "VALIDATION_ERROR",
      `La password deve essere di almeno ${MIN_PASSWORD} caratteri.`,
      422
    );
  }
  if (password !== conferma) {
    return apiError("VALIDATION_ERROR", "Le due password non coincidono.", 422);
  }

  const supabase = await createServerSupabaseClient();
  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    console.error(
      `[impostazioni-password] updateUser: user=${user.id} status=${updateError.status ?? "n/a"} message=${updateError.message}`
    );
    return apiError(
      "PASSWORD_UPDATE_FAILED",
      "Impossibile cambiare la password in questo momento. Riprova tra poco.",
      500
    );
  }

  return apiOk({ aggiornata: true });
}
