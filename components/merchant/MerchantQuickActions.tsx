import Link from "next/link";
import { LayoutList, Package, Settings } from "lucide-react";

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
    description: "Vedi e modifica il catalogo.",
    icon: LayoutList,
    href: (storeId: string) => `/merchant/${storeId}/prodotti`,
  },
  {
    key: "settings",
    title: "Impostazioni",
    description: "Aggiorna dati e configurazioni.",
    icon: Settings,
    href: (storeId: string) => `/merchant/${storeId}/impostazioni`,
  },
];

export default function MerchantQuickActions({ storeId }: { storeId: string }) {
  return (
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
  );
}
