"use client";

import Link from "next/link";
import { Cog, Hand, Settings } from "lucide-react";
import MerchantAgendaQuickAction from "./MerchantAgendaQuickAction";

function ServiziIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span className={`relative flex items-center justify-center ${className}`} aria-hidden="true">
      <Hand className="h-full w-full" />
      <Cog className="absolute -right-1 -bottom-1 h-3 w-3 fill-white" />
    </span>
  );
}

const azioni = [
  {
    key: "servizi",
    title: "Servizi offerti",
    description: "I servizi che offri ai clienti.",
    icon: ServiziIcon,
    href: (storeId: string) => `/merchant/${storeId}/edit?step=catalogo&block=servizi-strutturati`,
  },
];

export default function MerchantQuickActions({
  storeId,
  nuoviAppuntamenti = 0,
  agendaAttiva = false,
}: {
  storeId: string;
  nuoviAppuntamenti?: number;
  agendaAttiva?: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MerchantAgendaQuickAction
        storeId={storeId}
        initialActive={agendaAttiva}
        nuoviAppuntamenti={nuoviAppuntamenti}
      />

      {azioni.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.key}
            href={action.href(storeId)}
            className="group relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
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

      <Link
        href={`/merchant/${storeId}/impostazioni`}
        className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-yellow-100 group-hover:text-yellow-800">
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
    </div>
  );
}
