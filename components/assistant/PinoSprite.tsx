"use client";

import { useEffect, useRef } from "react";

export type PinoMood = "neutral" | "happy" | "sad";

// The supplied sprite is ordered: happy, neutral, sad.
const FRAME_INDEX: Record<PinoMood, number> = { neutral: 1, happy: 0, sad: 2 };

export default function PinoSprite({
  mood = "neutral",
  className = "",
}: {
  mood?: PinoMood;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = "/pino-sprite.jpg";

    img.onload = () => {
      if (cancelled) return;

      const frameWidth = Math.floor(img.naturalWidth / 3);
      const sourceHeight = img.naturalHeight;

      // Crop the empty strip above Pino so the small artifacts above the head
      // are never part of the rendered character.
      // Find the first real Pino row instead of using a blind crop percentage.
// This removes any stray marks above the head without cutting into the character.
      let firstContentRow = Math.floor(sourceHeight * 0.02);
      const probe = document.createElement("canvas");
      probe.width = frameWidth;
      probe.height = sourceHeight;
      const probeCtx = probe.getContext("2d", { willReadFrequently: true });
      if (probeCtx) {
        probeCtx.drawImage(
          img,
          FRAME_INDEX[mood] * frameWidth,
          0,
          frameWidth,
          sourceHeight,
          0,
          0,
          frameWidth,
          sourceHeight
        );
        const probePixels = probeCtx.getImageData(0, 0, frameWidth, sourceHeight).data;
        for (let y = 0; y < sourceHeight; y++) {
          let contentPixels = 0;
          for (let x = 0; x < frameWidth; x += 2) {
            const i = (y * frameWidth + x) * 4;
            const r = probePixels[i], g = probePixels[i + 1], b = probePixels[i + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            // Pino content is darker/more saturated than the white studio background.
            if (max < 232 || max - min > 28) contentPixels++;
          }
          if (contentPixels > Math.max(3, frameWidth * 0.004)) {
            firstContentRow = y;
            break;
          }
        }
      }

      const cropTop = Math.max(0, firstContentRow - Math.round(sourceHeight * 0.006));
      const sourceY = cropTop;
      const sourceH = sourceHeight - cropTop;

      // Render internally at high resolution so the final small character keeps
      // cleaner antialiasing and does not expose JPEG stair-stepping.
      const scale = Math.max(4, 480 / sourceH);
      canvas.width = Math.max(1, Math.round(frameWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceH * scale));

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Keep the exact supplied Pino artwork, but improve the source rendering:
      // slightly restore color/contrast before segmentation so the character
      // does not look washed out after the white/gray background is removed.
      ctx.filter = "saturate(1.12) contrast(1.035) brightness(1.015)";

      ctx.drawImage(
        img,
        FRAME_INDEX[mood] * frameWidth,
        sourceY,
        frameWidth,
        sourceH,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      const w = canvas.width;
      const h = canvas.height;

      // Remove the white studio background by flood-filling only pixels that
      // are connected to the canvas edges. This preserves white details inside
      // Pino while eliminating the ugly white halo around the silhouette.
      const visited = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let head = 0;
      let tail = 0;

      const isBackground = (idx: number) => {
        const r = d[idx * 4];
        const g = d[idx * 4 + 1];
        const b = d[idx * 4 + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        // Only classify near-white, low-chroma pixels as removable background.
        // This keeps Pino's enclosed white details untouched.
        return min > 222 && max - min < 24;
      };

      const push = (x: number, y: number) => {
        const p = y * w + x;
        if (visited[p]) return;
        visited[p] = 1;
        if (isBackground(p)) queue[tail++] = p;
      };

      for (let x = 0; x < w; x++) {
        push(x, 0);
        push(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        push(0, y);
        push(w - 1, y);
      }

      while (head < tail) {
        const p = queue[head++];
        const x = p % w;
        const y = Math.floor(p / w);
        if (x > 0) push(x - 1, y);
        if (x < w - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < h - 1) push(x, y + 1);
      }

      // Build a small feather around the detected background. JPEG compression
      // leaves a pale gray fringe around fine details such as the hair. A slightly
      // wider feather lets us remove that fringe without changing Pino's silhouette.
      const feather = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p++) {
        if (visited[p]) continue;
        const x = p % w;
        const y = Math.floor(p / w);
        const near =
          (x > 0 && visited[p - 1]) ||
          (x < w - 1 && visited[p + 1]) ||
          (y > 0 && visited[p - w]) ||
          (y < h - 1 && visited[p + w]);
        if (near) feather[p] = 1;
      }

      for (let p = 0; p < w * h; p++) {
        const i = p * 4;
        if (visited[p]) {
          d[i + 3] = 0;
          continue;
        }
        if (!feather[p]) continue;

        const r = d[i], g = d[i + 1], b = d[i + 2];
        const minRgb = Math.min(r, g, b);
        const maxRgb = Math.max(r, g, b);
        const chroma = (maxRgb - minRgb) / 255;
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

        // Remove the light, low-chroma JPEG fringe much more decisively.
        // Saturated/darker Pino pixels are kept opaque, so the character itself
        // is not recolored or reshaped.
        const backgroundLike = Math.max(0, Math.min(1,
          (luminance - 0.68) / 0.28
        )) * Math.max(0, Math.min(1, 1 - chroma * 7));

        const alpha = Math.max(
          0.08,
          Math.min(1, 1 - backgroundLike * 0.92)
        );

        if (alpha < 0.995) {
          // Unmix the light studio background from the boundary pixel so the
          // remaining semi-transparent edge does not carry a gray/white halo.
          const bg = 245;
          d[i] = Math.max(0, Math.min(255, Math.round((r - bg * (1 - alpha)) / Math.max(alpha, 0.01))));
          d[i + 1] = Math.max(0, Math.min(255, Math.round((g - bg * (1 - alpha)) / Math.max(alpha, 0.01))));
          d[i + 2] = Math.max(0, Math.min(255, Math.round((b - bg * (1 - alpha)) / Math.max(alpha, 0.01))));
          d[i + 3] = Math.round(alpha * 255);
        }
      }

      ctx.putImageData(pixels, 0, 0);
    };

    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [mood]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        width: "60px",
        height: "78px",
        imageRendering: "auto",
      }}
    />
  );
}
