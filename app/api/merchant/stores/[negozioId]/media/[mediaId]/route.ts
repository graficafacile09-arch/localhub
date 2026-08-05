import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canManageStore } from "@/lib/merchant/data";

const STORAGE_BUCKET = "store-images";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ negozioId: string; mediaId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId, mediaId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const admin = createAdminSupabaseClient();

  const { data: record, error: findError } = await admin
    .from("media")
    .select("*")
    .eq("id", mediaId)
    .eq("negozio_id", negozioId)
    .single();

  if (findError || !record) {
    return apiError("NOT_FOUND", "Media non trovato.", 404);
  }

  const { error: storageError } = await admin.storage
    .from(STORAGE_BUCKET)
    .remove([record.file_path]);

  if (storageError) {
    return apiError("STORAGE_DELETE_FAILED", storageError.message ?? "Impossibile eliminare il file dallo storage.", 500);
  }

  const { error: dbError } = await admin
    .from("media")
    .delete()
    .eq("id", mediaId);

  if (dbError) {
    return apiError("DB_DELETE_FAILED", dbError.message ?? "Impossibile eliminare il record dal database.", 500);
  }

  return apiOk({ deleted: true });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ negozioId: string; mediaId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId, mediaId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const body = (await request.json()) as { nome?: string; alt_text?: string };
  const payload: Record<string, unknown> = {};

  if ("nome" in body) {
    if (!body.nome || !body.nome.trim()) {
      return apiError("VALIDATION_ERROR", "Il nome non può essere vuoto.", 422);
    }
    payload.nome = body.nome.trim();
  }

  if ("alt_text" in body) {
    payload.alt_text = body.alt_text ?? "";
  }

  if (Object.keys(payload).length === 0) {
    return apiError("INVALID_BODY", "Nessun campo da aggiornare.", 422);
  }

  const admin = createAdminSupabaseClient();

  const { data, error } = await admin
    .from("media")
    .update(payload)
    .eq("id", mediaId)
    .eq("negozio_id", negozioId)
    .select()
    .single();

  if (error) {
    return apiError("UPDATE_FAILED", error.message ?? "Impossibile aggiornare il media.", 500);
  }

  return apiOk({ media: data });
}
