"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";

type StatoPino = "searching" | "positive" | "negative";

type PinoSearchAssistantProps = {
  query: string;
  productCount: number;
  storeCount: number;
  total: number;
};

function getSuggerimento(query: string, positivo: boolean): string {
  const q = query.toLocaleLowerCase("it-IT");

  if (!positivo) {
    return "Non vedo corrispondenze utili. Posso aiutarti a riformulare la frase o a cercare una categoria vicina.";
  }

  if (/apert[oaie]|adesso|ora|stasera|oggi|chius[oaie]/.test(q)) {
    return "Posso aiutarti a restringere i risultati alle attività aperte nel momento che ti serve.";
  }

  if (/vicin[oa]|centro|zona|quartiere|nei dintorni/.test(q)) {
    return "Posso aiutarti a restringere i risultati alla zona che ti interessa.";
  }

  if (/sotto|meno di|massimo|max |budget|prezzo|economico|economica|€/.test(q)) {
    return "Posso aiutarti a confrontare i risultati per prezzo e a restringere la ricerca.";
  }

  if (/pizzeria|ristorante|bar|farmacia|parrucchier|dentist|professionist|servizio/.test(q)) {
    return "Posso aiutarti a confrontare le attività trovate e a capire quali rispondono meglio alla tua richiesta.";
  }

  return "Posso aiutarti a capire quali risultati sono più pertinenti e a restringere la ricerca.";
}

export default function PinoSearchAssistant({
  query,
  productCount,
  storeCount,
  total,
}: PinoSearchAssistantProps) {
  const positivo = total > 0 || productCount > 0 || storeCount > 0;
  const [stato, setStato] = useState<StatoPino>("searching");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStato(positivo ? "positive" : "negative");
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [positivo]);

  const suggerimento = useMemo(
    () => getSuggerimento(query, positivo),
    [query, positivo]
  );

  const statusText =
    stato === "searching"
      ? "Sto esplorando i risultati…"
      : positivo
        ? "Ho trovato qualcosa per te!"
        : "Questa ricerca non ha trovato corrispondenze.";

  const emotion = stato === "searching" ? "🔎" : positivo ? "😊" : "😔";

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent("assistant:open", {
        detail: { initialQuery: query },
      })
    );
  };

  return (
    <section
      aria-labelledby="pino-search-title"
      className="mb-4 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
    >
      <div className="grid items-center gap-4 p-3 sm:grid-cols-[150px,minmax(0,1fr)] sm:p-4">
        <div className="relative mx-auto w-[145px] shrink-0 sm:w-[150px]">
          <button
            type="button"
            onClick={handleClick}
            aria-label="Chiedi a Pino di aiutarti con questa ricerca"
            title="Chiedi a Pino"
            className="pino-hit relative block w-full overflow-visible rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2"
          >
            <div className="relative aspect-[587/718] w-full">
              <Image
                src="/pino-assistente.jpg"
                alt="Pino, l'assistente AI di InCittà"
                fill
                sizes="150px"
                className="object-contain"
                priority={false}
              />
            </div>

            <span
              aria-hidden="true"
              className="absolute right-0 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-md ring-1 ring-slate-100"
            >
              {emotion}
            </span>

            {stato === "searching" && (
              <span
                aria-hidden="true"
                className="pino-lens absolute left-1 top-8 flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-blue-700 shadow-lg"
              >
                <Search className="h-4 w-4" />
              </span>
            )}
          </button>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="pino-search-title"
              className="text-base font-black tracking-tight text-slate-900 sm:text-lg"
            >
              Pino
            </h2>
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-blue-900">
              AI Assistant
            </span>
            <span
              aria-live="polite"
              className={`ml-auto text-[11px] font-bold ${positivo ? "text-blue-700" : "text-slate-500"}`}
            >
              {statusText}
            </span>
          </div>

          <div className="relative mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 before:absolute before:-left-2 before:top-5 before:h-4 before:w-4 before:rotate-45 before:border-b before:border-l before:border-slate-200 before:bg-slate-50">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              Hai cercato
            </p>
            <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-900">
              “{query}”
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {suggerimento}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClick}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-black text-blue-900 shadow-sm transition hover:bg-yellow-300 active:scale-[0.98]"
          >
            Chiedi a Pino
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <style jsx>{`
        .pino-hit {
          transform: translateZ(0);
          transition: transform 180ms ease, filter 180ms ease;
        }

        .pino-hit:hover {
          transform: translateY(-2px) scale(1.01);
        }

        .pino-lens {
          animation: pino-lens-search 900ms ease-in-out infinite;
        }

        .pino-hit:has(.pino-lens) {
          animation: pino-search-move 900ms ease-in-out infinite;
        }

        @keyframes pino-search-move {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-5px) rotate(-1.2deg); }
          75% { transform: translateX(5px) rotate(1.2deg); }
        }

        @keyframes pino-lens-search {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(82px, 28px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .pino-hit,
          .pino-lens {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
