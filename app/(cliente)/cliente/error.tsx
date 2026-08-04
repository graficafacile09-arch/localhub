"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary dell'Area Clienti (convenzione Next 16).
 * Mostra un messaggio professionale e consente di riprovare.
 */
export default function ClienteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Log per il monitoraggio lato server/analytics.
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-[2rem] border border-red-100 bg-white p-10 text-center shadow-sm">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900">
        Qualcosa è andato storto
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
        Si è verificato un errore durante il caricamento della pagina.
        Riprova tra qualche istante.
      </p>
      <button
        type="button"
        onClick={unstable_retry}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
      >
        Riprova
      </button>
    </div>
  );
}
