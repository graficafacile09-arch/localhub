"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FolderOpen, Home, LayoutDashboard, Package, PenLine, Sparkles } from "lucide-react";
import { ADMIN_BASE } from "./navigation";

/**
 * Contesto negozio dell'Area Amministratore: breadcrumb
 * (Amministrazione → Negozi → [nome negozio]) + tab di navigazione del
 * negozio (Dashboard, Editor, Media, Prodotti, AI). L'admin capisce subito
 * dove si trova e come muoversi dentro il negozio.
 */
export default function AdminStoreContext({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName?: string | null;
}) {
  const pathname = usePathname();
  const base = `${ADMIN_BASE}/negozi/${storeId}`;

  const tab = [
    { label: "Dashboard", href: base, icon: LayoutDashboard, exact: true },
    { label: "Editor", href: `${base}/edit`, icon: PenLine },
    { label: "Media", href: `${base}/media`, icon: FolderOpen },
    { label: "Prodotti", href: `${base}/prodotti`, icon: Package },
    { label: "AI", href: `${base}/prodotti/ai`, icon: Sparkles },
  ];

  function isActive(href: string, exact = false): boolean {
    if (exact) return pathname === href;
    return pathname.startsWith(href.endsWith("/") ? href : `${href}/`) || pathname === href;
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <nav
        aria-label="Percorso di navigazione"
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"
      >
        <Link
          href={ADMIN_BASE}
          className="inline-flex items-center gap-1 transition hover:text-blue-700"
        >
          <Home className="h-3.5 w-3.5" aria-hidden />
          Amministrazione
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />
        <Link
          href={`${ADMIN_BASE}/attivita`}
          className="transition hover:text-blue-700"
        >
          Negozi
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />
        <span aria-current="page" className="truncate text-slate-800">
          {storeName ?? "Negozio"}
        </span>
      </nav>

      {/* Tab del negozio */}
      <nav
        aria-label="Navigazione negozio"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-white/70 bg-white p-1.5 shadow-sm"
      >
        {tab.map((voce) => {
          const Icon = voce.icon;
          const active = isActive(voce.href, voce.exact);
          return (
            <Link
              key={voce.label}
              href={voce.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-150 ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-blue-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {voce.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
