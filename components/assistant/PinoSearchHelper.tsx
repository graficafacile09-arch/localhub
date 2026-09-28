"use client";

import { useEffect, useState } from "react";

type PinoSearchHelperProps = { query: string; hasResults: boolean; resultCount: number };
type PinoState = "searching" | "happy" | "sad";

function PinoVisual({ state }: { state: PinoState }) {
  const position = state === "happy" ? "0% 0%" : state === "sad" ? "100% 0%" : "50% 0%";
  return (
    <div
      aria-hidden="true"
      className={
        "h-14 w-11 shrink-0 overflow-hidden rounded-xl bg-no-repeat sm:h-16 sm:w-12 " +
        (state === "searching" ? "animate-bounce" : "")
      }
      style={{
        backgroundImage: 'url("/pino-sprite.jpg")',
        backgroundSize: "300% 100%",
        backgroundPosition: position,
      }}
    />
  );
}

export default function PinoSearchHelper({
  query,
  hasResults,
  resultCount,
}: PinoSearchHelperProps) {
  const [state, setState] = useState<PinoState>("searching");

  useEffect(() => {
    const timer = window.setTimeout(
      () => setState(hasResults ? "happy" : "sad"),
      650
    );
    return () => window.clearTimeout(timer);
  }, [hasResults, query]);

  if (!query) return null;

  const status =
    state === "searching"
      ? "Sto cercando..."
      : hasResults
        ? "Ho trovato qualcosa!"
        : "Non trovo ancora nulla.";

  const suggestion = hasResults
    ? resultCount === 1
      ? "Ecco il risultato più vicino alla tua ricerca."
      : "Dai un’occhiata ai risultati: potresti trovare proprio quello che cerchi."
    : "Prova con un termine più generico o con il nome di un negozio.";

  return (
    <aside
      aria-label="Suggerimento di Pino"
      className="flex min-h-[72px] items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm"
    >
      <PinoVisual state={state} />
      <div className="min-w-0">
        <div className="text-[11px] font-black text-blue-900 sm:text-xs">
          Pino{" "}
          <span className="ml-1 font-normal text-slate-500">{status}</span>
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-800">
          “{query}”
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-3.5 text-slate-500">
          {suggestion}
        </p>
      </div>
    </aside>
  );
}
