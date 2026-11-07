/**
 * Verifica se un'immagine può essere servita da `next/image`.
 *
 * Deve restare ALLINEATA a `images.remotePatterns` in next.config.ts: una URL
 * http:// o un host non configurato fa fallire il rendering di <Image>, quindi
 * in quel caso i componenti ricadono su <img> / background-image.
 */
export function puoUsareNextImage(src: string | null | undefined): boolean {
  if (!src) return false;

  const valore = src.trim();
  if (!valore) return false;

  // Immagini servite dal progetto (public/).
  if (valore.startsWith("/")) return true;

  try {
    const url = new URL(valore);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "images.pexels.com" || url.hostname.endsWith(".supabase.co")
    );
  } catch {
    return false;
  }
}
