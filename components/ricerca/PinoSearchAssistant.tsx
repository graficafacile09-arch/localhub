"use client";

import { useEffect, useState } from "react";

type StatoPino = "searching" | "positive" | "negative";

type Props = {
  query: string;
  productCount: number;
  storeCount: number;
  total: number;
};

const PINO_IMAGES: Record<StatoPino, string> = {
  searching: "/pino-assistente-searching.gif",
  positive: "/pino-assistente-happy.gif",
  negative: "/pino-assistente-sad.gif",
};

function suggerimento(query: string, positivo: boolean, totalResults: number): string {
  const q = query.toLocaleLowerCase("it-IT");

  if (!positivo) {
    if (/apert[oaie]|adesso|ora|stasera|oggi/.test(q)) {
      return "Posso provare a cercare qualcosa di adatto all'orario.";
    }
    if (/vicin[oaie]|centro|zona|quartiere|dintorni/.test(q)) {
      return "Posso restringere la ricerca alla zona che ti interessa.";
    }
    return "Possiamo provare con una ricerca simile o un termine più preciso.";
  }

  if (/apert[oaie]|adesso|ora|stasera|oggi|chius[oaie]/.test(q)) {
    return "Posso aiutarti a restringere i risultati in base all'orario.";
  }
  if (/vicin[oaie]|centro|zona|quartiere|dintorni/.test(q)) {
    return "Posso aiutarti a restringere i risultati alla zona.";
  }
  if (/sotto|meno di|massimo|max |budget|prezzo|economico|economica|€/.test(q)) {
    return "Posso aiutarti a restringere i risultati per prezzo.";
  }
  return `Ho trovato ${totalResults} risultati. Posso aiutarti a orientarti tra quelli più pertinenti.`;
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
    }, 1100);

    return () => window.clearTimeout(timer);
  }, [positivo, query]);

  const testo =
    stato === "searching"
      ? `Sto cercando “${query}”…`
      : positivo
        ? `Per “${query}”: ${suggerimento(query, true, totalResults)}`
        : `Per “${query}”: non ho trovato corrispondenze. ${suggerimento(query, false, 0)}`;

  const statoLabel =
    stato === "searching"
      ? "Pino sta cercando"
      : positivo
        ? "Pino ha trovato risultati"
        : "Pino non ha trovato risultati";

  return (
    <aside
      aria-label={statoLabel}
      className="pino-assistant mb-5 w-full"
    >
      <div className="pino-row mx-auto flex w-full max-w-4xl items-end gap-3 px-1 sm:gap-4">
        <div className="pino-character shrink-0" aria-hidden="true">
          <img
            src={PINO_IMAGES[stato]}
            alt=""
            width={180}
            height={220}
            draggable={false}
            className={
              "pino-image " +
              (stato === "positive"
                ? "pino-positive"
                : stato === "negative"
                  ? "pino-negative"
                  : "pino-searching")
            }
          />
        </div>

        <div className="pino-bubble relative mb-4 min-w-0 max-w-[560px] rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-[0_8px_24px_-18px_rgba(15,23,42,.45)] sm:mb-5 sm:px-5 sm:py-3.5">
          <span
            aria-hidden="true"
            className="absolute bottom-4 -left-2 h-4 w-4 rotate-45 border-b border-l border-blue-100 bg-white"
          />

          <div className="relative">
            <div className="mb-1 flex items-center gap-2">
              <span
                className={
                  "h-2.5 w-2.5 rounded-full " +
                  (stato === "searching"
                    ? "bg-blue-500 animate-pulse"
                    : stato === "positive"
                      ? "bg-emerald-500"
                      : "bg-rose-400")
                }
              />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                Pino
              </span>
            </div>

            <p
              aria-live="polite"
              className="m-0 text-sm font-semibold leading-5 text-slate-800 sm:text-[15px]"
            >
              {testo}
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .pino-row {
          min-height: 190px;
        }

        .pino-character {
          width: 150px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .pino-image {
          display: block;
          width: auto;
          height: 190px;
          max-width: none;
          object-fit: contain;
          transform-origin: 50% 94%;
          user-select: none;
          -webkit-user-drag: none;
          filter: drop-shadow(0 6px 8px rgba(15, 23, 42, 0.13));
        }

        .pino-searching {
          animation: pinoSearch 0.9s ease-in-out infinite alternate;
        }

        .pino-positive {
          animation: pinoHappy 0.65s ease-out 2;
        }

        .pino-negative {
          animation: pinoSad 0.85s ease-out 1;
        }

        @keyframes pinoSearch {
          from {
            transform: translateY(2px) rotate(-1.5deg);
          }
          to {
            transform: translateY(-5px) rotate(1.5deg);
          }
        }

        @keyframes pinoHappy {
          0%, 100% {
            transform: translateY(0) rotate(0);
          }
          35% {
            transform: translateY(-7px) rotate(-2.5deg);
          }
          65% {
            transform: translateY(-3px) rotate(2.5deg);
          }
        }

        @keyframes pinoSad {
          0%, 100% {
            transform: translateY(0);
          }
          45% {
            transform: translateY(3px) rotate(-2deg);
          }
        }

        @media (max-width: 640px) {
          .pino-row {
            min-height: 128px;
            gap: 8px;
            padding-left: 0;
            padding-right: 0;
          }

          .pino-character {
            width: 88px;
          }

          .pino-image {
            height: 128px;
          }

          .pino-bubble {
            margin-bottom: 10px;
            padding: 9px 11px;
          }
        }
      `}
      </style>
    </aside>
  );
}
