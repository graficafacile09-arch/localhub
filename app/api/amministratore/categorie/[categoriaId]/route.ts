import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Aggiornamento di una categoria (nome, slug, sinonimi, ordine, attivo). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoriaId: string }> }
) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const { categoriaId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const db = createAdminSupabaseClient();

  const { data: esistente, error: erroreEsistente } = await db
    .from("categorie")
    .select("id")
    .eq("id", categoriaId)
    .single();
  if (erroreEsistente || !esistente) {
    return apiError("NOT_FOUND", "Categoria non trovata.", 404);
  }

  const payload: Record<string, unknown> = {};

  if ("nome" in body) {
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!nome) {
      return apiError("VALIDATION_ERROR", "Il nome della categoria è obbligatorio.", 422);
    }
    payload.nome = nome;
  }

  if ("slug" in body) {
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!SLUG_REGEX.test(slug)) {
      return apiError(
        "VALIDATION_ERROR",
        "Slug non valido: usa solo minuscole, numeri e trattini (es. panificio, tech-elettronica).",
        422
      );
    }
    payload.slug = slug;
  }

  if ("sinonimi" in body) {
    if (!Array.isArray(body.sinonimi)) {
      return apiError("VALIDATION_ERROR", "I sinonimi devono essere un elenco di testi.", 422);
    }
    payload.sinonimi = body.sinonimi
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);
  }

  if ("ordine" in body) {
    if (typeof body.ordine !== "number") {
      return apiError("VALIDATION_ERROR", "L'ordine deve essere un numero.", 422);
    }
    payload.ordine = body.ordine;
  }

  if ("attivo" in body) {
    if (typeof body.attivo !== "boolean") {
      return apiError("VALIDATION_ERROR", "attivo deve essere booleano.", 422);
    }
    payload.attivo = body.attivo;
  }

  if (Object.keys(payload).length === 0) {
    return apiError("VALIDATION_ERROR", "Nessun campo da aggiornare.", 422);
  }

  const { data, error: erroreUpdate } = await db
    .from("categorie")
    .update(payload)
    .eq("id", categoriaId)
    .select("*")
    .single();

  if (erroreUpdate) {
    if (String(erroreUpdate.message ?? "").toLowerCase().includes("duplicate")) {
      return apiError("SLUG_DUPLICATO", "Esiste già una categoria con questo slug.", 409);
    }
    return apiError("UPDATE_FAILED", erroreUpdate.message ?? "Impossibile aggiornare la categoria.", 500);
  }

  revalidatePath("/amministratore/categorie");
  revalidatePath("/categorie");
  revalidatePath("/");
  revalidatePath("/negozi");

  return apiOk({ categoria: data });
}
