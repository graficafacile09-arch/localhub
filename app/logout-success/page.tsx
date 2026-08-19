import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import LogoutGuard from "@/components/auth/LogoutGuard";
import { getCurrentUser } from "@/lib/auth/session";

// Pagina di saluto post-logout: MAI memorizzata e mostrata SOLO a sessione
// realmente chiusa (il logout è completato prima del redirect, vedi
// app/api/auth/signout/route.ts). Nessun redirect automatico: l'utente deve
// poter leggere il messaggio.
export const dynamic = "force-dynamic";

export default async function LogoutSuccessPage() {
  // Difesa: se per qualsiasi motivo la sessione risultasse ancora attiva
  // (es. accesso diretto senza logout), niente pagina di saluto: si esce
  // subito verso la home. Riusa il sistema di autenticazione esistente.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-[80vh] flex-1 items-center justify-center bg-[#eef3f8] px-4 py-10 text-slate-900 md:px-6">
      <LogoutGuard />
      <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm md:p-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CheckCircle2 className="h-9 w-9" aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
          Grazie per aver utilizzato InCittà.
          <span className="mt-2 block text-2xl md:text-3xl">
            A presto! 👋
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 md:text-base">
          La tua sessione è stata chiusa correttamente.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            Torna alla Home
          </Link>
        </div>
      </div>
    </main>
  );
}