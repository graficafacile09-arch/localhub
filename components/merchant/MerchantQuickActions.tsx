import Link from "next/link";
import { Camera, LayoutList, Package, Settings } from "lucide-react";

const actions = [
  {
    key: "manual",
    title: "Nuovo prodotto",
    description: "Aggiungi manualmente un prodotto.",
    icon: Package,
    href: (storeId: string) => `/merchant/${storeId}/prodotti/nuovo`,
  },
  {
    key: "catalog",
    title: "Gestisci prodotti",
    description: "Controlla il catalogo, prezzi e visibilità.",
    icon: LayoutList,
    href: (storeId: string) => `/merchant/${storeId}/prodotti`,
  },
  {
    key: "settings",
    title: "Impostazioni negozio",
    description: "Aggiorna dati pubblici e configurazioni.",
    icon: Settings,
    href: (storeId: string) => `/merchant/${storeId}/impostazioni`,
  },
];

export default function MerchantQuickActions({ storeId }: { storeId: string }) {
  return (
    <div className="space-y-4">
      {/* Pulsante Scansione — azione principale, compatta e professionale */}
      <Link
        href={`/merchant/${storeId}/prodotti/ai`}
        className="flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-500 hover:to-blue-400 active:scale-[0.98]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
          <Camera className="h-5 w-5" />
        </div>
        <span>Scansiona prodotto</span>
      </Link>

      {/* Card standard — griglia 3 colonne */}
      <div className="grid gap-3 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.key}
              href={action.href(storeId)}
              className="group rounded-2xl border border-white/70 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_20px_40px_-32px_rgba(37,99,235,0.45)]"
            >
              <div className="inline-flex rounded-xl bg-blue-50 p-2.5 text-blue-700">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="mt-3 text-base font-black tracking-tight text-slate-900">
                {action.title}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {action.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
