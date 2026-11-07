/**
 * Host delle immagini remote che possono essere servite da `next/image`.
 *
 * Questa lista è l'UNICA fonte di verità: `next.config.ts` la usa per costruire
 * `images.remotePatterns`, mentre i componenti usano `puoUsareNextImage`. Una
 * URL `http://` o un host non elencato fa fallire il rendering di <Image>,
 * quindi in quel caso i componenti ricadono su <img> / background-image.
 *
 * Gli host dei negozi esterni sono stati ricavati dalle immagini effettivamente
 * presenti a catalogo: aggiungerne uno nuovo qui basta a portarlo sotto
 * l'ottimizzatore (resize + cache CDN). I sottodomini Supabase sono gestiti a
 * parte perché il progetto cambia dominio di storage.
 */
export const HOST_IMMAGINI_REMOTE = [
  "images.pexels.com",
  "www.kiarella.it",
  "typicalcalabria.com",
  "delizieditalia.net",
  "cdn.redcare.it",
  "static.wixstatic.com",
  "www.agripalombari.com",
  "cdn.olico.it",
  "www.originecalabria.store",
  "www.datocms-assets.com",
  "primary.jwwb.nl",
  "www.emiliaitalianfood.com",
  "solmielato.it",
  "iperdrive.iper.it",
  "images.artigianoinfiera.it",
] as const;

/** Domini i cui sottodomini (es. `<progetto>.supabase.co`) sono ammessi. */
export const DOMINI_IMMAGINI_REMOTE = ["supabase.co"] as const;

export function puoUsareNextImage(src: string | null | undefined): boolean {
  if (!src) return false;

  const valore = src.trim();
  if (!valore) return false;

  // Immagini servite dal progetto (public/).
  if (valore.startsWith("/")) return true;

  try {
    const url = new URL(valore);
    if (url.protocol !== "https:") return false;

    const host = url.hostname;
    if ((HOST_IMMAGINI_REMOTE as readonly string[]).includes(host)) return true;

    return DOMINI_IMMAGINI_REMOTE.some(
      (dominio) => host === dominio || host.endsWith(`.${dominio}`),
    );
  } catch {
    return false;
  }
}
