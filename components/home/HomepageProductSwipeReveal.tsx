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
  const touchStartY = useRef<number | null>(null);
  const allowSwipe = useRef(false);

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;

    // While browsing products, ignore gestures on cards, links and carousel controls.
    // A right-swipe back to the hero is only accepted when it starts at the far left edge.
    allowSwipe.current = showProducts
      ? touch.clientX <= 28
      : Boolean((event.target as HTMLElement).closest("[data-home-hero-swipe]"));
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    const touch = event.changedTouches[0];
    touchStartX.current = null;
    touchStartY.current = null;

    if (!allowSwipe.current || startX === null || startY === null || !touch) return;
    allowSwipe.current = false;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    // Require a clearly horizontal gesture, so vertical browsing doesn't switch panels.
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    if (!showProducts && deltaX < 0) setShowProducts(true);
    if (showProducts && deltaX > 0) setShowProducts(false);
  }

  return (
    <>
      <div
        className="relative min-h-[420px] overflow-hidden bg-[#e5edf7] sm:min-h-[460px] md:h-[600px] md:min-h-0"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label="Homepage InCittà: scorri orizzontalmente per passare dalla foto ai prodotti"
      >
        <div
          className={`absolute inset-0 min-h-[420px] transition-transform duration-300 ease-out sm:min-h-[460px] md:min-h-0 ${showProducts ? "-translate-x-full" : "translate-x-0"}`}
          aria-hidden={showProducts}
          data-home-hero-swipe
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

        {!showProducts && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 sm:bottom-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-yellow-200/90 bg-yellow-400 px-4 py-2 text-xs font-extrabold tracking-wide text-slate-950 shadow-lg shadow-slate-950/20 ring-1 ring-black/5 sm:text-sm">
              Scorri per scoprire i prodotti
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </span>
          </div>
        )}

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
