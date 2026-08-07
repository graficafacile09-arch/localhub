import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { èUtenteTest } from "@/lib/amministratore/utenti-queries";

const CAMPI_MODULO = ["owner_user_id", "in_evidenza", "attivo"] as const;
type CampoModulo = (typeof CAMPI_MODULO)[number];

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Aggiornamento atomico delle proprietà amministrative di un'attività. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { negozioId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const payload: Partial<Record<CampoModulo, string | boolean | null>> = {};
  if ("owner_user_id" in body) {
    if (body.owner_user_id !== null && !isUuid(body.owner_user_id)) {
      return apiError("VALIDATION_ERROR", "Proprietario non valido.", 422);
    }
    payload.owner_user_id = body.owner_user_id as string | null;
  }
  for (const campo of ["in_evidenza", "attivo"] as const) {
    if (campo in body) {
      if (typeof body[campo] !== "boolean") {
        return apiError("VALIDATION_ERROR", `${campo} deve essere booleano.`, 422);
      }
      payload[campo] = body[campo];
    }
  }

  if (Object.keys(payload).length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun campo da aggiornare.", 422);
  }

  const db = createAdminSupabaseClient();
  const { data: negozio, error: erroreNegozio } = await db
    .from("negozi")
    .select("id, deleted_at")
    .eq("id", negozioId)
    .single();
  if (erroreNegozio || !negozio) {
    return apiError("NOT_FOUND", "Attività non trovata.", 404);
  }
  if (negozio.deleted_at) {
    return apiError("INVALID_STATE", "Un'attività nel Cestino non può essere modificata.", 409);
  }

  if (payload.owner_user_id) {
    const { data: ruoliProprietario, error: erroreProprietario } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", payload.owner_user_id);
    const ruoli = (ruoliProprietario ?? []).map((riga) => String(riga.role));
    if (
      erroreProprietario ||
      !ruoli.includes("merchant") ||
      èUtenteTest(ruoli)
    ) {
      return apiError("VALIDATION_ERROR", "Il proprietario deve essere un commerciante valido.", 422);
    }
  }

  const { data, error: erroreUpdate } = await db
    .from("negozi")
    .update(payload)
    .eq("id", negozioId)
    .is("deleted_at", null)
    .select("id, owner_user_id, attivo, in_evidenza")
    .single();
  if (erroreUpdate || !data) {
    return apiError(
      "UPDATE_FAILED",
      erroreUpdate?.message ?? "Impossibile aggiornare l'attività.",
      500
    );
  }

  revalidatePath("/amministratore/attivita");
  revalidatePath("/amministratore");
  revalidatePath("/negozi");
  revalidatePath("/");

  return apiOk({ attivita: data });
}
