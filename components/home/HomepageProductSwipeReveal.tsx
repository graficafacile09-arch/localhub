"use client";

import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function HomepageProductSwipeReveal({
  hero,
  valueStrip,
  products,
}: {
  hero: ReactNode;
  valueStrip: ReactNode;
  products: ReactNode;
}) {
  const [showProducts, setShowProducts] = useState(false);
  const touchStartX = useRef<number | null>(null);

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current;
    const end = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (start === null || end === undefined) return;
    const delta = end - start;
    if (delta <= -45) setShowProducts(true);
    if (delta >= 45) setShowProducts(false);
  }

  return (
    <>
      <div
        className="relative min-h-[360px] overflow-hidden bg-[#e5edf7] sm:min-h-[420px] md:h-[600px] md:min-h-0"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label="Homepage InCittà: scorri orizzontalmente per passare dalla foto ai prodotti"
      >
        <div
          className={`absolute inset-0 transition-transform duration-300 ease-out ${showProducts ? "-translate-x-full" : "translate-x-0"}`}
          aria-hidden={showProducts}
        >
          {hero}
        </div>

        <div
          className={`absolute inset-0 overflow-y-auto transition-transform duration-300 ease-out [&>section]:min-h-full ${showProducts ? "translate-x-0" : "translate-x-full"}`}
          aria-hidden={!showProducts}
          id="homepage-prodotti"
        >
          {products}
        </div>

        <button
          type="button"
          onClick={() => setShowProducts((current) => !current)}
          aria-label={showProducts ? "Torna alla foto della homepage" : "Mostra i prodotti"}
          aria-expanded={showProducts}
          aria-controls="homepage-prodotti"
          className="absolute bottom-4 right-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-blue-900 shadow-md backdrop-blur transition hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          {showProducts ? (
            <ArrowLeft className="h-5 w-5" aria-hidden />
          ) : (
            <ArrowRight className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>

      {valueStrip}
    </>
  );
}
