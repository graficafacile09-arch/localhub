"use client";

import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight, MoveLeft, Pointer } from "lucide-react";

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
        className="relative overflow-hidden bg-[#e5edf7] md:h-[600px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label="Homepage InCittà: scorri orizzontalmente per passare dalla foto ai prodotti"
      >
        <div
          className={`transition-transform duration-300 ease-out md:absolute md:inset-0 ${showProducts ? "absolute inset-0 -translate-x-full md:-translate-x-full" : "relative translate-x-0 md:translate-x-0"}`}
          aria-hidden={showProducts}
          data-home-hero-swipe
        >
          {hero}
        </div>

        <div
          className={`transition-transform duration-300 ease-out [&>section]:min-h-full ${showProducts ? "relative w-full translate-x-0 overflow-visible md:absolute md:inset-0 md:overflow-y-auto" : "absolute inset-0 w-full translate-x-full overflow-y-auto md:overflow-y-auto"}`}
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
            className="absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-yellow-300/90 bg-yellow-400/95 px-3 py-1.5 text-[11px] font-bold text-blue-900 shadow-md shadow-slate-950/20 transition hover:bg-yellow-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 md:hidden"
          >
            <span>Scopri i prodotti</span>
            <span className="incitta-swipe-cue relative inline-block h-[14px] w-14 translate-y-[1px] align-middle" aria-hidden="true">
              <MoveLeft className="incitta-swipe-cue-arrow absolute right-0 top-1/2 h-4 w-12 text-blue-800" strokeWidth={2.8} />
              <Pointer className="incitta-swipe-cue-hand absolute left-0 top-[3px] h-[18px] w-[18px] text-blue-800" strokeWidth={2.3} />
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowProducts((current) => !current)}
          aria-label={showProducts ? "Torna alla foto della homepage" : "Mostra i prodotti"}
          aria-expanded={showProducts}
          aria-controls="homepage-prodotti"
          className="group absolute bottom-5 right-5 z-20 hidden min-h-11 items-center gap-3 rounded-full border border-white/25 bg-blue-950/90 py-1.5 pl-5 pr-1.5 text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(2,6,23,0.8)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:bg-blue-900 hover:shadow-[0_14px_34px_-12px_rgba(2,6,23,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900 md:inline-flex"
        >
          {showProducts ? (
            <>
              <span>Torna alla foto</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-yellow-300 transition group-hover:bg-white/15">
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </span>
            </>
          ) : (
            <>
              <span>Scopri i prodotti</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-blue-950 transition group-hover:translate-x-0.5 group-hover:bg-yellow-300">
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </>
          )}
        </button>
      </div>

      {valueStrip}
    </>
  );
}
