"use client";

import { useRef } from "react";
import { Search } from "lucide-react";
import HomeAssistantButton from "@/components/assistant/HomeAssistantButton";

/**
 * Barra di ricerca dell'hero della homepage.
 *
 * Form nativo GET verso `/ricerca?q=...` (funziona anche senza JS). A fianco,
 * il pulsante ✨ dell'Assistente: quando l'utente ha digitato una query nel
 * campo, questa viene passata al pannello AI come initialQuery, così il
 * pannello parte subito con la richiesta (nessuna riscrittura manuale).
 */
export default function HeroSearchBar() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="mt-7 flex max-w-xl items-center gap-2 sm:gap-3">
      <form action="/ricerca" method="GET" className="min-w-0 flex-1">
        <div className="flex items-center rounded-full bg-white/95 p-1.5 shadow-lg shadow-black/25 transition focus-within:ring-2 focus-within:ring-yellow-300">
          <Search className="ml-3 h-5 w-5 shrink-0 text-slate-400 sm:ml-4" />
          <input
            ref={inputRef}
            type="text"
            name="q"
            placeholder="Cerca prodotto, negozio o servizio..."
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none sm:px-4 sm:text-base"
          />
          <button
            type="submit"
            className="hidden shrink-0 items-center gap-2 rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-900 transition hover:bg-yellow-300 active:scale-95 sm:inline-flex"
          >
            <Search className="h-4 w-4" />
            Cerca
          </button>
          <button
            type="submit"
            aria-label="Cerca"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-blue-900 transition hover:bg-yellow-300 active:scale-95 sm:hidden"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Assistente AI — accessibile SOLO dalla homepage */}
      <HomeAssistantButton getQuery={() => inputRef.current?.value ?? ""} />
    </div>
  );
}