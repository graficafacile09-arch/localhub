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
      const cropTop = Math.round(sourceHeight * 0.075);
      const sourceY = cropTop;
      const sourceH = sourceHeight - cropTop;

      // Render internally at 2x for cleaner edges when the character is displayed small.
      const scale = Math.max(2, 320 / sourceH);
      canvas.width = Math.max(1, Math.round(frameWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceH * scale));

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);

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
        return min > 215 && max - min < 32;
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

      for (let p = 0; p < w * h; p++) {
        if (!visited[p]) continue;
        const i = p * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const distance = 255 - Math.max(r, g, b);
        d[i + 3] = Math.max(0, Math.min(255, Math.round(distance * 5)));
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
