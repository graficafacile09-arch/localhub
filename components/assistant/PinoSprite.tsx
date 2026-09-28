/**
 * Pino: un asset dedicato per ogni stato d'animo.
 *
 * I tre file condividono lo stesso canvas (378x560) e la stessa inquadratura:
 * chioma allineata in alto e personaggio centrato. Cambiando stato Pino non si
 * sposta e non cambia dimensione.
 *
 * Sono WebP senza perdita con il canale alpha già scontornato (nessun alone
 * grigio, nessun residuo di sfondo): l'immagine viene servita così com'è, senza
 * alcun ritaglio o ridimensionamento a runtime nel browser come faceva il
 * vecchio canvas.
 *
 * Rigenerabili con `python scripts/gen-pino-assets.py`.
 */
export type PinoMood = "neutral" | "happy" | "sad";

/** Mappa stato -> asset. Unica fonte per tutti i punti che mostrano Pino. */
export const PINO_ASSET: Record<PinoMood, string> = {
  neutral: "/pino-neutro.webp",
  happy: "/pino-allegro.webp",
  sad: "/pino-triste.webp",
};

/** Dimensioni naturali degli asset (canvas comune ai tre stati). */
export const PINO_ASSET_W = 378;
export const PINO_ASSET_H = 560;

export default function PinoSprite({
  mood = "neutral",
  className = "",
}: {
  mood?: PinoMood;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={PINO_ASSET[mood]}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      width={PINO_ASSET_W}
      height={PINO_ASSET_H}
      className={className}
      // object-contain: il riquadro passato dal chiamante resta identico, ma il
      // disegno non viene mai deformato.
      style={{ display: "block", objectFit: "contain", imageRendering: "auto" }}
    />
  );
}
