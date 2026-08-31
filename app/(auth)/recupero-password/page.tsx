"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BackButton from "@/components/BackButton";

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
    <main className="relative flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 py-12">
      <BackButton
        label="Torna al login"
        fallbackHref="/login"
        className="absolute left-4 top-4 sm:left-6 sm:top-6"
      />
      <div className="card w-full max-w-md overflow-hidden">
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
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {error}
            </div>
          )}

          {sent ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
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
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100"
                />
              </div>
              <button
                type="submit"
                className="btn-cta h-12 w-full text-sm"
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