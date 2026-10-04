import { redirect } from "next/navigation";
import { LayoutDashboard, LogOut, MessageCircle, PackageCheck, Truck, History } from "lucide-react";
import { getSessionArea } from "@/lib/auth/session-area";
import { getAccountApprovalStatus } from "@/lib/auth/account-approval";
import ConsegneLocali from "@/components/corriere/ConsegneLocali";

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
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <Truck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">InCittà</p>
              <h1 className="text-xl font-extrabold text-slate-900">Area Corriere Locale</h1>
              <p className="text-sm text-slate-500">Ciao {nome}, ecco il tuo centro di lavoro.</p>
            </div>
          </div>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Esci
            </button>
          </form>
        </header>

        <nav className="sticky top-2 z-20 mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur" aria-label="Menu corriere">
          <a href="#dashboard" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800"><LayoutDashboard className="h-4 w-4" />Dashboard</a>
          <a href="#consegne" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><PackageCheck className="h-4 w-4" />Consegne</a>
          <a href="#comunicazioni" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><MessageCircle className="h-4 w-4" />Comunicazioni</a>
          <a href="#storico" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><History className="h-4 w-4" />Storico</a>
        </nav>

        <section className="mt-6 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-5 shadow-sm">
          <p className="text-sm font-bold text-emerald-800">Centro operativo</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Da qui controlli le consegne assegnate, accetti o aggiorni gli stati, apri la navigazione,
            comunichi con cliente e venditore e ritrovi le consegne concluse.
          </p>
        </section>

        <div className="mt-6">
          <ConsegneLocali />
        </div>
      </div>
    </main>
  );
}
