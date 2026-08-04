"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clienteFooterItems, clienteNavItems } from "./navigation";

/**
 * Menu laterale dell'Area Clienti.
 * Evidenzia la voce attiva in base al pathname corrente.
 * Usato sia nella sidebar desktop (collassabile) sia nel drawer mobile.
 */
export default function ClienteSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/cliente") return pathname === "/cliente";
    return pathname.startsWith(href);
  }

  return (
    <div className="space-y-1.5 text-sm font-semibold text-slate-700">
      {clienteNavItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 ${
              active
                ? "bg-teal-50 text-teal-700 shadow-sm"
                : "hover:bg-slate-50"
            } ${collapsed ? "justify-center px-0" : ""}`}
          >
            <item.icon
              className={`h-4 w-4 shrink-0 ${active ? "text-teal-600" : "text-slate-400"}`}
              aria-hidden
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}

      {/* Separatore footer */}
      <div className="my-2 border-t border-slate-100" />

      {clienteFooterItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 hover:bg-slate-50 ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
