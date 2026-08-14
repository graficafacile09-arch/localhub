"use client";

import { useEffect } from "react";
import { AlertTriangle, Bot, RotateCcw } from "lucide-react";

/**
 * Error boundary localizzato della pagina Assistente AI.
 * Se il render della pagina (o della chat) fallisce, mostra un messaggio
 * chiaro con possibilità di riprovare — invece del GlobalError generico.
 */
export default function AssistenteAiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[assistente-ai] Errore pagina:", error);
  }, [error]);

  return (
    <div className="rounded-[2rem] border border-blue-100 bg-white p-10 text-center shadow-sm">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
        <AlertTriangle className="h-8 w-8 text-blue-500" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900">
        Impossibile caricare l&apos;assistente
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
        Si è verificato un errore durante il caricamento della pagina.
        Riprova tra qualche istante.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Riprova
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/amministratore/assistente-ai";
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Bot className="h-4 w-4" aria-hidden />
          Ricarica la pagina
        </button>
      </div>
    </div>
  );
}
