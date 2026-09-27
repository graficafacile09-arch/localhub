"use client";

import { useEffect, useRef } from "react";

export type PinoMood = "neutral" | "happy" | "sad";

const FRAME_INDEX: Record<PinoMood, number> = { neutral: 0, happy: 1, sad: 2 };

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
    img.src = "/pino-sprite.jpg";
    img.onload = () => {
      if (cancelled) return;
      const frameWidth = Math.floor(img.naturalWidth / 3);
      const frameHeight = img.naturalHeight;
      const scale = Math.min(1, 240 / frameHeight);
      canvas.width = Math.max(1, Math.round(frameWidth * scale));
      canvas.height = Math.max(1, Math.round(frameHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        FRAME_INDEX[mood] * frameWidth,
        0,
        frameWidth,
        frameHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const min = Math.min(r, g, b);
        const max = Math.max(r, g, b);
        const whiteness = 255 - max;
        if (min > 245) {
          d[i + 3] = 0;
        } else if (min > 225 && max - min < 18) {
          d[i + 3] = Math.round((245 - min) * 3);
        } else if (whiteness < 8 && max - min < 24) {
          d[i + 3] = 0;
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
      style={{ display: "block", width: "60px", height: "78px" }}
    />
  );
}
