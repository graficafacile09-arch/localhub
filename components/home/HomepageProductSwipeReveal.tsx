"use client";

import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight, Hand } from "lucide-react";

export default function HomepageProductSwipeReveal({
  hero,
  valueStrip,
  products,
}: {
  hero: ReactNode;
  valueStrip: ReactNode;
  products: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const touchStartX = useRef<number | null>(null);

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current;
    const end = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (start === null || end === undefined) return;
    if (Math.abs(end - start) >= 45) setVisible(true);
  }

  return (
    <>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {hero}
      </div>

      <div className="flex justify-center bg-white px-3 py-3 sm:py-4">
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-expanded={visible}
          aria-controls="homepage-prodotti"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-yellow-400 bg-yellow-300 px-4 py-2 text-center text-xs font-black text-blue-950 shadow-sm transition hover:bg-yellow-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:px-5 sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <Hand className="h-4 w-4" aria-hidden />
          {visible ? "Nascondi i prodotti" : "Scorri a destra o sinistra per scoprire i prodotti"}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {valueStrip}

      <div
        id="homepage-prodotti"
        className={visible ? "block" : "hidden"}
        aria-hidden={!visible}
      >
        {products}
      </div>
    </>
  );
}
