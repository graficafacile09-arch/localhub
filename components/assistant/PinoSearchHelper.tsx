"use client";

import { useEffect, useState } from "react";
import { PINO_ASSET, PINO_ASSET_H, PINO_ASSET_W } from "./PinoSprite";

type PinoSearchHelperProps = {
  query: string;
  hasResults: boolean;
  resultCount: number;
};
type PinoState = "searching" | "happy" | "sad";

/**
 * Stato della ricerca ripristinato alla configurazione funzionante precedente.
 * Gli asset correnti di Pino restano invariati: cambia solo la logica di
 * presentazione dello stato nella pagina /ricerca.
 */
const STATO_MOOD = {
  searching: "neutral",
  happy: "happy",
  sad: "sad",
} as const;

function PinoVisual({ state }: { state: PinoState }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={PINO_ASSET[STATO_MOOD[state]]}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      width={PINO_ASSET_W}
      height={PINO_ASSET_H}
      className={
        "h-[58px] w-[48px] shrink-0 object-contain " +
        (state === "searching" ? "animate-bounce" : "")
      }
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
    setState("searching");
    const timer = window.setTimeout(
      () => setState(hasResults ? "happy" : "sad"),
      650
    );
    return () => window.clearTimeout(timer);
  }, [hasResults, query]);

  if (!query) return null;

  return (
    <aside
      aria-label="Assistente di ricerca Pino"
      className="flex min-h-[66px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
    >
      <PinoVisual state={state} />

      <div className="min-w-0 flex-1">
        <div className="inline-flex max-w-full items-center rounded-xl rounded-bl-sm bg-blue-50 px-2.5 py-1 text-[11px] font-bold leading-tight text-blue-900">
          <span className="truncate">
            {state === "searching"
              ? "Ciao, sono Pino 👋"
              : state === "happy"
                ? "Ho trovato!"
                : "Non ho trovato risultati"}
          </span>
        </div>

        <p className="mt-1 truncate text-[10px] font-medium text-slate-500">
          {state === "searching"
            ? "Cerco “" + query + "” per te..."
            : state === "happy"
              ? resultCount +
                (resultCount === 1
                  ? " risultato trovato"
                  : " risultati trovati")
              : "Prova con un termine più generico."}
        </p>
      </div>
    </aside>
  );
}
