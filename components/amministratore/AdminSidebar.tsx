"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminFooterItems, adminNavGroups } from "./navigation";

/**
 * Menu laterale del pannello Amministratore, organizzato per GRUPPI logici
 * (accordion fluidi, tutti aperti di default). In modalità "collapsed"
 * mostra solo le icone (con tooltip), altrimenti l'etichetta completa.
 * Lo stato attivo segue la route corrente. In fondo una sezione separata
 * con la navigazione rapida (solo "Torna al sito").
 */
export default function AdminSidebar({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  // Tutti i gruppi sono APERTI di default: il menu è subito completo.
  const [aperti, setAperti] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(adminNavGroups.map((g) => [g.key, true]))
  );

  function isActive(href: string): boolean {
    if (href === "/") return false;
    if (href === "/amministratore") return pathname === href;
    return pathname.startsWith(href);
  }

  function renderItem(item: { href: string; label: string; icon: LucideIcon }) {
    const active = isActive(item.href);
    const Icon = item.icon;

    if (collapsed) {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-150 ${
            active
              ? "bg-blue-50 text-blue-700 shadow-sm"
              : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </Link>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-150 ${
          active
            ? "bg-blue-50 text-blue-700 shadow-sm"
            : "text-slate-700 hover:bg-slate-50 hover:text-blue-600"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-blue-600"
            aria-hidden
          />
        )}
        <Icon
          className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
          aria-hidden
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  if (collapsed) {
    return (
      <div className="space-y-1">
        <nav
          aria-label="Menu Amministratore"
          className="flex flex-col items-center space-y-1"
        >
          {adminNavGroups.flatMap((group) => group.items).map(renderItem)}
        </nav>
        <nav
          aria-label="Navigazione rapida"
          className="!mt-4 flex flex-col items-center space-y-1 border-t border-slate-100 pt-4"
        >
          {adminFooterItems.map(renderItem)}
        </nav>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <nav aria-label="Menu Amministratore" className="space-y-2">
        {adminNavGroups.map((group) => {
          const Icon = group.icon;
          const aperto = aperti[group.key] === true;
          const items = group.items;

          return (
            <div key={group.key} className="rounded-2xl">
              <button
                type="button"
                onClick={() =>
                  setAperti((prev) => ({ ...prev, [group.key]: !aperto }))
                }
                aria-expanded={aperto}
                className="flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 transition hover:bg-slate-50"
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="truncate">{group.label}</span>
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                    aperto ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>

              <div
                className="overflow-hidden transition-all duration-200"
                style={{ maxHeight: aperto ? "1200px" : "0px" }}
              >
                <div className="mt-1 space-y-1">
                  {items.map(renderItem)}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Sezione footer: navigazione rapida ─────────────────────────────── */}
      <nav
        aria-label="Navigazione rapida"
        className="!mt-4 space-y-1 border-t border-slate-100 pt-4"
      >
        {adminFooterItems.map(renderItem)}
      </nav>

      <div className="!mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
        <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Accesso riservato
        </p>
      </div>
    </div>
  );
}
