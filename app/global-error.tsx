"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error] Errore non gestito nel root layout", error);
  }, [error]);

  return (
    <html lang="it">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <main className="flex min-h-screen items-center justify-center px-4 py-12">
          <div className="w-full max-w-md rounded-[2rem] border border-blue-100 bg-white p-10 text-center shadow-sm">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <AlertTriangle className="h-8 w-8 text-blue-500" aria-hidden />
            </span>
            <h1 className="mt-5 text-2xl font-black tracking-tight">
              Qualcosa è andato storto
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Si è verificato un errore durante il caricamento del sito. Riprova tra qualche istante.
            </p>
            <button
              type="button"
              onClick={unstable_retry}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 transition hover:bg-yellow-300"
            >
              Riprova
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
