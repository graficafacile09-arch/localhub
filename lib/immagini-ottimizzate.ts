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

/**
 * L'ottimizzatore di Next accetta SOLO queste larghezze (deviceSizes +
 * imageSizes di default): una `w` arbitraria risponde 400. La larghezza
 * richiesta viene quindi arrotondata per eccesso alla prima ammessa.
 */
const LARGHEZZE_AMMESSE = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const;

function larghezzaAmmessa(larghezza: number): number {
  const richiesta = Math.max(16, Math.round(larghezza));
  return (
    LARGHEZZE_AMMESSE.find((valore) => valore >= richiesta) ??
    LARGHEZZE_AMMESSE[LARGHEZZE_AMMESSE.length - 1]
  );
}

export function immagineOttimizzata(
  url: string | null | undefined,
  larghezza: number,
  qualita = 70
): string {
  if (!url) return "";

  const valore = url.trim();
  if (!valore || valore.includes("/_next/image")) return valore;
  if (!RE_REMOTO_OTTIMIZZABILE.test(valore)) return valore;

  const w = larghezzaAmmessa(larghezza);
  const q = Math.max(1, Math.min(100, Math.round(qualita)));
  return `/_next/image?url=${encodeURIComponent(valore)}&w=${w}&q=${q}`;
}
