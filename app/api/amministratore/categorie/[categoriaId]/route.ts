import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registraAttivitaAdmin, OPERATION_TYPES, TARGET_TYPES } from "@/lib/amministratore/activity-log";
import { getConteggiNegoziPerCategoria } from "@/lib/negozi";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Aggiornamento di una categoria (nome, slug, sinonimi, ordine, attivo). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoriaId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { categoriaId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const db = createAdminSupabaseClient();

  const { data: esistente, error: erroreEsistente } = await db
    .from("categorie")
    .select("id, nome")
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

  if ("descrizione" in body) {
    if (body.descrizione !== null && body.descrizione !== undefined && typeof body.descrizione !== "string") {
      return apiError("VALIDATION_ERROR", "La descrizione deve essere testo.", 422);
    }
    payload.descrizione =
      body.descrizione === null || body.descrizione === undefined
        ? null
        : (body.descrizione as string).trim() || null;
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

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.CATEGORIA_MODIFICATA,
    targetType: TARGET_TYPES.CATEGORIA,
    targetId: categoriaId,
    targetName: (data as { nome: string }).nome ?? esistente.nome,
    result: "success",
    detail: { campi: Object.keys(payload).join(", "), nome_precedente: esistente.nome },
  });

  revalidatePath("/amministratore/categorie");
  revalidatePath("/categorie");
  revalidatePath("/");
  revalidatePath("/negozi");

  return apiOk({ categoria: data });
}

/** Eliminazione di una categoria. */
export async function DELETE(_request: Request, context: { params: Promise<{ categoriaId: string }> }) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const { categoriaId } = await context.params;

  const db = createAdminSupabaseClient();

  const { data: esistente, error: erroreEsistente } = await db
    .from("categorie")
    .select("*")
    .eq("id", categoriaId)
    .single();
  if (erroreEsistente || !esistente) {
    return apiError("NOT_FOUND", "Categoria non trovata.", 404);
  }

  // Protezione: una categoria usata da negozi ATTIVI non può essere eliminata.
  // Le categorie NON sono colonne FK: i negozi conservano la propria categoria
  // come testo e il matching usa nome+sinonimi (stesso criterio di conteggio
  // della piattaforma). Eliminarla lascerebbe negozi attivi fuori dalle pagine
  // categoria, quindi qui il conteggio attivo viene verificato lato SERVER.
  const categoriaRiga = esistente as unknown as {
    id: string;
    nome: string;
    slug: string;
    descrizione: string | null;
    icona: string | null;
    immagine: string | null;
    sinonimi: string[];
    ordine: number;
    attivo: boolean;
  };
  const conteggi = await getConteggiNegoziPerCategoria([
    {
      id: categoriaRiga.id,
      nome: categoriaRiga.nome,
      slug: categoriaRiga.slug,
      descrizione: categoriaRiga.descrizione,
      icona: categoriaRiga.icona,
      immagine: categoriaRiga.immagine,
      sinonimi: categoriaRiga.sinonimi,
      ordine: categoriaRiga.ordine,
      attivo: categoriaRiga.attivo,
    },
  ]);
  const negoziCollegati = conteggi.get(categoriaRiga.id) ?? 0;
  if (negoziCollegati > 0) {
    return apiError(
      "CATEGORIA_IN_USO",
      `Impossibile eliminare: la categoria è usata da ${negoziCollegati} ${negoziCollegati === 1 ? "negozio attivo" : "negozi attivi"}. Rimuovila prima dai negozi.`,
      422
    );
  }

  const { error: erroreDelete } = await db.from("categorie").delete().eq("id", categoriaId);
  if (erroreDelete) {
    return apiError("DELETE_FAILED", erroreDelete.message ?? "Impossibile eliminare la categoria.", 500);
  }

  // Registra attività
  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.CATEGORIA_ELIMINATA,
    targetType: TARGET_TYPES.CATEGORIA,
    targetId: categoriaId,
    targetName: esistente.nome,
    result: "success",
  });

  revalidatePath("/amministratore/categorie");
  revalidatePath("/categorie");
  revalidatePath("/");
  revalidatePath("/negozi");

  return apiOk({ successo: true });
}
