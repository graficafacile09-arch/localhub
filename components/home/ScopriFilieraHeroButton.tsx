"use client";

import { ArrowRight, MoveLeft, Pointer } from "lucide-react";
import { useHomeSwipe } from "./home-swipe-context";

/**
 * CTA "Scopri la filiera" dentro la fotografia della HERO.
 *
 * - `mobile`: nel flusso, sotto i marchi (mt-9 ≈ 1 cm), centrata; prima era
 *   appoggiata al bordo inferiore della sezione, molto più in basso.
 * - `desktop`: dentro il blocco dei marchi, quindi subito sotto la riga dei
 *   loghi, spostata ancora più in basso a destra (leggermente oltre il bordo
 *   destro dei marchi).
 *   Il pulsante del carosello resta per
 *   tornare alla foto quando il pannello filiere è aperto.
 */
type Variante = "mobile" | "desktop";

export default function ScopriFilieraHeroButton({
  variante = "mobile",
}: {
  variante?: Variante;
}) {
  const swipe = useHomeSwipe();
  if (!swipe || swipe.showProducts) return null;

  if (variante === "desktop") {
    return (
      <button
        type="button"
        onClick={swipe.apriProdotti}
        data-home-hero-swipe
        aria-label="Scopri la filiera: scorri per vedere le filiere calabresi"
        className="group relative z-10 hidden min-h-11 items-center gap-3 rounded-full border border-white/30 bg-gold py-1.5 pl-5 pr-1.5 text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(2,6,23,0.8)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#c1962f] hover:shadow-[0_14px_34px_-12px_rgba(2,6,23,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-forest xl:mt-7 xl:-mr-2.5 xl:self-end xl:inline-flex"
      >
        <span>Scopri la filiera</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition group-hover:translate-x-0.5 group-hover:bg-white/25">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={swipe.apriProdotti}
      data-home-hero-swipe
      aria-label="Scopri la filiera: scorri per vedere le filiere calabresi"
      className="relative z-10 mt-9 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 self-center rounded-full border border-gold/90 bg-gold/95 px-3 py-1.5 text-[11px] font-bold leading-tight text-white shadow-md shadow-slate-950/20 transition hover:bg-[#c1962f] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 md:hidden"
    >
      {/* Il testo può andare a capo: le traduzioni (francese, spagnolo,
          tedesco) sono più lunghe e senza questo uscivano dalla pillola. */}
      <span className="min-w-0 text-balance text-center">Scopri la filiera</span>
      <span
        className="incitta-swipe-cue relative inline-block h-[14px] w-14 shrink-0 translate-y-[1px] align-middle"
        aria-hidden="true"
      >
        <MoveLeft
          className="incitta-swipe-cue-arrow absolute right-0 top-1/2 h-4 w-12 text-white"
          strokeWidth={2.8}
        />
        <Pointer
          className="incitta-swipe-cue-hand absolute left-0 top-[3px] h-[18px] w-[18px] text-white"
          strokeWidth={2.3}
        />
      </span>
    </button>
  );
}
