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
    <aside aria-label={statoLabel} className="mb-4 w-full">
      <button
        type="button"
        onClick={handleClick}
        aria-label="Clicca Pino per farti aiutare con questa ricerca"
        title="Chiedi aiuto a Pino"
        className="pino-card group relative flex w-full items-center overflow-hidden rounded-2xl border-2 border-yellow-400 bg-yellow-300 px-3 py-2.5 text-left shadow-[0_10px_28px_-18px_rgba(30,64,175,0.65)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-18px_rgba(30,64,175,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-offset-2 sm:px-4"
      >
        <div className="min-w-0 flex-1 pr-2 sm:pr-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-900">
            Pino · assistente ricerca
          </p>
          <p className="mt-0.5 truncate text-sm font-black text-blue-950 sm:text-base" title={query}>
            “{query}”
          </p>
          <p aria-live="polite" className="mt-1 max-w-2xl text-[11px] font-semibold leading-4 text-blue-950/85 sm:text-xs">
            {messaggio}
          </p>
          {stato !== "searching" && (
            <p className="mt-1 text-[10px] font-black text-blue-800">
              Tocca Pino per continuare.
            </p>
          )}
        </div>

        <span className="pino-stage relative block w-[96px] shrink-0 self-stretch sm:w-[118px]" aria-hidden="true">
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
        .pino-card {
          min-height: 112px;
        }

        .pino-stage {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          overflow: visible;
        }

        .pino-image {
          height: 116px;
          width: auto;
          max-width: 100%;
          display: block;
          object-fit: contain;
          transform-origin: 50% 96%;
          will-change: transform, filter;
          user-select: none;
          -webkit-user-drag: none;
          mix-blend-mode: multiply;
          filter: drop-shadow(0 8px 9px rgba(15, 23, 42, .14));
        }

        .pino-searching {
          animation: pino-searching 680ms ease-in-out infinite;
        }

        .pino-positive {
          animation: pino-positive 850ms cubic-bezier(.18,.82,.18,1) infinite;
          filter: saturate(1.14) drop-shadow(0 10px 12px rgba(15, 23, 42, .15));
        }

        .pino-negative {
          animation: pino-negative 1050ms ease-in-out infinite;
          filter: saturate(.72) brightness(.94) drop-shadow(0 8px 9px rgba(15, 23, 42, .12));
        }

        @keyframes pino-searching {
          0%, 100% { transform: translate3d(0, 2px, 0) rotate(0deg) scale(1); }
          20% { transform: translate3d(-5px, -3px, 0) rotate(-3deg) scale(1.015); }
          45% { transform: translate3d(5px, 0, 0) rotate(3deg) scale(1.025); }
          70% { transform: translate3d(-4px, -2px, 0) rotate(-2deg) scale(1.012); }
        }

        @keyframes pino-positive {
          0%, 100% { transform: translate3d(0, 1px, 0) rotate(0deg) scale(1); }
          22% { transform: translate3d(0, -9px, 0) rotate(-2deg) scale(1.04); }
          45% { transform: translate3d(0, 1px, 0) rotate(2deg) scale(1.02); }
          68% { transform: translate3d(0, -5px, 0) rotate(-1deg) scale(1.035); }
        }

        @keyframes pino-negative {
          0%, 100% { transform: translate3d(0, 4px, 0) rotate(0deg) scale(1); }
          25% { transform: translate3d(-6px, 7px, 0) rotate(-5deg) scale(.98); }
          55% { transform: translate3d(6px, 10px, 0) rotate(5deg) scale(.96); }
          80% { transform: translate3d(-3px, 8px, 0) rotate(-3deg) scale(.975); }
        }

        @media (max-width: 640px) {
          .pino-card {
            min-height: 96px;
            padding-right: 8px;
          }

          .pino-image {
            height: 94px;
          }

          .pino-stage {
            width: 82px;
          }
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
