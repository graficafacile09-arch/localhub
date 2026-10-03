import { redirect } from "next/navigation";
import { Truck, LogOut } from "lucide-react";
import { getSessionArea } from "@/lib/auth/session-area";
import { getAccountApprovalStatus } from "@/lib/auth/account-approval";

export default async function CorrierePage() {
  const sessione = await getSessionArea();
  if (!sessione || sessione.area !== "courier" || !sessione.ruoli.includes("courier")) {
    redirect("/login?area=courier");
  }

  const approvalStatus = await getAccountApprovalStatus(sessione.user.id);
  if (approvalStatus !== "approved") {
    redirect("/account-in-attesa?area=courier");
  }

  const nome =
    String(sessione.user.user_metadata?.full_name ?? "").trim() ||
    sessione.user.email ||
    "Corriere";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <Truck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                InCittà
              </p>
              <h1 className="text-xl font-extrabold text-slate-900">
                Area Corriere Locale
              </h1>
            </div>
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Esci
            </button>
          </form>
        </header>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Benvenuto,</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">{nome}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            L&apos;accesso al profilo corriere locale è attivo. Qui verrà collegata
            la gestione delle consegne, con gli ordini assegnati e la navigazione
            verso le coordinate del destinatario.
          </p>
        </section>
      </div>
    </main>
  );
}
