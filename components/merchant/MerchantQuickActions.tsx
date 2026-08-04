"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  FileText,
  Globe,
  Image,
  LayoutList,
  MapPin,
  Package,
  Settings,
  Shield,
  Smartphone,
} from "lucide-react";

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
];

const settingsItems = [
  { label: "Informazioni negozio", icon: Settings, href: "/merchant/[storeId]/impostazioni#informazioni", comingSoon: false },
  { label: "Logo", icon: Image, href: "/merchant/[storeId]/impostazioni#informazioni", comingSoon: false },
  { label: "Banner", icon: Image, href: "/merchant/[storeId]/impostazioni#informazioni", comingSoon: false },
  { label: "Contatti", icon: Smartphone, href: "/merchant/[storeId]/impostazioni#informazioni", comingSoon: false },
  { label: "Social", icon: Globe, href: "/merchant/[storeId]/impostazioni#social", comingSoon: false },
  { label: "Orari", icon: Clock, href: "/merchant/[storeId]/impostazioni#orari", comingSoon: false },
  { label: "Galleria", icon: Image, href: "/merchant/[storeId]/impostazioni#galleria", comingSoon: false },
  { label: "Spedizioni", icon: MapPin, href: false, comingSoon: true },
  { label: "Privacy", icon: Shield, href: false, comingSoon: true },
  { label: "Pagamenti", icon: CreditCard, href: false, comingSoon: true },

];

export default function MerchantQuickActions({ storeId }: { storeId: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {actions.map((action) => {
        const Icon = action.icon;
        const isPrimary = action.key === "manual";

        return (
          <Link
            key={action.key}
            href={action.href(storeId)}
            className={`group flex items-center gap-4 rounded-2xl p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer ${
              isPrimary
                ? "border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 hover:border-blue-300 hover:shadow-blue-500/15"
                : "border border-slate-200 bg-white hover:border-blue-200 hover:shadow-blue-500/10"
            }`}
          >
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${
                isPrimary
                  ? "bg-blue-600 text-white group-hover:bg-blue-700"
                  : "bg-blue-50 text-blue-700 group-hover:bg-blue-100"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                className={`text-base font-bold tracking-tight ${
                  isPrimary ? "text-blue-900" : "text-slate-900"
                }`}
              >
                {action.title}
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                {action.description}
              </p>
            </div>
          </Link>
        );
      })}

      {/* ── Impostazioni — pannello espandibile ─────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/10">
        <button
          type="button"
          onClick={() => setSettingsOpen((prev) => !prev)}
          className="flex w-full items-center gap-4 p-5 text-left cursor-pointer"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-700">
            <Settings className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              Impostazioni negozio
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Configura dati, logo, contatti e altro.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-400 transition-transform duration-200">
            {settingsOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>

        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: settingsOpen ? "600px" : "0px" }}
        >
          <div className="border-t border-slate-100 px-4 pb-4 pt-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {settingsItems.map((item) => {
                const Icon = item.icon;
                const content = (
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{item.label}</span>
                    {item.comingSoon && (
                      <span className="ml-auto shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Prossimamente
                      </span>
                    )}
                  </div>
                );

                if (item.href) {
                  const href = typeof item.href === "string"
                    ? item.href.replace("[storeId]", storeId)
                    : `/merchant/${storeId}/impostazioni`;
                  return (
                    <Link key={item.label} href={href}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <div key={item.label} className="opacity-60">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
