/**
 * Immagini remote → ottimizzatore di Next.
 *
 * Le card pubbliche usano `background-image` CSS: l'URL remoto finiva nel
 * browser a piena risoluzione (JPEG da ~80 KB l'uno su Supabase Storage),
 * senza WebP, senza variante per mobile, senza cache immagine. Passando dal
 * percorso `/_next/image` di Next la stessa immagine arriva ridimensionata e
 * convertita, con cache a livello di edge.
 *
 * Regole:
 *  - solo host dichiarati in `next.config.ts` (remotePatterns);
 *  - URL già ottimizzati e URL locali restano invariati;
 *  - larghezza normalizzata in un intervallo sicuro per l'ottimizzatore.
 */
const RE_REMOTO_OTTIMIZZABILE =
  /^https:\/\/(?:[a-z0-9-]+\.supabase\.co|images\.pexels\.com)\//i;

export function immagineOttimizzata(
  url: string | null | undefined,
  larghezza: number,
  qualita = 70
): string {
  if (!url) return "";

  const valore = url.trim();
  if (!valore || valore.includes("/_next/image")) return valore;
  if (!RE_REMOTO_OTTIMIZZABILE.test(valore)) return valore;

  const w = Math.max(16, Math.min(3840, Math.round(larghezza)));
  const q = Math.max(1, Math.min(100, Math.round(qualita)));
  return `/_next/image?url=${encodeURIComponent(valore)}&w=${w}&q=${q}`;
}
