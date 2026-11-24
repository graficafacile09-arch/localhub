"use client";

import { Search } from "lucide-react";

/**
 * Barra di ricerca dell'header (e variante non-header).
 * Motore, action, nome del campo, placeholder e misure di invio sono invariati:
 * cambia solo la veste grafica (campo bianco, bordo oro, pulsante oro).
 * Nel mockup il pulsante è un'estensione dorata del campo, senza margine
 * interno: il bordo esterno è oro e il bottone ne riempie l'angolo destro.
 */
export default function HeroSearchBar({ inHeader = false }: { inHeader?: boolean } = {}) {
  return (
    <div className={inHeader ? "w-full" : "mt-7 max-w-xl"}>
      <form action="/ricerca" method="GET">
        <div
          className={
            inHeader
              ? "flex items-center gap-1 rounded-full border border-gold bg-white p-1 shadow-[0_10px_26px_-20px_rgba(20,83,45,0.55)] transition focus-within:ring-2 focus-within:ring-gold/25 sm:pl-5"
              : "flex items-center gap-1 rounded-full border border-gold bg-white p-1 shadow-lg shadow-slate-900/15 transition focus-within:ring-2 focus-within:ring-gold/25 sm:pl-5"
          }
        >
          <Search className="h-5 w-5 shrink-0 text-forest/75 sm:h-[22px] sm:w-[22px]" aria-hidden />
          <input
            type="text"
            name="q"
            placeholder="Cerca prodotti, filiere, produttori e territori."
            aria-label="Cerca prodotti, filiere, produttori e territori"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none sm:px-4 sm:py-3 sm:text-base lg:py-2.5 lg:text-[17px]"
          />
          <button
            type="submit"
            className="hidden shrink-0 items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-bold text-white transition hover:bg-[#c1962f] active:scale-95 sm:inline-flex lg:px-9 lg:py-2.5 lg:text-base"
          >
            <Search className="h-4 w-4" aria-hidden /> Cerca
          </button>
          <button
            type="submit"
            aria-label="Cerca"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-white transition hover:bg-[#c1962f] active:scale-95 sm:hidden"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
