"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, LayoutDashboard, Package, PenLine, Sparkles, Store } from "lucide-react";
import { ADMIN_BASE } from "./navigation";

/**
 * Contesto negozio dell'Area Amministratore (sidebar desktop + drawer mobile).
 * Quando l'admin naviga dentro un negozio (/amministratore/negozi/[id]/...)
 * mostra una card con la navigazione specifica del negozio, così il percorso
 * non è più "nascosto": Dashboard, Editor, Media, Prodotti, AI.
 */
export default function AdminStoreNavAuto() {
  const pathname = usePathname();
  const match = /^\/amministratore\/negozi\/([^/]+)/.exec(pathname);
  if (!match) return null;

  const storeId = match[1];
  // La rotta statica /amministratore/negozi/nuovo (creazione negozio) non è
  // un negozio reale: la nav contestuale non deve comparire (link morti).
  if (storeId === "nuovo") return null;
  const base = `${ADMIN_BASE}/negozi/${storeId}`;

  const voci = [
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
    <div className="card p-5">
      <p className="section-label">Negozio</p>
      <nav aria-label="Menu negozio amministratore" className="mt-4 space-y-1.5 text-sm font-semibold">
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-100 bg-linear-to-br from-blue-50 to-blue-100/60 p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
            <Store className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black tracking-tight text-slate-900">
              Gestione negozio
            </span>
            <span className="block truncate text-[11px] font-medium text-slate-500">
              Area Amministratore
            </span>
          </span>
        </div>

        {voci.map((voce) => {
          const Icon = voce.icon;
          const active = isActive(voce.href, voce.exact);
          return (
            <Link
              key={voce.label}
              href={voce.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-150 ${
                active
                  ? "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200"
                  : "text-blue-700 hover:bg-yellow-50 hover:text-yellow-800"
              }`}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-yellow-400"
                  aria-hidden
                />
              )}
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  active
                    ? "bg-yellow-400 text-blue-900 shadow-sm"
                    : "bg-blue-50 text-blue-600 group-hover:bg-yellow-100 group-hover:text-yellow-800"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="truncate text-sm font-bold">{voce.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
