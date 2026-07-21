import Link from "next/link";
import { ArrowRight, LayoutList, Package, Settings, Sparkles } from "lucide-react";

const actions = [
  {
    key: "ai",
    title: "Aggiungi con AI",
    description: "Scatta una foto e lascia che l'AI compili titolo, descrizione, categoria e prezzo in automatico.",
    icon: Sparkles,
    href: (storeId: string) => `/merchant/${storeId}/prodotti/ai`,
    /** Stile prominente per l'azione AI */
    featured: true,
  },
  {
    key: "manual",
    title: "Nuovo prodotto",
    description: "Aggiungi manualmente un prodotto compilando il modulo completo.",
    icon: Package,
    href: (storeId: string) => `/merchant/${storeId}/prodotti/nuovo`,
    featured: false,
  },
  {
    key: "catalog",
    title: "Gestisci prodotti",
    description: "Controlla i prodotti pubblicati, i prezzi e lo stato di visibilità del catalogo.",
    icon: LayoutList,
    href: (storeId: string) => `/merchant/${storeId}/prodotti`,
    featured: false,
  },
  {
    key: "settings",
    title: "Impostazioni negozio",
    description: "Aggiorna i dati pubblici del negozio e le configurazioni avanzate.",
    icon: Settings,
    href: (storeId: string) => `/merchant/${storeId}/impostazioni`,
    featured: false,
  },
];

export default function MerchantQuickActions({ storeId }: { storeId: string }) {
  return (
    <div className="space-y-4">
      {/* Card AI — occupa tutta la larghezza, visivamente distinta */}
      {actions
        .filter((a) => a.featured)
        .map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.key}
              href={action.href(storeId)}
              className="group flex items-center justify-between gap-4 overflow-hidden rounded-[2rem] border border-blue-200 bg-linear-to-r from-blue-600 to-blue-500 p-6 text-white shadow-lg shadow-blue-400/25 transition hover:from-blue-500 hover:to-blue-400"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                    Intelligenza artificiale
                  </p>
                  <h2 className="mt-0.5 text-xl font-black tracking-tight text-white">
                    {action.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-blue-100">
                    {action.description}
                  </p>
                </div>
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 transition group-hover:bg-white/25">
                <ArrowRight className="h-5 w-5 text-white transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}

      {/* Card standard — griglia 3 colonne */}
      <div className="grid gap-4 lg:grid-cols-3">
        {actions
          .filter((a) => !a.featured)
          .map((action) => {
            const Icon = action.icon;

            return (
              <Link
                key={action.key}
                href={action.href(storeId)}
                className="group rounded-3xl border border-white/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_20px_40px_-32px_rgba(37,99,235,0.45)]"
              >
                <div className="inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-black tracking-tight text-slate-900">
                  {action.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {action.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                  Apri
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
