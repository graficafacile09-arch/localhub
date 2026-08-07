import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCategorieAdmin } from "@/lib/amministratore/categorie-queries";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validaSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) return null;
  return slug;
}

function validaSinonimi(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const sinonimi = value
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  return sinonimi;
}

/** Elenco categorie per il pannello Amministratore (attive e disattivate). */
export async function GET() {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const categorie = await getCategorieAdmin();
  return apiOk({ categorie });
}

/** Creazione di una nuova categoria (amministratore). */
export async function POST(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return apiError("VALIDATION_ERROR", "Il nome della categoria è obbligatorio.", 422);
  }

  const slug = validaSlug(body.slug);
  if (!slug) {
    return apiError(
      "VALIDATION_ERROR",
      "Slug non valido: usa solo minuscole, numeri e trattini (es. panificio, tech-elettronica).",
      422
    );
  }

  const sinonimi = validaSinonimi(body.sinonimi ?? []);
  if (!sinonimi) {
    return apiError("VALIDATION_ERROR", "I sinonimi devono essere un elenco di testi.", 422);
  }

  const db = getDb();
  if (!db) {
    return apiError("DB_UNAVAILABLE", "Database non disponibile.", 500);
  }

  const { data, error: erroreInsert } = await db
    .from("categorie")
    .insert({
      nome,
      slug,
      sinonimi,
      ordine: typeof body.ordine === "number" ? body.ordine : 0,
      attivo: typeof body.attivo === "boolean" ? body.attivo : true,
    })
    .select("*")
    .single();

  if (erroreInsert) {
    if (String(erroreInsert.message ?? "").toLowerCase().includes("duplicate")) {
      return apiError(
        "SLUG_DUPLICATO",
        "Esiste già una categoria con questo slug.",
        409
      );
    }
    return apiError("CREATE_FAILED", erroreInsert.message ?? "Impossibile creare la categoria.", 500);
  }

  revalidatePath("/amministratore/categorie");
  revalidatePath("/categorie");
  revalidatePath("/");
  revalidatePath("/negozi");

  return apiOk({ categoria: data }, 201);
}
