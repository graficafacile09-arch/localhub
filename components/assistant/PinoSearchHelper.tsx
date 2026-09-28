"use client";

import { useEffect, useState } from "react";

type PinoSearchHelperProps = { query: string; hasResults: boolean; resultCount: number };
type PinoState = "searching" | "happy" | "sad";

function PinoVisual({ state }: { state: PinoState }) {
  const position = state === "happy" ? "0% 0%" : state === "sad" ? "100% 0%" : "50% 0%";
  return <div aria-hidden="true" className={"h-16 w-12 shrink-0 overflow-hidden bg-no-repeat sm:h-20 sm:w-14 " + (state === "searching" ? "animate-bounce" : "")} style={{ backgroundImage: 'url("/pino-sprite.jpg")', backgroundSize: "300% 100%", backgroundPosition: position }} />;
}

export default function PinoSearchHelper({ query, hasResults, resultCount }: PinoSearchHelperProps) {
  const [state, setState] = useState<PinoState>("searching");
  useEffect(() => { const timer = window.setTimeout(() => setState(hasResults ? "happy" : "sad"), 650); return () => window.clearTimeout(timer); }, [hasResults, query]);
  if (!query) return null;
  const suggestion = hasResults ? (resultCount === 1 ? "Ecco il risultato più vicino alla tua ricerca." : "Dai un’occhiata ai risultati: potresti trovare proprio quello che cerchi.") : "Prova con un termine più generico o con il nome di un negozio.";
  return <aside aria-label="Suggerimento di Pino" className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
    <PinoVisual state={state} />
    <div className="min-w-0 flex-1">
      <div className="text-xs font-black text-blue-900 sm:text-sm">Pino <span className="ml-1.5 font-normal text-slate-500">{state === "searching" ? "sta cercando..." : hasResults ? "ha trovato qualcosa!" : "non trova ancora nulla."}</span></div>
      <p className="mt-0.5 text-sm leading-5 text-slate-800">“{query}”</p>
      <p className="mt-0.5 text-xs leading-4 text-slate-500">{suggestion}</p>
    </div>
  </aside>;
}
