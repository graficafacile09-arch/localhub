"use client";

import Link from "next/link";
import { LayoutList, Settings } from "lucide-react";
import MetodiPagamentoCard from "./MetodiPagamentoCard";

const actions = [
  {
    key: "catalog",
    title: "Gestisci prodotti",
    description: "Vedi e modifica il catalogo.",
    icon: LayoutList,
    href: (storeId: string) => `/merchant/${storeId}/prodotti`,
  },
];

/**
 * Azioni rapide della Dashboard negozio.
 * Poche card realmente utili, senza creare una seconda architettura di
 * navigazione: il flusso AI (scansione) resta nella CTA della dashboard e
 * nella bottom nav; "Impostazioni negozio" punta all'unica pagina canonica
 * (la stessa della sidebar); i metodi di pagamento mostrano lo stato con
 * link alla pagina Pagamenti.
 */
export default function MerchantQuickActions({ storeId }: { storeId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <Link
            key={action.key}
            href={action.href(storeId)}
            className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-100">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                {action.title}
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                {action.description}
              </p>
            </div>
          </Link>
        );
      })}

      {/* Impostazioni negozio — stessa destinazione della sidebar (una sola voce) */}
      <Link
        href={`/merchant/${storeId}/impostazioni`}
        className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-700">
          <Settings className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            Impostazioni negozio
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Dati, foto, contatti, vendita e spedizioni.
          </p>
        </div>
      </Link>

      {/* Metodo di pagamento — card di stato con link alla route Pagamenti */}
      <MetodiPagamentoCard storeId={storeId} />
    </div>
  );
}
