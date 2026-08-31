"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import BackButton from "@/components/BackButton";

/**
 * Error boundary globale (500) per le pagine pubbliche.
 * Mostra un messaggio professionale, consente di riprovare e offre
 * sempre una via d'uscita (BackButton con fallback alla home).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-blue-100 bg-white p-10 text-center shadow-sm">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <AlertTriangle className="h-8 w-8 text-blue-500" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900">
          Qualcosa è andato storto
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          Si è verificato un errore durante il caricamento della pagina.
          Riprova tra qualche istante.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={unstable_retry}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-yellow-400 hover:text-blue-900"
          >
            Riprova
          </button>
          <BackButton label="Torna alla home" />
        </div>
      </div>
    </div>
  );
}