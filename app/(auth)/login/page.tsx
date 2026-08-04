"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const redirect = searchParams.get("redirect") ?? "";
  const [tab, setTab] = useState<"login" | "register">("login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-blue-200/70 bg-white shadow-[0_30px_70px_-40px_rgba(37,99,235,0.35)]">
        <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
        <div className="space-y-6 p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Area Amministratore
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              {tab === "login" ? "Bentornato" : "Benvenuto"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {tab === "login"
                ? "Accedi per gestire i tuoi negozi e il catalogo prodotti."
                : "Crea il tuo account e inizia a vendere sulla tua città."}
            </p>
          </div>

          {/* TABS */}
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
                tab === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
                tab === "register"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Registrati
            </button>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {tab === "login" ? <LoginForm redirect={redirect} /> : <RegisterForm />}
        </div>
      </div>
    </main>
  );
}

function LoginForm({ redirect }: { redirect: string }) {
  return (
    <form action="/api/auth/login" method="post" className="space-y-4">
      {redirect && <input type="hidden" name="redirect" value={redirect} />}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold text-slate-700">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          placeholder="commerciante@localhub.it"
          className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
        <input
          id="password" name="password" type="password" required autoComplete="current-password"
          placeholder="Inserisci la password"
          className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
      >
        Accedi
      </button>
    </form>
  );
}

/** Tipologia di registrazione: acquirente (customer) o commerciante. */
type TipoRegistrazione = "cliente" | "commerciante";

function RegisterForm() {
  const [tipo, setTipo] = useState<TipoRegistrazione>("cliente");
  const action =
    tipo === "cliente" ? "/api/auth/register" : "/api/auth/register-merchant";

  return (
    <div className="space-y-4">
      {/* Scelta del tipo di account */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTipo("cliente")}
          aria-pressed={tipo === "cliente"}
          className={`rounded-xl py-2 text-xs font-bold transition-all duration-200 ${
            tipo === "cliente"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Voglio comprare
        </button>
        <button
          type="button"
          onClick={() => setTipo("commerciante")}
          aria-pressed={tipo === "commerciante"}
          className={`rounded-xl py-2 text-xs font-bold transition-all duration-200 ${
            tipo === "commerciante"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Voglio vendere
        </button>
      </div>

      <form action={action} method="post" className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-semibold text-slate-700">Nome e Cognome</label>
          <input
            id="name" name="name" type="text" required
            placeholder="Mario Rossi"
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="reg_email" className="text-sm font-semibold text-slate-700">Email</label>
          <input
            id="reg_email" name="email" type="email" required autoComplete="email"
            placeholder={tipo === "cliente" ? "cliente@localhub.it" : "commerciante@localhub.it"}
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="reg_password" className="text-sm font-semibold text-slate-700">Password</label>
          <input
            id="reg_password" name="password" type="password" required
            placeholder="Minimo 6 caratteri"
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password_confirm" className="text-sm font-semibold text-slate-700">Conferma Password</label>
          <input
            id="password_confirm" name="password_confirm" type="password" required
            placeholder="Ripeti la password"
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        {tipo === "commerciante" && (
          <div className="space-y-2">
            <label htmlFor="store_name" className="text-sm font-semibold text-slate-700">Nome attività</label>
            <input
              id="store_name" name="store_name" type="text" required
              placeholder="es. Pizzeria Da Mario"
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        )}
        <button
          type="submit"
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
        >
          Crea account
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
