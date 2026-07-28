import { apiError, apiOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const BUCKET = "store-images";
const MAX_IMAGES = 12;
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isDataUrl(value: string): boolean {
  return /^data:image\/\w+;base64,/.test(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const body = (await request.json()) as { image?: string; name?: string };
  const dataUrl = body.image?.trim();

  if (!dataUrl || !isDataUrl(dataUrl)) {
    return apiError("INVALID_BODY", "Formato immagine non valido. Accettato: data URL.", 422);
  }

  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) return apiError("INVALID_BODY", "Formato data URL immagine non valido.", 422);

  const mimeType = matches[1];
  const base64Data = matches[2];

  if (!ALLOWED_MIMES.has(mimeType)) {
    return apiError(
      "INVALID_FORMAT",
      "Formato non supportato. Usa JPG, PNG o WebP.",
      422
    );
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    const maxMB = (MAX_BYTES / (1024 * 1024)).toFixed(0);
    return apiError(
      "FILE_TOO_LARGE",
      `L'immagine supera i ${maxMB} MB. Comprimi o riduci la dimensione.`,
      422
    );
  }

  const supabaseServer = await createServerSupabaseClient();
  const { data: storeRow } = await supabaseServer
    .from("negozi")
    .select("galleria")
    .eq("id", negozioId)
    .single();

  const currentCount = Array.isArray(storeRow?.galleria) ? storeRow.galleria.length : 0;
  if (currentCount >= MAX_IMAGES) {
    return apiError(
      "GALLERY_FULL",
      `Hai raggiunto il limite di ${MAX_IMAGES} immagini nella galleria.`,
      422
    );
  }

  const extension = mimeType.split("/")[1] || "jpg";
  const folder = body.name?.trim() || "gallery";
  const fileName = `${negozioId}/${folder}/${crypto.randomUUID()}.${extension}`;

  const supabase = createAdminSupabaseClient();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    const msg = (uploadError.message ?? "").toLowerCase();
    if (msg.includes("bucket") || msg.includes("not found") || msg.includes("does not exist")) {
      const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
      if (createErr) return apiError("STORAGE_INIT", createErr.message ?? "Impossibile creare il bucket.", 500);

      const { error: retryErr } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, buffer, { contentType: mimeType, upsert: false });
      if (retryErr) return apiError("UPLOAD_FAILED", retryErr.message ?? "Upload fallito.", 500);
    } else {
      return apiError("UPLOAD_FAILED", uploadError.message ?? "Upload fallito.", 500);
    }
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);

  return apiOk({ url: urlData.publicUrl });
}
