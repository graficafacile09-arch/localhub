import sharp from "sharp";

/**
 * Average hash 64 bit dell'immagine, base della cache vision.
 *
 * Copia controllata delle funzioni private di
 * lib/product-assistant/vision-cache.ts. La parità è verificata da
 * tests/vision-core-parity.spec.mjs contro computeAverageHash() esportata
 * (solo export aggiunto, nessun cambio di comportamento).
 */
export async function computeAverageHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = data;
  if (pixels.length === 0) return "0".repeat(16);

  const sum = pixels.reduce((a, b) => a + b, 0);
  const avg = sum / pixels.length;

  let bits = "";
  for (let i = 0; i < pixels.length; i++) {
    bits += pixels[i] > avg ? "1" : "0";
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return hex;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

export function hexToBitString(hex: string): string {
  let bits = "";
  for (let i = 0; i < hex.length; i++) {
    const val = parseInt(hex[i], 16);
    bits += val.toString(2).padStart(4, "0");
  }
  return bits;
}

export const CACHE_HAMMING_THRESHOLD = 4;

export function isCacheMatch(hashA: string, hashB: string): boolean {
  return hammingDistance(hexToBitString(hashA), hexToBitString(hashB)) <= CACHE_HAMMING_THRESHOLD;
}
