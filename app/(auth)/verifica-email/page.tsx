"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BackButton from "@/components/BackButton";

/**
 * Pagina "Controlla la tua email" mostrata DOPO la registrazione cliente.
 * L'account è stato creato ma NON è ancora confermato: nessun login
 * automatico. Il cliente deve aprire l'email di conferma e cliccare il link.
 */
function VerificaEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const error = searchParams.get("error");

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 py-12">
      <BackButton
        label="Torna al login"
        fallbackHref="/login?area=cliente"
        className="absolute left-4 top-4 sm:left-6 sm:top-6"
      />
      <div className="card w-full max-w-md overflow-hidden">
        <div className="space-y-6 p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Registrazione
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              Controlla la tua email
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ti abbiamo inviato un&apos;email per confermare la registrazione.
              Clicca sul link contenuto nel messaggio per attivare il tuo
              account.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {email ? (
              <>
                Email: <span className="font-semibold break-all">{email}</span>
              </>
            ) : (
              <>Controlla la posta in arrivo e la cartella spam.</>
            )}
            <p className="mt-2 text-xs leading-5 text-blue-600">
              Non hai ricevuto il messaggio? Controlla la cartella spam o
              riprova tra qualche minuto.
            </p>
          </div>

          <Link
            href="/login?area=cliente"
            className="block text-center text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            Torna al login
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerificaEmailPage() {
  return (
    <Suspense>
      <VerificaEmailContent />
    </Suspense>
  );
}
