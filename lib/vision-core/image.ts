import sharp from "sharp";

/**
 * Pipeline immagine condivisa.
 *
 * Copia controllata della catena sharp usata dalla route
 * app/api/merchant/stores/[negozioId]/products/vision/route.ts.
 * Parità byte per byte verificata da tests/vision-core-parity.spec.mjs.
 */
export const CROP_SIZE = 640;
export const NO_CROP_MAX_DIM = 1024;
export const JPEG_QUALITY = 80;
export const PROVIDER_MIME = "image/jpeg";

export type ProcessedImage = {
  data: Buffer;
  width: number;
  height: number;
};

export async function processImageBuffer(
  input: Buffer,
  crop = false
): Promise<ProcessedImage> {
  if (crop) {
    const result = await sharp(input)
      .resize(CROP_SIZE, CROP_SIZE, {
        fit: "cover",
        position: "attention",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      data: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  }

  const result = await sharp(input)
    .resize(NO_CROP_MAX_DIM, NO_CROP_MAX_DIM, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height,
  };
}

export function toBase64(data: Buffer): string {
  return data.toString("base64");
}

export function isImageBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}
