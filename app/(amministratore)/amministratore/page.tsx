import Link from "next/link";
import {
  BarChart3,
  LayoutTemplate,
  ScrollText,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import MerchantHomePage from "@/app/(merchant)/merchant/page";
import ZonaPericolosaDashboard from "@/components/amministratore/ZonaPericolosaDashboard";

export const metadata = {
  title: "Panoramica — Amministratore",
};

// La home deve riflettere in tempo reale i dati del database,
// quindi non viene prerenderizzata staticamente a build.
export const dynamic = "force-dynamic";

/** Strumenti di piattaforma (esclusivi dell'Area Amministratore). */
const STRUMENTI = [
  {
    label: "Cestino",
    href: "/amministratore/cestino",
    desc: "Negozi eliminati e ripristino",
    icon: Trash2,
  },
  {
    label: "Utenti",
    href: "/amministratore/utenti",
    desc: "Profili e ruoli della piattaforma",
    icon: Users,
  },
  {
    label: "Template",
    href: "/amministratore/template",
    desc: "Template globali per nuovi negozi",
    icon: LayoutTemplate,
  },
  {
    label: "Scansioni AI",
    href: "/amministratore/scansioni",
    desc: "Monitoraggio scansioni in tempo reale",
    icon: BarChart3,
  },
  {
    label: "Registro attività",
    href: "/amministratore/registro-attivita",
    desc: "Cronologia delle operazioni",
    icon: ScrollText,
  },
  {
    label: "Impostazioni",
    href: "/amministratore/impostazioni",
    desc: "Configurazione piattaforma",
    icon: Settings,
  },
];

/**
 * Home dell'Area Amministratore.
 *
 * È la STESSA pagina dell'Area Commerciante (componente riusato
 * `MerchantHomePage`): stesso layout, stessa grafica, stessa esperienza.
 * L'unica differenza visibile è l'etichetta "Area Amministratore" e, in
 * fondo, gli strumenti di piattaforma e il blocco ZONA PERICOLOSA
 * (entrambi esclusivi dell'admin).
 */
export default async function PanoramicaPage() {
  return (
    <div className="space-y-5">
      <MerchantHomePage labelArea="Area Amministratore" />

      {/* Strumenti di piattaforma — esclusivi dell'amministratore */}
      <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Strumenti di piattaforma
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
          Amministrazione
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {STRUMENTI.map((strumento) => {
            const Icon = strumento.icon;
            return (
              <Link
                key={strumento.href}
                href={strumento.href}
                className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:bg-white hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-md transition-transform duration-200 group-hover:scale-105">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">
                    {strumento.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {strumento.desc}
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
