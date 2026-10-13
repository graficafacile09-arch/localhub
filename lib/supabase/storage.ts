import sharp from "sharp";
import { createAdminSupabaseClient } from "./admin";

const DEFAULT_BUCKET = "product-images";

function isDataUrl(value: string): boolean {
  return /^data:image\/\w+;base64,/.test(value);
}

export async function uploadDataUrlToStorage(
  dataUrl: string,
  bucketName: string = DEFAULT_BUCKET
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
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    const msg = (uploadError.message ?? "").toLowerCase();
    if (msg.includes("bucket") || msg.includes("not found") || msg.includes("does not exist")) {
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
      });
      if (createError) throw createError;

      const { error: retryError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, buffer, { contentType: mimeType, upsert: false });
      if (retryError) throw retryError;
    } else {
      throw uploadError;
    }
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}

/**
 * Upload di una foto prodotto: limite 2 MiB sul file originale e
 * normalizzazione automatica WebP per contenere storage e traffico.
 * Gli URL esterni già pronti non vengono scaricati né trasformati.
 */
export async function uploadProductImageDataUrlToStorage(
  dataUrl: string,
  bucketName: string = DEFAULT_BUCKET
): Promise<string> {
  if (!isDataUrl(dataUrl)) return dataUrl;

  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Formato data URL immagine non valido.");

  const original = Buffer.from(matches[2], "base64");
  const maxBytes = 2 * 1024 * 1024;
  if (original.byteLength > maxBytes) {
    throw new Error("La foto supera il limite di 2 MB. Riduci le dimensioni del file e riprova.");
  }

  const optimized = await sharp(original, { failOn: "error" })
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const fileName = `${crypto.randomUUID()}.webp`;
  const supabase = createAdminSupabaseClient();
  const upload = () => supabase.storage.from(bucketName).upload(fileName, optimized, {
    contentType: "image/webp",
    upsert: false,
  });

  let { error: uploadError } = await upload();
  if (uploadError) {
    const msg = (uploadError.message ?? "").toLowerCase();
    if (msg.includes("bucket") || msg.includes("not found") || msg.includes("does not exist")) {
      const { error: createError } = await supabase.storage.createBucket(bucketName, { public: true });
      if (createError) throw createError;
      ({ error: uploadError } = await upload());
    }
  }
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}

function extractStoragePath(publicUrl: string, bucketName: string): string | null {
  const expectedPrefix = `/object/public/${bucketName}/`;
  const idx = publicUrl.indexOf(expectedPrefix);
  if (idx === -1) return null;
  return publicUrl.slice(idx + expectedPrefix.length).split("?")[0];
}

export async function deleteImageFromStorage(
  imageUrl: string | null | undefined,
  bucketName: string = DEFAULT_BUCKET
): Promise<void> {
  if (!imageUrl) return;

  const supabase = createAdminSupabaseClient();
  const storagePath = extractStoragePath(imageUrl, bucketName);

  if (!storagePath) return;

  await supabase.storage.from(bucketName).remove([storagePath]);
}
