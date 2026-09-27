"use client";

import { useRef } from "react";
import { Search } from "lucide-react";

type SearchFormProps = {
export default function SearchForm({ initialQuery = "", compact = false }: SearchFormProps) {
  return (
    <form action="/ricerca" method="get" className="w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            ref={inputRef}
            type="text"
            name="q"
            defaultValue={initialQuery}
            placeholder="Cerca prodotti, negozi o categorie..."
            autoComplete="off"
            enterKeyHint="search"
            className={`w-full rounded-lg border border-slate-200 bg-white py-0 pl-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300 ${compact ? "h-9" : "h-10"}`}
            aria-label="Cerca"
          />
          {/* Icona lente come pulsante di ricerca (submitta il form).
              Posizionata a destra: non copre l'area di digitazione. */}
          <button
            type="submit"
            aria-label="Cerca"
            className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
    </form>
  );
}
