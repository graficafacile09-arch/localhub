"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    setStato("searching");
    const timer = window.setTimeout(() => {
      setStato(positivo ? "positive" : "negative");
    }, 900);
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
        className="pino-wrap group mx-auto flex w-full max-w-3xl items-end justify-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 sm:gap-3"
      >
        <span className="pino-character relative block w-[94px] shrink-0 sm:w-[118px]" aria-hidden="true">
          <img
            src={PINO_IMAGE}
            alt=""
            width={280}
            height={342}
            draggable={false}
            className={"pino-image " + (stato === "positive" ? "pino-positive" : stato === "negative" ? "pino-negative" : "")}
          />
        </span>

        <span className="pino-bubble relative mb-7 block min-w-0 max-w-[520px] rounded-[20px] border-2 border-yellow-400 bg-yellow-300 px-4 py-3 shadow-[0_8px_22px_-16px_rgba(15,23,42,.55)] sm:px-5 sm:py-3.5">
          <span aria-hidden="true" className="absolute -bottom-2.5 left-[-8px] h-4 w-4 rotate-45 border-b-2 border-l-2 border-yellow-400 bg-yellow-300" />
          <span className="relative block text-[11px] font-black uppercase tracking-[0.12em] text-blue-950">
            Ciao! Sono Pino 👋
          </span>
          <span className="relative mt-0.5 block text-sm font-black leading-5 text-blue-950 sm:text-base">
            Il tuo assistente virtuale.
          </span>
          <span aria-live="polite" className="relative mt-1.5 block text-[11px] font-semibold leading-4 text-blue-950/85 sm:text-xs">
            {risposta}
          </span>
          {stato !== "searching" && (
            <span className="relative mt-1.5 block text-[10px] font-black text-blue-800">
              Tocca Pino se vuoi che ti aiuti.
            </span>
          )}
        </span>
      </button>

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
          height: 148px;
          width: auto;
          max-width: 100%;
          object-fit: contain;
          transform-origin: 50% 94%;
          will-change: transform, filter;
          user-select: none;
          -webkit-user-drag: none;
          filter: drop-shadow(0 7px 8px rgba(15, 23, 42, .15));
        }

        .pino-positive {
          filter: saturate(1.12) drop-shadow(0 9px 10px rgba(15, 23, 42, .16));
        }

        .pino-negative {
          filter: saturate(.72) brightness(.94) drop-shadow(0 7px 8px rgba(15, 23, 42, .13));
        }


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
