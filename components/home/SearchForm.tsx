"use client";

import { Search, Sparkles } from "lucide-react";

type SearchFormProps = {
  /** Query attuale (mostrata nel campo così l'utente può modificarla). */
  initialQuery?: string;
  compact?: boolean;
};

/**
 * Barra di ricerca pubblica (homepage / pagina risultati /ricerca).
 *
 * Form NATIVO GET verso `/ricerca?q=...`, identico al comportamento della
 * homepage: funziona SEMPRE, anche senza JavaScript. Invio o click sulla
 * lente avviano la ricerca; la URL si aggiorna, il refresh mantiene la
 * query e back/forward sono gestiti nativamente dal browser. Da qualsiasi
 * pagina dei risultati si può quindi fare una seconda/terza ricerca senza
 * tornare alla homepage.
 *
 * La ricerca resta ESCLUSIVAMENTE database-side (nessuna chiamata AI):
 * il pulsante ✨ apre solo l'Assistente (azione esplicita dell'utente).
 */
export default function SearchForm({ initialQuery = "", compact = false }: SearchFormProps) {
  const handleAI = () => {
    window.dispatchEvent(new Event("assistant:open"));
  };

  return (
    <form action="/ricerca" method="get" className="w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
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
        <button
          type="button"
          onClick={handleAI}
          className={`flex shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100 ${compact ? "h-9 w-9" : "h-10 w-10"}`}
          aria-label="Chiedi all'Assistente AI"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
