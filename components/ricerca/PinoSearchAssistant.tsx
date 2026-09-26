"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Search } from "lucide-react";

type StatoPino = "searching" | "positive" | "negative";

type Props = {
  query: string;
  productCount: number;
  storeCount: number;
  total: number;
};

const PINO_IMAGE = "/pino-assistente.gif";

function suggerimento(query: string, positivo: boolean, totalResults: number): string {
  const q = query.toLocaleLowerCase("it-IT");

  if (!positivo) {
    if (/apert[oaie]|adesso|ora|stasera|oggi/.test(q)) {
      return "Provo a cercarlo in modo più mirato, anche pensando all'orario.";
    }
    if (/vicin[oaie]|centro|zona|quartiere|dintorni/.test(q)) {
      return "Posso restringere la ricerca alla zona che ti interessa.";
    }
    return "Se vuoi, possiamo provare una ricerca simile.";
  }

  if (/apert[oaie]|adesso|ora|stasera|oggi|chius[oaie]/.test(q)) {
    return "Posso aiutarti a trovare tra questi i più adatti all'orario.";
  }
  if (/vicin[oaie]|centro|zona|quartiere|dintorni/.test(q)) {
    return "Posso aiutarti a restringere la ricerca alla zona.";
  }
  if (/sotto|meno di|massimo|max |budget|prezzo|economico|economica|€/.test(q)) {
    return "Posso aiutarti a restringere i risultati per prezzo.";
  }
  return "Ne ho trovati " + totalResults + ". Posso aiutarti a scegliere quelli più pertinenti.";
}

export default function PinoSearchAssistant({
  query,
  productCount,
  storeCount,
  total,
}: Props) {
  const totalResults = Math.max(total, productCount, storeCount);
  const positivo = totalResults > 0;
  const [stato, setStato] = useState<StatoPino>("searching");
  const [ricercaAperta, setRicercaAperta] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStato("searching");
    const timer = window.setTimeout(() => {
      setStato(positivo ? "positive" : "negative");
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [positivo, query]);

  const risposta =
    stato === "searching"
      ? "Dammi un secondo, guardo cosa ho trovato…"
      : positivo
        ? "Per “" + query + "” " + suggerimento(query, true, totalResults)
        : "Per “" + query + "” non ho trovato corrispondenze. " + suggerimento(query, false, 0);

  const statoLabel =
    stato === "searching"
      ? "Pino sta esaminando i risultati"
      : positivo
        ? "Pino ha trovato risultati"
        : "Pino non ha trovato risultati";

  const handleClick = () => {
    setRicercaAperta(true);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  };

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = inputRef.current?.value.trim() ?? "";
    if (!value) return;
    window.location.assign("/ricerca?q=" + encodeURIComponent(value));
  };

  return (
    <aside aria-label={statoLabel} className="mb-4 w-full">
      <div className="pino-wrap group mx-auto flex w-full max-w-3xl items-end justify-center gap-2 text-left sm:gap-3">
        <button type="button" onClick={handleClick} aria-label="Usa la ricerca con Pino" title="Cerca con Pino" className="pino-character relative block w-[94px] shrink-0 cursor-pointer sm:w-[118px]">
          <img
            src={PINO_IMAGE}
            alt=""
            width={280}
            height={342}
            draggable={false}
            className={"pino-image " + (stato === "positive" ? "pino-positive" : stato === "negative" ? "pino-negative" : "pino-searching")}
          />
          {stato === "searching" && <span className="pino-search-lens" aria-hidden="true"><Search className="h-7 w-7" strokeWidth={3} /></span>}
          {stato === "positive" && (
            <span className="pino-face pino-face-happy" aria-hidden="true">
              <span className="pino-eye pino-eye-left" />
              <span className="pino-eye pino-eye-right" />
              <span className="pino-mouth pino-mouth-happy" />
            </span>
          )}
          {stato === "negative" && (
            <span className="pino-face pino-face-sad" aria-hidden="true">
              <span className="pino-eyebrow pino-eyebrow-left" />
              <span className="pino-eyebrow pino-eyebrow-right" />
              <span className="pino-eye pino-eye-left" />
              <span className="pino-eye pino-eye-right" />
              <span className="pino-mouth pino-mouth-sad" />
            </span>
          )}
        </button>

        <span className="pino-bubble relative mb-7 block min-w-0 max-w-[520px] rounded-[20px] border-2 border-yellow-400 bg-yellow-300 px-4 py-3 shadow-[0_8px_22px_-16px_rgba(15,23,42,.55)] sm:px-5 sm:py-3.5">
          <span aria-hidden="true" className="absolute -bottom-2.5 left-[-8px] h-4 w-4 rotate-45 border-b-2 border-l-2 border-yellow-400 bg-yellow-300" />
          <span className="relative block text-[11px] font-black uppercase tracking-[0.12em] text-blue-950">
            {stato === "searching" ? "Pino è al lavoro" : positivo ? "Trovato! Sono Pino" : "Uffa… niente trovato"}
          </span>
          <span className="relative mt-0.5 block text-sm font-black leading-5 text-blue-950 sm:text-base">
            {stato === "searching" ? "Sto cercando per te…" : positivo ? "Ho trovato qualcosa per te!" : "Questa volta non ho trovato nulla."}
          </span>
          <span aria-live="polite" className="relative mt-1.5 block text-[11px] font-semibold leading-4 text-blue-950/85 sm:text-xs">
            {risposta}
          </span>
          {stato !== "searching" && !ricercaAperta && (
            <button type="button" onClick={handleClick} className="relative mt-2 rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-black text-white shadow-sm transition hover:bg-blue-800">
              Cerca ancora con Pino
            </button>
          )}
          {ricercaAperta && (
            <form onSubmit={handleSearch} className="relative mt-2 flex items-center gap-2">
              <input ref={inputRef} name="q" defaultValue={query} placeholder="Cosa cerchiamo?" aria-label="Cerca con Pino" className="h-9 min-w-0 flex-1 rounded-lg border-2 border-blue-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-blue-500" />
              <button type="submit" aria-label="Avvia ricerca" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white shadow-sm transition hover:bg-blue-800">
                <Search className="h-4 w-4" strokeWidth={3} />
              </button>
            </form>
          )}
        </span>
      </div>

      <style jsx>{`
        .pino-wrap {
          min-height: 148px;
        }

        .pino-character {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          overflow: visible;
        }

        .pino-image {
          display: block;
          height: 170px;
          width: auto;
          max-width: 100%;
          object-fit: contain;
          transform-origin: 50% 94%;
          will-change: transform, filter;
          user-select: none;
          -webkit-user-drag: none;
          filter: drop-shadow(0 7px 8px rgba(15, 23, 42, .15));
        }

        .pino-searching { animation: pinoSearch 0.85s ease-in-out infinite alternate; }
        .pino-search-lens { position:absolute; right:-2px; top:8px; display:flex; height:48px; width:48px; align-items:center; justify-content:center; border:4px solid #1d4ed8; border-radius:9999px; background:#facc15; color:#1d4ed8; box-shadow:0 5px 12px rgba(15,23,42,.2); animation:lensSweep .85s ease-in-out infinite alternate; }
        .pino-result-face { position:absolute; right:-2px; top:8px; display:grid; height:42px; width:42px; place-items:center; border-radius:9999px; background:white; box-shadow:0 5px 12px rgba(15,23,42,.18); font-size:26px; animation:resultPop .45s ease-out both; }
        .pino-happy { border:3px solid #22c55e; }
        .pino-sad { border:3px solid #94a3b8; }
        @keyframes pinoSearch { from { transform:translateY(2px) rotate(-2deg); } to { transform:translateY(-7px) rotate(2deg); } }
        @keyframes lensSweep { from { transform:translate(-4px,3px) rotate(-10deg); } to { transform:translate(5px,-2px) rotate(10deg); } }
        @keyframes facePop { from { transform:translateX(-50%) scale(.55); opacity:0; } to { transform:translateX(-50%) scale(1); opacity:1; } }
        .pino-positive { animation: pinoHappy .7s ease-out 2;
          filter: saturate(1.12) drop-shadow(0 9px 10px rgba(15, 23, 42, .16));
        }

        .pino-negative { animation: pinoSad .9s ease-out 1;
          filter: saturate(.72) brightness(.94) drop-shadow(0 7px 8px rgba(15, 23, 42, .13));
        }


        @keyframes pinoHappy { 0%,100% { transform:translateY(0) rotate(0); } 35% { transform:translateY(-10px) rotate(-4deg); } 65% { transform:translateY(-5px) rotate(4deg); } }
        @keyframes pinoSad { 0%,100% { transform:translateY(0); } 45% { transform:translateY(4px) rotate(-3deg); } }

        @media (max-width: 640px) {
          .pino-wrap {
            min-height: 112px;
            gap: 6px;
          }

          .pino-character {
            width: 78px;
          }

          .pino-image {
            height: 112px;
          }

          .pino-bubble {
            margin-bottom: 18px;
            padding: 10px 12px;
          }
        }

      `}
      </style>
    </aside>
  );
}
