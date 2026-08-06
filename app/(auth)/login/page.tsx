"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isPartitaIvaValida } from "@/lib/partita-iva";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const area = searchParams.get("area") ?? "";
  const [tab, setTab] = useState<"login" | "register">("login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-blue-200/70 bg-white shadow-[0_30px_70px_-40px_rgba(37,99,235,0.35)]">
        <div className="h-1 bg-linear-to-r from-cyan-300 via-white to-yellow-300" />
        <div className="space-y-6 p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              {area === "admin"
                ? "Area Amministratore"
                : area === "merchant"
                  ? "Area Venditore"
                  : "Area Clienti"}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              {tab === "login" ? "Bentornato" : "Benvenuto"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {tab === "login"
                ? "Accedi per gestire i tuoi negozi e il catalogo prodotti."
                : area === "merchant"
                  ? "Crea il tuo account e inizia a vendere sulla tua città."
                  : "Crea il tuo account e inizia a fare acquisti nella tua città."}
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

          {tab === "login" ? (
            <LoginForm area={area} />
          ) : area === "merchant" ? (
            <RegisterVenditoreForm />
          ) : (
            <RegisterClienteForm />
          )}
        </div>
      </div>
    </main>
  );
}

function LoginForm({ area }: { area: string }) {
  return (
    <form action="/api/auth/login" method="post" className="space-y-4">
      {area && <input type="hidden" name="area" value={area} />}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold text-slate-700">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          placeholder="venditore@localhub.it"
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

/** Registrazione CLIENTE: solo i campi del Cliente, nessun riferimento al Venditore. */
function RegisterClienteForm() {
  return (
    <form action="/api/auth/register" method="post" className="space-y-4">
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
          placeholder="cliente@localhub.it"
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
      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
      >
        Crea account
      </button>
    </form>
  );
}

/** Registrazione VENDITORE: solo i campi del Venditore (con Partita IVA obbligatoria), nessun riferimento al Cliente. */
function RegisterVenditoreForm() {
  const [partitaIva, setPartitaIva] = useState("");
  const [partitaIvaError, setPartitaIvaError] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (partitaIva.trim() === "") {
      e.preventDefault();
      setPartitaIvaError("Partita IVA obbligatoria.");
      return;
    }
    if (!isPartitaIvaValida(partitaIva)) {
      e.preventDefault();
      setPartitaIvaError("Partita IVA non valida.");
    }
  };

  return (
    <form action="/api/auth/register-merchant" method="post" onSubmit={handleSubmit} className="space-y-4">
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
          placeholder="venditore@localhub.it"
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
      <div className="space-y-2">
        <label htmlFor="partita_iva" className="text-sm font-semibold text-slate-700">Partita IVA</label>
        <input
          id="partita_iva" name="partita_iva" type="text" inputMode="numeric"
          autoComplete="off" maxLength={13}
          placeholder="es. 01234567890"
          value={partitaIva}
          onChange={(e) => {
            setPartitaIva(e.target.value);
            if (partitaIvaError) setPartitaIvaError("");
          }}
          aria-invalid={partitaIvaError ? true : undefined}
          className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        {partitaIvaError && (
          <p className="text-xs font-semibold text-red-600">{partitaIvaError}</p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="store_name" className="text-sm font-semibold text-slate-700">Nome attività</label>
        <input
          id="store_name" name="store_name" type="text" required
          placeholder="es. Pizzeria Da Mario"
          className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500 to-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl hover:shadow-blue-500/40 active:scale-[0.98]"
      >
        Crea account
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
