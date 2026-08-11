"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Building2, Image, Package, Sparkles, Tag, Calendar, Phone,
  MapPin, Clock, MessageCircle, Search, Bot, Settings,
  LayoutDashboard, FolderOpen, Copy, ChevronDown, ChevronRight, CreditCard,
} from "lucide-react";
import type { ModuleStatus } from "./StoreEditor";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";

const MODULE_GROUPS = [
  {
    label: "Dati Base",
    icon: Building2,
    modules: [
      { slug: "informazioni", label: "Informazioni", icon: Building2 },
      { slug: "immagini", label: "Immagini", icon: Image },
      { slug: "contatti", label: "Contatti", icon: Phone },
      { slug: "posizione", label: "Posizione", icon: MapPin },
      { slug: "orari", label: "Orari", icon: Clock },
    ],
  },
  {
    label: "Catalogo",
    icon: Package,
    modules: [
      { slug: "prodotti", label: "Prodotti", icon: Package },
      { slug: "servizi", label: "Servizi", icon: Sparkles },
      { slug: "offerte", label: "Offerte", icon: Tag },
      { slug: "eventi", label: "Eventi", icon: Calendar },
    ],
  },
  {
    label: "Online",
    icon: MessageCircle,
    modules: [
      { slug: "social", label: "Social", icon: MessageCircle },
      { slug: "seo", label: "SEO", icon: Search },
      { slug: "pagamenti", label: "Pagamenti", icon: CreditCard },
    ],
  },
  {
    label: "Altro",
    icon: Settings,
    modules: [
      { slug: "ai", label: "AI", icon: Bot },
      { slug: "impostazioni", label: "Impostazioni", icon: Settings },
    ],
  },
];

type Props = {
  activeSlug: string;
  onSelect: (slug: string) => void;
  onClose?: () => void;
  moduleStatus: Record<string, ModuleStatus>;
  storeName?: string;
  /** Percorso base dell'editor: "/merchant" (venditore) o "/amministratore/negozi" (admin). */
  basePath?: string;
};

export default function EditorSidebar({ activeSlug, onSelect, onClose, moduleStatus, storeName, basePath = "/merchant" }: Props) {
  const params = useParams<{ negozioId: string }>();
  const storeId = params.negozioId;
  const [showDuplica, setShowDuplica] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "Dati Base": true,
    "Catalogo": true,
    "Online": false,
    "Altro": false,
  });

  function toggleGroup(label: string) {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function isGroupActive(group: { modules: { slug: string }[] }): boolean {
    return group.modules.some((m) => activeSlug === m.slug);
  }

  function isGroupComplete(group: { modules: { slug: string }[] }): boolean {
    return group.modules.every((m) => moduleStatus[m.slug]?.complete);
  }

  return (
    <nav className="flex h-full flex-col">
      {showDuplica && (
        <DuplicaNegozioWizard
          storeId={storeId}
          storeName={storeName ?? "Negozio"}
          onClose={() => setShowDuplica(false)}
          editHref={`${basePath}/${storeId}/edit`}
        />
      )}

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {/* Dashboard link */}
        <button
          type="button"
          onClick={() => { onSelect("dashboard"); onClose?.(); }}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all duration-150 ${
            activeSlug === "dashboard"
              ? "bg-blue-50 text-blue-700 shadow-sm"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
          }`}
        >
          <LayoutDashboard className={`h-4 w-4 shrink-0 ${activeSlug === "dashboard" ? "text-blue-600" : "text-slate-400"}`} />
          Dashboard
        </button>

        {/* Libreria Media (link esterno) */}
        <Link
          href={`${basePath}/${storeId}/media`}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-50 hover:text-slate-800"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="flex-1 truncate">Libreria Media</span>
        </Link>

        <div className="my-2 border-t border-slate-100" />

        {/* Moduli raggruppati */}
        {MODULE_GROUPS.map((group) => {
          const Icon = group.icon;
          const isOpen = expandedGroups[group.label] ?? false;
          const isActive = isGroupActive(group);
          const isComplete = isGroupComplete(group);

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <span className="flex-1 truncate">{group.label}</span>
                {isComplete && <span className="text-emerald-500">✓</span>}
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>

              {isOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {group.modules.map((mod) => {
                    const isModActive = activeSlug === mod.slug;
                    const status = moduleStatus[mod.slug];
                    const hasCount = status && typeof status.count === "number" && status.count > 0;
                    const isModComplete = status?.complete;

                    return (
                      <button
                        key={mod.slug}
                        type="button"
                        onClick={() => { onSelect(mod.slug); onClose?.(); }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all duration-150 ${
                          isModActive
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                        }`}
                      >
                        <mod.icon className={`h-3.5 w-3.5 shrink-0 ${isModActive ? "text-blue-600" : "text-slate-400"}`} />
                        <span className="flex-1 truncate">{mod.label}</span>
                        <span className="flex items-center gap-1">
                          {hasCount && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                              {status.count}
                            </span>
                          )}
                          {isModComplete && <span className="text-emerald-500">✓</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="my-2 border-t border-slate-100" />

        {/* Manutenzione */}
        <div>
          <button
            type="button"
            onClick={() => toggleGroup("Manutenzione")}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-50 hover:text-slate-800"
          >
            <Settings className="h-4 w-4 shrink-0 text-slate-400" />
            <span>Manutenzione</span>
            {expandedGroups["Manutenzione"] ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>

          {expandedGroups["Manutenzione"] && (
            <div className="ml-6 mt-0.5 space-y-0.5">
              <button
                type="button"
                onClick={() => setShowDuplica(true)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-50 hover:text-slate-800"
              >
                <Copy className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="flex-1 truncate">Duplica negozio</span>
              </button>
            </div>
          )}
        </div>


      </div>
    </nav>
  );
}
