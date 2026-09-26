"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

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

  const messaggio = useMemo(() => {
    if (stato === "searching") return "Sto controllando la tua ricerca…";
    if (positivo) {
      return `Ho trovato ${totalResults} ${totalResults === 1 ? "risultato" : "risultati"}. ${suggerimento(query, true, totalResults)}`;
    }
    return `Non ho trovato risultati utili. ${suggerimento(query, false, 0)}`;
  }, [query, positivo, stato, totalResults]);

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent("assistant:open", {
        detail: { initialQuery: query },
      })
    );
  };

  return (
    <aside
      aria-label={
        stato === "searching"
          ? "Pino sta cercando"
          : positivo
            ? "Pino ha trovato risultati"
            : "Pino non ha trovato risultati"
      }
      className={
        mobile
          ? "relative float-right mb-3 ml-3 h-[118px] w-[132px] max-w-[45%]"
          : "relative float-right mb-4 ml-4 min-h-[320px] w-[205px]"
      }
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label="Clicca Pino per ricevere aiuto con questa ricerca"
        title="Chiedi aiuto a Pino"
        className={
          mobile
            ? "relative flex h-full w-full items-end justify-end overflow-visible focus:outline-none"
            : "relative flex min-h-[320px] w-full items-end justify-center overflow-visible focus:outline-none"
        }
      >
        <div
          className={
            mobile
              ? "absolute right-[72px] top-0 z-20 w-[225px]"
              : "absolute right-[-16px] top-0 z-20 w-[215px]"
          }
        >
          <div className="relative rounded-2xl border border-blue-200 bg-white/95 px-3 py-2.5 text-left shadow-md shadow-blue-900/10 backdrop-blur-sm">
            <span className="absolute -bottom-2 right-12 h-4 w-4 rotate-45 border-b border-r border-blue-200 bg-white/95" />
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-blue-600">Pino</p>
            <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 text-slate-900">“{query}”</p>
            <p aria-live="polite" className="mt-1.5 line-clamp-4 text-[11px] leading-4 text-slate-600">{messaggio}</p>
            {stato !== "searching" && (
              <p className="mt-1.5 text-[10px] font-black text-blue-700">Clicca su Pino e ti aiuto →</p>
            )}
          </div>
        </div>

        <Image
          src="/pino-assistente.jpg"
          alt=""
          width={420}
          height={514}
          sizes={mobile ? "132px" : "205px"}
          className={
            stato === "searching"
              ? mobile ? "pino-image pino-searching w-[132px]" : "pino-image pino-searching w-[205px]"
              : stato === "positive"
                ? mobile ? "pino-image pino-positive w-[132px]" : "pino-image pino-positive w-[205px]"
                : mobile ? "pino-image pino-negative w-[132px]" : "pino-image pino-negative w-[205px]"
          }
        />
      </button>

      <style jsx>{`
        .pino-image {
          height: auto;
          object-fit: contain;
          transform-origin: 50% 92%;
          will-change: transform, filter;
          user-select: none;
          -webkit-user-drag: none;
          mix-blend-mode: multiply;
          filter: drop-shadow(0 10px 12px rgba(15, 23, 42, .10));
        }

        .pino-searching { animation: pino-looking 680ms ease-in-out infinite; }
        .pino-positive { animation: pino-found 760ms cubic-bezier(.2,.8,.2,1) 1; }
        .pino-negative {
          animation: pino-sad 1050ms ease-in-out 1;
          filter: saturate(.72) brightness(.93) drop-shadow(0 10px 12px rgba(15, 23, 42, .10));
        }

        @keyframes pino-looking {
          0%, 100% { transform: translate3d(0, 2px, 0) rotate(0deg) scale(1); }
          20% { transform: translate3d(-4px, -2px, 0) rotate(-1.5deg) scale(1.01); }
          50% { transform: translate3d(4px, 0, 0) rotate(1.2deg) scale(1.012); }
          80% { transform: translate3d(-3px, -1px, 0) rotate(-.9deg) scale(1.008); }
        }

        @keyframes pino-found {
          0% { transform: translate3d(0, 13px, 0) rotate(-1deg) scale(.97); }
          34% { transform: translate3d(0, -9px, 0) rotate(1.2deg) scale(1.03); }
          58% { transform: translate3d(0, 2px, 0) rotate(-.25deg) scale(1.008); }
          78% { transform: translate3d(0, -3px, 0) rotate(.2deg) scale(1.005); }
          100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
        }

        @keyframes pino-sad {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          24% { transform: translate3d(-4px, 6px, 0) rotate(-2deg) scale(.99); }
          52% { transform: translate3d(4px, 10px, 0) rotate(2.1deg) scale(.985); }
          80% { transform: translate3d(-2px, 12px, 0) rotate(-1.4deg) scale(.98); }
          100% { transform: translate3d(0, 9px, 0) rotate(-.7deg) scale(.985); }
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
