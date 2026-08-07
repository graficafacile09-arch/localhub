import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { utenteAdminAutorizzato } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canManageStore } from "@/lib/merchant/data";

const STORAGE_BUCKET = "store-images";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  // L'admin AUTORIZZATO legge i media di QUALSIASI negozio (bypass RLS).
  const supabase =
    (await utenteAdminAutorizzato(user.id, user.email ?? ""))
      ? createAdminSupabaseClient()
      : await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("media")
    .select("*")
    .eq("negozio_id", negozioId)
    .order("created_at", { ascending: false });

  if (error) {
    return apiError("FETCH_FAILED", error.message ?? "Impossibile caricare i media.", 500);
  }

  return apiOk({ media: data });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error } = await requireApiArea("merchant");
  if (error) return error;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return apiError("MISSING_FILE", "Nessun file inviato.", 422);
  }

  const maxSize = 4 * 1024 * 1024;
  if (file.size > maxSize) {
    return apiError("FILE_TOO_LARGE", "Il file non può superare 4 MB.", 413);
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return apiError("INVALID_TYPE", "Formato non supportato. Usa JPEG, PNG, WebP, GIF o SVG.", 422);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `${negozioId}/${fileName}`;

  const admin = createAdminSupabaseClient();

  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    const msg = (uploadError.message ?? "").toLowerCase();
    if (msg.includes("bucket") || msg.includes("not found") || msg.includes("does not exist")) {
      const { error: createErr } = await admin.storage.createBucket(STORAGE_BUCKET, { public: true });
      if (createErr) return apiError("STORAGE_INIT", createErr.message ?? "Impossibile creare il bucket di storage.", 500);

      const { error: retryErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        });
      if (retryErr) return apiError("UPLOAD_FAILED", retryErr.message ?? "Impossibile caricare il file.", 500);
    } else {
      return apiError("UPLOAD_FAILED", uploadError.message ?? "Impossibile caricare il file.", 500);
    }
  }

  const { data: urlData } = admin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  const publicUrl = urlData.publicUrl;

  let width: number | null = null;
  let height: number | null = null;

  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // ignore
    }
  }

  const { data: mediaRecord, error: dbError } = await admin
    .from("media")
    .insert({
      negozio_id: negozioId,
      file_path: filePath,
      public_url: publicUrl,
      nome: file.name,
      mime_type: file.type,
      file_size: file.size,
      width,
      height,
    })
    .select()
    .single();

  if (dbError) {
    await admin.storage.from(STORAGE_BUCKET).remove([filePath]);
    return apiError("DB_FAILED", dbError.message ?? "Impossibile salvare il record.", 500);
  }

  return apiOk({ media: mediaRecord }, 201);
}
