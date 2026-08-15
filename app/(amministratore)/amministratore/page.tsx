import Link from "next/link";
import {
  BarChart3,
  Bot,
  CalendarDays,
  FolderTree,
  LayoutDashboard,
  LayoutTemplate,
  Newspaper,
  Package,
  ScrollText,
  Settings,
  Star,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import DashboardPage from "@/components/amministratore/DashboardPage";
import ZonaPericolosaDashboard from "@/components/amministratore/ZonaPericolosaDashboard";

export const metadata = {
  title: "Amministratore — Strumenti di piattaforma",
};

// I dati devono riflettere in tempo reale lo stato del database,
// quindi la pagina non viene prerenderizzata staticamente a build.
export const dynamic = "force-dynamic";

/** Strumenti di piattaforma" (esclusivi dell'Area Amministratore).
 *  NEGOZI è la prima voce operativa (elenca e gestisce i negozi reali
 *  del database tramite il modulo esistente). La sezione Panoramica
 *  (dashboard con i numeri) resta SOLO sotto, nella sezione finale. */
const STRUMENTI = [
  {
    label: "Negozi",
    href: "/amministratore/attivita",
    desc: "Tutti i negozi: visualizza, modifica ed elimina",
    icon: Store,
  },
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
    label: "Prodotti",
    href: "/amministratore/prodotti",
    desc: "Catalogo prodotti pubblicati",
    icon: Package,
  },
  {
    label: "Offerte",
    href: "/amministratore/offerte",
    desc: "Promozioni attive su LocalHub",
    icon: Star,
  },
  {
    label: "Eventi",
    href: "/amministratore/eventi",
    desc: "Eventi della città",
    icon: CalendarDays,
  },
  {
    label: "Categorie",
    href: "/amministratore/categorie",
    desc: "Categorie di negozi e prodotti",
    icon: FolderTree,
  },
  {
    label: "Negozi in evidenza",
    href: "/amministratore/negozi-in-evidenza",
    desc: "Selezione homepage",
    icon: Star,
  },
  {
    label: "Template",
    href: "/amministratore/template",
    desc: "Template globali per nuovi negozi",
    icon: LayoutTemplate,
  },
  {
    label: "Contenuti",
    href: "/amministratore/contenuti",
    desc: "Articoli del portale",
    icon: Newspaper,
  },
  {
    label: "Assistente AI",
    href: "/amministratore/assistente-ai",
    desc: "Configurazione assistente intelligente",
    icon: Bot,
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
 * L'ingresso mostra PRIMA gli Strumenti di piattaforma (con NEGOZI come
 * prima voce operativa), POI in fondo la sezione "Panoramica" (dashboard
 * con KPI reali + Zona Pericolosa). Stessa gerarchia del menu laterale.
 */
export default function PanoramicaPage() {
  return (
    <div className="space-y-5">
      {/* ★ Strumenti di piattaforma — PRIMA cosa che si vede entrando */}
      <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Strumenti di piattaforma
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
          Gestione
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
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white transition-transform duration-200 group-hover:scale-105">
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

      {/* Amministrazione — Panoramica (dashboard con i numeri) in fondo */}
      <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <LayoutDashboard className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Amministrazione
            </p>
            <h2 className="text-xl font-black tracking-tight text-slate-900">
              Panoramica
            </h2>
          </div>
        </div>
        <div className="mt-5">
          <DashboardPage />
        </div>
      </section>

      {/* Zona Pericolosa — esclusiva dell'Area Amministratore */}
      <ZonaPericolosaDashboard />
    </div>
  );
}
