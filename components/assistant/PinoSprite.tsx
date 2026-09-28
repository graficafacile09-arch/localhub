"use client";

import Image from "next/image";

export type PinoMood = "neutral" | "happy" | "sad";

const MOOD_ASSET: Record<PinoMood, string> = {
  neutral: "/pino-searching.webp",
  happy: "/pino-happy.webp",
  sad: "/pino-sad.webp",
};

export default function PinoSprite({
  mood = "neutral",
  className = "",
}: {
  mood?: PinoMood;
  className?: string;
}) {
  return (
    <Image
      src={MOOD_ASSET[mood]}
      alt=""
      aria-hidden="true"
      width={264}
      height={364}
      unoptimized
      className={`${className} object-contain`}
      style={{ display: "block", width: "60px", height: "78px" }}
    />
  );
}
