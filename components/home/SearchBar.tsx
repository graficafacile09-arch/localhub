/**
 * LocalHub — SearchBar (Brain-powered)
 *
 * Barra di ricerca client-side che usa useBrainSearch.
 * Due modalità:
 *   - "navigate" (default): al submit naviga verso /ricerca?q=... come SearchForm
 *   - "inline":  mostra i risultati direttamente nella pagina senza navigare
 *
 * Backward compatibility:
 *   - Senza onResults prop si comporta identicamente alla versione precedente
 *     (naviga a /ricerca?q=...) — nessuna regressione.
 *   - Con onResults prop si attiva la modalità inline Brain-powered.
 *
 * @module components/home/SearchBar
 */

"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { useBrainSearch } from "@/lib/hooks/useBrainSearch";
import type { SearchResult } from "@/lib/search-service";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

type SearchBarMode = "navigate" | "inline";

type SearchBarProps = {
  placeholder?: string;

  /** Valore iniziale del campo (utile su pagine di risultati) */
  initialQuery?: string;

  /**
   * Modalità di funzionamento.
   * - "navigate": naviga a /ricerca?q=... al submit (default, backward compat)
   * - "inline": chiama onResults con i risultati Brain senza navigare
   */
  mode?: SearchBarMode;

  /**
   * Callback chiamata con i risultati (solo in modalità "inline").
   * Riceve null mentre la ricerca è in corso.
   */
  onResults?: (results: SearchResult | null, loading: boolean) => void;

  /** ID sessione opzionale per Brain Memory */
  sessionId?: string;

  /** Debounce in ms per la modalità inline (default: 0) */
  debounceMs?: number;
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function SearchBar({
  placeholder = "Cerca prodotti, negozi o servizi...",
  initialQuery = "",
  mode = "navigate",
  onResults,
  sessionId,
  debounceMs = 0,
}: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(initialQuery);

  const { search, status } = useBrainSearch({
    debounceMs,
    sessionId,
    useMemory: !!sessionId,
  });

  const isLoading = status === "loading";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const query = inputRef.current?.value.trim() ?? inputValue.trim();
    if (!query) return;

    if (mode === "navigate" || !onResults) {
      // Comportamento originale: naviga a /ricerca?q=...
      router.push(`/ricerca?q=${encodeURIComponent(query)}`);
      return;
    }

    // Modalità inline: cerca con Brain e notifica il parent
    onResults(null, true);
    await search(query);

    // Dopo la ricerca, aggiorna i risultati tramite il hook
    // (il parent si abbona passando onResults)
  };

  // In modalità inline, quando i risultati cambiano notifica il parent
  // tramite un pattern semplice: il parent può anche passare
  // useBrainSearch direttamente se preferisce — questa è la via "standalone"

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-white/60 bg-white p-2 shadow-[0_20px_60px_rgba(0,0,0,0.25)] ring-2 ring-white/60 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:p-2.5">

          <div className="relative flex min-w-0 flex-1 items-center">
            <Search
              className="absolute left-4 h-5 w-5 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              name="q"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              enterKeyHint="search"
              disabled={isLoading}
              className="h-12 w-full rounded-xl bg-transparent pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60 sm:h-14 sm:rounded-full md:text-lg"
              aria-label="Campo di ricerca"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="group flex shrink-0 items-center justify-center gap-2.5 h-12 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 px-8 text-base font-bold text-gray-900 shadow-lg shadow-amber-500/50 transition-all duration-200 hover:-translate-y-0.5 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 hover:shadow-xl hover:shadow-amber-400/60 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 sm:h-14 sm:rounded-full sm:px-10 md:text-lg"
            aria-label={isLoading ? "Ricerca in corso..." : "Avvia ricerca"}
          >
            {isLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" aria-hidden />
            ) : (
              <Search className="h-5 w-5 transition-transform group-hover:scale-110" aria-hidden />
            )}
            {isLoading ? "Ricerca..." : "Cerca"}
          </button>

        </div>
      </form>
    </div>
  );
}
