"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type StatoPino = "searching" | "positive" | "negative";

type Props = {
  query: string;
  productCount: number;
  storeCount: number;
  total: number;
  mobile?: boolean;
};

function suggerimento(query: string, positivo: boolean, totalResults: number): string {
  const q = query.toLocaleLowerCase("it-IT");

  if (!positivo) {
    if (/apert[oaie]|adesso|ora|stasera|oggi/.test(q)) {
      return "Posso provare una ricerca simile tenendo conto dell'orario.";
    }
    if (/vicin[oa]|centro|zona|quartiere|dintorni/.test(q)) {
      return "Posso provare a restringere la zona o cercare una categoria vicina.";
    }
    return "Posso aiutarti a riformulare la ricerca e provare di nuovo.";
  }

  if (/apert[oaie]|adesso|ora|stasera|oggi|chius[oaie]/.test(q)) {
    return `Posso controllare insieme quali dei ${totalResults} risultati rispondono davvero all'orario che cerchi.`;
  }

  if (/vicin[oa]|centro|zona|quartiere|dintorni/.test(q)) {
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
  mobile = false,
}: Props) {
  const totalResults = Math.max(total, productCount, storeCount);
  const positivo = totalResults > 0;
  const [stato, setStato] = useState<StatoPino>("searching");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStato(positivo ? "positive" : "negative");
    }, 900);

    return () => window.clearTimeout(timer);
  }, [positivo]);

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

  const bubbleClass = mobile
    ? "absolute left-0 top-0 z-20 w-[190px] -translate-x-2"
    : "absolute left-[-28px] top-2 z-20 w-[195px]";

  return (
    <aside
      aria-label={statoLabel}
      className={
        mobile
          ? "relative float-right mb-3 ml-3 h-[170px] w-[145px] max-w-[48%]"
          : "relative float-right mb-4 ml-4 h-[330px] w-[205px]"
      }
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label="Clicca Pino per farti aiutare con questa ricerca"
        title="Chiedi aiuto a Pino"
        className="relative block h-full w-full overflow-visible rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2"
      >
        <div className={bubbleClass}>
          <div className="relative rounded-[1.15rem] border border-blue-200 bg-white px-3 py-2.5 shadow-[0_10px_28px_-14px_rgba(30,64,175,0.55)]">
            <span
              aria-hidden="true"
              className="absolute -bottom-2 right-10 h-4 w-4 rotate-45 border-b border-r border-blue-200 bg-white"
            />
            <p className="text-[9px] font-black uppercase tracking-[0.13em] text-blue-600">
              Pino
            </p>
            <p className="mt-1 line-clamp-2 break-words text-[11px] font-bold leading-4 text-slate-900">
              “{query}”
            </p>
            <p
              aria-live="polite"
              className="mt-1.5 text-[11px] leading-4 text-slate-600"
            >
              {messaggio}
            </p>
            {stato !== "searching" && (
              <p className="mt-1.5 text-[10px] font-black leading-4 text-blue-700">
                Tocca Pino e ti aiuto.
              </p>
            )}
          </div>
        </div>

        <Image
          src="/pino-assistente.jpg"
          alt=""
          width={420}
          height={514}
          sizes={mobile ? "145px" : "205px"}
          className={
            stato === "searching"
              ? mobile
                ? "pino-image pino-searching absolute bottom-0 right-0 w-[118px]"
                : "pino-image pino-searching absolute bottom-0 right-0 w-[205px]"
              : stato === "positive"
                ? mobile
                  ? "pino-image pino-positive absolute bottom-0 right-0 w-[118px]"
                  : "pino-image pino-positive absolute bottom-0 right-0 w-[205px]"
                : mobile
                  ? "pino-image pino-negative absolute bottom-0 right-0 w-[118px]"
                  : "pino-image pino-negative absolute bottom-0 right-0 w-[205px]"
          }
        />
      </button>

      <style jsx>{`
        .pino-image {
          height: auto;
          object-fit: contain;
          transform-origin: 50% 94%;
          will-change: transform, filter;
          user-select: none;
          -webkit-user-drag: none;
          mix-blend-mode: multiply;
          filter: drop-shadow(0 12px 14px rgba(15, 23, 42, .13));
          transition: filter 180ms ease;
        }

        .pino-searching {
          animation: pino-searching 700ms ease-in-out infinite;
        }

        .pino-positive {
          animation: pino-positive 900ms cubic-bezier(.18,.82,.18,1) 1;
          filter: saturate(1.08) drop-shadow(0 14px 18px rgba(15, 23, 42, .14));
        }

        .pino-negative {
          animation: pino-negative 1150ms ease-in-out 1;
          filter: saturate(.7) brightness(.92) drop-shadow(0 10px 13px rgba(15, 23, 42, .12));
        }

        @keyframes pino-searching {
          0%, 100% {
            transform: translate3d(0, 2px, 0) rotate(0deg) scale(1);
          }
          18% {
            transform: translate3d(-4px, -2px, 0) rotate(-1.6deg) scale(1.008);
          }
          45% {
            transform: translate3d(5px, 0, 0) rotate(1.5deg) scale(1.014);
          }
          72% {
            transform: translate3d(-3px, -3px, 0) rotate(-1deg) scale(1.006);
          }
        }

        @keyframes pino-positive {
          0% {
            transform: translate3d(0, 14px, 0) rotate(-1.3deg) scale(.96);
          }
          32% {
            transform: translate3d(0, -9px, 0) rotate(1.2deg) scale(1.035);
          }
          55% {
            transform: translate3d(0, 2px, 0) rotate(-.35deg) scale(1.012);
          }
          76% {
            transform: translate3d(0, -3px, 0) rotate(.22deg) scale(1.006);
          }
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
        }

        @keyframes pino-negative {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
          24% {
            transform: translate3d(-4px, 7px, 0) rotate(-2deg) scale(.99);
          }
          52% {
            transform: translate3d(4px, 12px, 0) rotate(2.4deg) scale(.98);
          }
          76% {
            transform: translate3d(-2px, 14px, 0) rotate(-1.8deg) scale(.975);
          }
          100% {
            transform: translate3d(0, 10px, 0) rotate(-.8deg) scale(.985);
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
