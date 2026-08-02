"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { adminNavItems } from "./navigation";

/**
 * Menu laterale del pannello Amministratore.
 * In modalità "collapsed" mostra solo le icone (con tooltip), altrimenti
 * l'etichetta completa. Lo stato attivo segue la route corrente.
 */
export default function AdminSidebar({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/amministratore") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav aria-label="Menu Amministratore" className="space-y-1">
      {adminNavItems.map((item) => {
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
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-150 ${
              active
                ? "bg-blue-50 text-blue-700 shadow-sm"
                : "text-slate-700 hover:bg-slate-50 hover:text-blue-600"
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
              aria-hidden
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <div
        className={`!mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
        <p
          className={`text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${
            collapsed ? "hidden" : ""
          }`}
        >
          Accesso riservato
        </p>
      </div>
    </nav>
  );
}
