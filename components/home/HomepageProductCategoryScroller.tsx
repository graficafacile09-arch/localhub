"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function HomepageProductCategoryScroller({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollCategories(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(320, Math.round(scroller.clientWidth * 0.82)),
      behavior: "smooth",
    });
  }

  return (
    <div className="flex min-w-0 items-stretch gap-2">
      <button
        type="button"
        onClick={() => scrollCategories(-1)}
        aria-label="Mostra le categorie precedenti"
        className="hidden h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border border-blue-100 bg-white text-blue-900 shadow-sm transition hover:border-yellow-400 hover:bg-yellow-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 md:inline-flex"
      >
        <ChevronLeft className="h-6 w-6" aria-hidden />
      </button>

      <div
        ref={scrollerRef}
        className="flex min-w-0 flex-1 flex-col items-stretch gap-3 pb-2 md:flex-row md:snap-x md:snap-mandatory md:gap-5 md:overflow-x-auto md:overscroll-x-contain md:scroll-smooth md:[scrollbar-width:thin]"
        aria-label="Sezioni prodotti scorrevoli"
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => scrollCategories(1)}
        aria-label="Mostra le categorie successive"
        className="hidden h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border border-yellow-300 bg-yellow-400 text-blue-950 shadow-sm transition hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 md:inline-flex"
      >
        <ChevronRight className="h-6 w-6" aria-hidden />
      </button>
    </div>
  );
}
