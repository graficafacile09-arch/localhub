import Link from "next/link";
import {
  ReceiptText,
  ScrollText,
  Settings,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import DashboardPage from "@/components/amministratore/DashboardPage";
import ZonaPericolosaDashboard from "@/components/amministratore/ZonaPericolosaDashboard";

export const metadata = {
  title: "Amministratore — Panoramica",
};

// I dati devono riflettere in tempo reale lo stato del database,
// quindi la pagina non viene prerenderizzata staticamente a build.
export const dynamic = "force-dynamic";

/** Accessi rapidi — solo le funzioni più usate. La mappa COMPLETA
 *  dell'area amministrativa è la sidebar (gruppi), non una seconda
 *  griglia di navigazione. */
const ACCESSI_RAPIDI = [
  {
    label: "Negozi",
    href: "/amministratore/attivita",
    desc: "Tutti i negozi della piattaforma",
    icon: Store,
  },
  {
    label: "Ordini",
    href: "/amministratore/ordini",
    desc: "Supervisione ordini",
    icon: ReceiptText,
  },
  {
    label: "Utenti",
    href: "/amministratore/utenti",
    desc: "Profili e ruoli",
    icon: Users,
  },
  {
    label: "Cestino",
    href: "/amministratore/cestino",
    desc: "Negozi eliminati e ripristino",
    icon: Trash2,
  },
  {
    label: "Impostazioni",
    href: "/amministratore/impostazioni",
    desc: "Configurazione piattaforma",
    icon: Settings,
  },
  {
    label: "Registro attività",
    href: "/amministratore/registro-attivita",
    desc: "Cronologia delle operazioni",
    icon: ScrollText,
  },
];

/**
 * Home dell'Area Amministratore: Panoramica (KPI reali + grafici + avvisi),
 * pochi accessi rapidi e Zona Pericolosa. La griglia completa delle 22 voci
 * è stata rimossa: la sidebar è l'unica mappa di navigazione.
 */
export default function PanoramicaPage() {
  return (
    <div className="space-y-5">
      {/* Panoramica — dashboard con KPI reali */}
      <DashboardPage />

      {/* Accessi rapidi — pochi link alle funzioni più usate */}
      <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Amministrazione
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
          Accessi rapidi
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ACCESSI_RAPIDI.map((accesso) => {
            const Icon = accesso.icon;
            return (
              <Link
                key={accesso.href}
                href={accesso.href}
                className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-white hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white transition-transform duration-200 group-hover:scale-105">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">
                    {accesso.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {accesso.desc}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Zona Pericolosa — esclusiva dell'Area Amministratore */}
      <ZonaPericolosaDashboard />
    </div>
  );
}
