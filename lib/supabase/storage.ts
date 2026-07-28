import { createAdminSupabaseClient } from "./admin";

const BUCKET_NAME = "product-images";

function isDataUrl(value: string): boolean {
  return /^data:image\/\w+;base64,/.test(value);
}

export async function uploadDataUrlToStorage(
  dataUrl: string
): Promise<string> {
  if (!isDataUrl(dataUrl)) {
    return dataUrl;
  }

  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Formato data URL immagine non valido.");

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, "base64");
  const extension = mimeType.split("/")[1] || "jpg";
  const fileName = `${crypto.randomUUID()}.${extension}`;

  const supabase = createAdminSupabaseClient();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    const msg = (uploadError.message ?? "").toLowerCase();
    if (msg.includes("bucket") || msg.includes("not found") || msg.includes("does not exist")) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
      });
      if (createError) throw createError;

      const { error: retryError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, buffer, { contentType: mimeType, upsert: false });
      if (retryError) throw retryError;
    } else {
      throw uploadError;
    }
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}

function extractStoragePath(publicUrl: string): string | null {
  const expectedPrefix = `/object/public/${BUCKET_NAME}/`;
  const idx = publicUrl.indexOf(expectedPrefix);
  if (idx === -1) return null;
  return publicUrl.slice(idx + expectedPrefix.length).split("?")[0];
}

export async function deleteImageFromStorage(
  imageUrl: string | null | undefined
): Promise<void> {
  if (!imageUrl) return;

  const supabase = createAdminSupabaseClient();
  const storagePath = extractStoragePath(imageUrl);

  if (!storagePath) return;

  await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
}
