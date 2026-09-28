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

      // Draw the supplied Pino artwork unchanged. Do not alter its colors or shape.
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
        const chroma = (max - min) / 255;
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        // The supplied image has a light-gray studio background, not pure white.
        // Use a low-chroma + lightness test so gray areas between the hair and legs
        // are treated as background while Pino's darker/saturated artwork remains.
        return min > 145 && chroma < 0.14 && luminance > 0.57;
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

      // Clean a two-pixel boundary around the detected background. This is the
      // important part for the gray JPEG fringe: only light, low-chroma pixels
      // outside the character are removed, so Pino itself is not reshaped.
      const feather = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p++) {
        if (visited[p]) continue;
        const x = p % w;
        const y = Math.floor(p / w);
        for (let dy = -2; dy <= 2 && !feather[p]; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > 2) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && visited[ny * w + nx]) {
              feather[p] = 1;
              break;
            }
          }
        }
      }

      for (let p = 0; p < w * h; p++) {
        const i = p * 4;
        if (visited[p]) {
          d[i + 3] = 0;
          continue;
        }
        if (!feather[p]) continue;

        const r = d[i], g = d[i + 1], b = d[i + 2];
        const maxRgb = Math.max(r, g, b);
        const minRgb = Math.min(r, g, b);
        const chroma = (maxRgb - minRgb) / 255;
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

        // Hard-remove the pale gray fringe instead of leaving a translucent gray
        // outline. Darker/saturated Pino pixels stay fully opaque.
        if (luminance > 0.63 && chroma < 0.15) {
          d[i + 3] = 0;
          continue;
        }

        // For the final antialiased edge pixel, remove only the background
        // contribution and keep the actual Pino color.
        const alpha = Math.max(0.25, Math.min(1, 1 - Math.max(0, (luminance - 0.55) / 0.45) * Math.max(0, 1 - chroma * 5)));
        if (alpha < 0.995) {
          const bg = 235;
          d[i] = Math.max(0, Math.min(255, Math.round((r - bg * (1 - alpha)) / alpha)));
          d[i + 1] = Math.max(0, Math.min(255, Math.round((g - bg * (1 - alpha)) / alpha)));
          d[i + 2] = Math.max(0, Math.min(255, Math.round((b - bg * (1 - alpha)) / alpha)));
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
        width: "100%",
        height: "auto",
        maxWidth: "100%",
        imageRendering: "auto",
      }}
    />
  );
}
