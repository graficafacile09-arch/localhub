"use client";

import { useEffect, useState } from "react";

type StatoPino = "searching" | "positive" | "negative";

type Props = {
  query: string;
  productCount: number;
  storeCount: number;
  total: number;
};

const PINO_IMAGE =
  "https://raw.githubusercontent.com/graficafacile09-arch/localhub/87b42980c5cf1131f22f08ddc706bfe64c306072/public/pino-assistente.jpg";

function suggerimento(query: string, positivo: boolean, totalResults: number): string {
  const q = query.toLocaleLowerCase("it-IT");

  if (!positivo) {
    if (/apert[oaie]|adesso|ora|stasera|oggi/.test(q)) {
      return "Posso provare una ricerca simile tenendo conto dell'orario.";
    }
    if (/vicin[oaie]|centro|zona|quartiere|dintorni/.test(q)) {
      return "Posso provare a restringere la zona o cercare una categoria vicina.";
    }
    return "Posso aiutarti a riformulare la ricerca e provare di nuovo.";
  }

  if (/apert[oaie]|adesso|ora|stasera|oggi|chius[oaie]/.test(q)) {
    return `Posso aiutarti a capire quali dei ${totalResults} risultati sono più adatti all'orario che cerchi.`;
  }
  if (/vicin[oaie]|centro|zona|quartiere|dintorni/.test(q)) {
    return "Posso aiutarti a restringere la ricerca alla zona che ti interessa.";
  }
  if (/sotto|meno di|massimo|max |budget|prezzo|economico|economica|€/.test(q)) {
    return "Posso aiutarti a restringere i risultati in base al prezzo.";
  }
  return "Posso aiutarti a capire quali risultati sono più pertinenti per quello che cerchi.";
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

  useEffect(() => {
    setStato("searching");
    const timer = window.setTimeout(() => {
      setStato(positivo ? "positive" : "negative");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [positivo, query]);

  const messaggio =
    stato === "searching"
      ? "Sto guardando cosa c'è nella tua ricerca…"
      : positivo
        ? `Ho trovato ${totalResults} ${totalResults === 1 ? "risultato" : "risultati"}. ${suggerimento(query, true, totalResults)}`
        : `Non ho trovato corrispondenze utili. ${suggerimento(query, false, 0)}`;

  const statoLabel =
    stato === "searching"
      ? "Pino sta esaminando i risultati"
      : positivo
        ? "Pino ha trovato risultati pertinenti"
        : "Pino non ha trovato risultati pertinenti";

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent("assistant:open", {
        detail: { initialQuery: query },
      })
    );
  };

  return (
    <aside
      aria-label={statoLabel}
      className="mb-3 flex w-full items-end justify-end gap-2 sm:gap-3"
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label="Clicca Pino per farti aiutare con questa ricerca"
        title="Chiedi aiuto a Pino"
        className="group flex max-w-full items-end gap-2 rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2"
      >
        <div className="relative w-[min(245px,calc(100vw-125px))] min-w-0 rounded-2xl border border-blue-200 bg-white px-3 py-2 shadow-[0_8px_24px_-16px_rgba(30,64,175,0.6)] sm:w-[245px]">
          <span
            aria-hidden="true"
            className="absolute -right-1.5 bottom-3 h-3 w-3 rotate-45 border-r border-t border-blue-200 bg-white"
          />
          <p className="text-[9px] font-black uppercase tracking-[0.13em] text-blue-600">
            Pino
          </p>
          <p className="mt-0.5 truncate text-[11px] font-bold text-slate-900" title={query}>
            “{query}”
          </p>
          <p aria-live="polite" className="mt-1 text-[10px] leading-4 text-slate-600 sm:text-[11px]">
            {messaggio}
          </p>
          {stato !== "searching" && (
            <p className="mt-1 text-[9px] font-black text-blue-700">
              Tocca Pino e ti aiuto.
            </p>
          )}
        </div>

        <span className="relative block w-[76px] shrink-0 sm:w-[92px]" aria-hidden="true">
          <img
            src={PINO_IMAGE}
            alt=""
            width={420}
            height={514}
            draggable={false}
            className={`pino-image w-full ${stato === "searching" ? "pino-searching" : stato === "positive" ? "pino-positive" : "pino-negative"}`}
          />
        </span>
      </button>

      <style jsx>{`
        .pino-image {
          height: auto;
          display: block;
          object-fit: contain;
          transform-origin: 50% 94%;
          will-change: transform, filter;
          user-select: none;
          -webkit-user-drag: none;
          mix-blend-mode: multiply;
          filter: drop-shadow(0 8px 10px rgba(15, 23, 42, .12));
        }

        .pino-searching {
          animation: pino-searching 700ms ease-in-out infinite;
        }

        .pino-positive {
          animation: pino-positive 900ms cubic-bezier(.18,.82,.18,1) 1;
          filter: saturate(1.08) drop-shadow(0 10px 13px rgba(15, 23, 42, .13));
        }

        .pino-negative {
          animation: pino-negative 1150ms ease-in-out 1;
          filter: saturate(.7) brightness(.92) drop-shadow(0 8px 10px rgba(15, 23, 42, .11));
        }

        @keyframes pino-searching {
          0%, 100% { transform: translate3d(0, 1px, 0) rotate(0deg) scale(1); }
          20% { transform: translate3d(-3px, -2px, 0) rotate(-1.5deg) scale(1.01); }
          50% { transform: translate3d(4px, 0, 0) rotate(1.3deg) scale(1.014); }
          80% { transform: translate3d(-2px, -2px, 0) rotate(-.8deg) scale(1.006); }
        }

        @keyframes pino-positive {
          0% { transform: translate3d(0, 10px, 0) rotate(-1deg) scale(.97); }
          35% { transform: translate3d(0, -6px, 0) rotate(1.1deg) scale(1.025); }
          60% { transform: translate3d(0, 1px, 0) rotate(-.25deg) scale(1.006); }
          100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
        }

        @keyframes pino-negative {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          25% { transform: translate3d(-3px, 5px, 0) rotate(-1.8deg) scale(.99); }
          55% { transform: translate3d(3px, 9px, 0) rotate(2deg) scale(.98); }
          100% { transform: translate3d(0, 7px, 0) rotate(-.7deg) scale(.985); }
        }

        @media (prefers-reduced-motion: reduce) {
          .pino-searching,
          .pino-positive,
          .pino-negative {
            animation: none !important;
          }
        }
      `}</style>
    </aside>
  );
}
