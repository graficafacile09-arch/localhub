import Link from "next/link";
import { ArrowLeft, Home, ShieldAlert } from "lucide-react";
import { areaToPath, type AreaAttiva } from "@/lib/auth/area";

/**
 * AVVISO ROSSO "Area non autorizzata" — mostrato a chi tenta di entrare in
 * un'area diversa dalla propria (anche digitando l'URL direttamente).
 * Gate SERVER-SIDE nei layout delle aree: la sessione NON viene invalidata
 * né terminata; l'utente può tornare alla propria area con il pulsante.
 */
export default function AreaNonAutorizzata({
  areaUtente,
}: {
  /** Area della sessione dell'utente (quella a cui può tornare). */
  areaUtente: AreaAttiva;
}) {
  return (
    <main className="min-h-screen bg-[#eef3f8] px-4 py-10 text-slate-900 md:px-6">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-red-200 bg-white p-8 shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
          <ShieldAlert className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-red-600">
          Accesso negato
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
          Area non autorizzata
        </h1>
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm leading-6 text-red-800">
            Il tuo account non è autorizzato ad accedere a quest&apos;area.
            La sessione è rimasta attiva: torna nella tua area per continuare.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={areaToPath(areaUtente)}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Torna nella tua area
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Home className="h-4 w-4" aria-hidden />
            Vai alla home
          </Link>
        </div>
      </div>
    </main>
  );
}