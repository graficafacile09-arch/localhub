"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Pagina di richiesta del recupero password.
 * L'email viene inviata da /api/auth/recupero-password; l'esito della
 * richiesta è sempre lo stesso (non viene rivelato se l'account esiste).
 */
function RecuperoContent() {
  const searchParams = useSearchParams();
  const sent = searchParams.get("sent");
  const error = searchParams.get("error");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-blue-200/70 bg-white shadow-[0_30px_70px_-40px_rgba(37,99,235,0.35)]">
        <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
        <div className="space-y-6 p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Recupero password
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              {sent ? "Controlla la tua email" : "Hai dimenticato la password?"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {sent
                ? "Se esiste un account associato a questa email, hai ricevuto un link per impostare una nuova password. Controlla anche la cartella spam."
                : "Inserisci l'email del tuo account: ti invieremo un link per impostare una nuova password."}
            </p>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {sent ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Link di recupero inviato. Apri il messaggio e segui le istruzioni.
            </div>
          ) : (
            <form
              action="/api/auth/recupero-password"
              method="post"
              className="space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
              >
                Invia link di recupero
              </button>
            </form>
          )}

          <Link
            href="/login"
            className="block text-center text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            Torna al login
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function RecuperoPasswordPage() {
  return (
    <Suspense>
      <RecuperoContent />
    </Suspense>
  );
}