"use client";

import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowLeftRight, Hand } from "lucide-react";

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

    // Change panels only when the gesture starts on the hero or the products intro.
    // Swipes on product cards, links and the inner product carousels must never switch panels.
    const target = event.target as HTMLElement;
    allowSwipe.current = showProducts
      ? Boolean(target.closest("[data-home-products-swipe]"))
      : Boolean(target.closest("[data-home-hero-swipe]"));
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
          <button
            type="button"
            onClick={() => setShowProducts(true)}
            aria-label="Scopri i prodotti: scorri per vedere i prodotti"
            className="group absolute bottom-5 left-1/2 z-20 inline-flex min-h-12 -translate-x-1/2 items-center gap-2.5 rounded-full border border-yellow-200/80 bg-yellow-400 px-5 py-3 text-sm font-extrabold tracking-tight text-blue-900 shadow-[0_10px_30px_-8px_rgba(15,23,42,0.45)] transition duration-200 hover:-translate-y-0.5 hover:bg-yellow-300 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:bottom-6 sm:text-base md:hidden"
          >
            <span>Scopri i prodotti</span>
            <span className="inline-flex items-center gap-1.5 text-blue-900 transition-transform duration-200 group-hover:translate-x-0.5">
              <Hand className="h-5 w-5" aria-hidden />
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowProducts((current) => !current)}
          aria-label={showProducts ? "Torna alla foto della homepage" : "Mostra i prodotti"}
          aria-expanded={showProducts}
          aria-controls="homepage-prodotti"
          className="absolute bottom-4 right-4 z-20 hidden h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-blue-900 shadow-md backdrop-blur transition hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 md:inline-flex"
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
