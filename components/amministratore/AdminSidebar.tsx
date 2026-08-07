"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminFooterItems, adminNavItems } from "./navigation";

/**
 * Menu laterale del pannello Amministratore.
 * In modalità "collapsed" mostra solo le icone (con tooltip), altrimenti
 * l'etichetta completa. Lo stato attivo segue la route corrente.
 * In fondo una sezione separata con navigazione rapida (Torna al sito,
 * Impostazioni, Guida).
 */
export default function AdminSidebar({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    // La home pubblica non è mai "attiva" nel pannello.
    if (href === "/") return false;
    if (href === "/amministratore") return pathname === href;
    return pathname.startsWith(href);
  }

  // Le voci sono parti dell'array "adminNavItems" o "adminFooterItems".
  // Ogni fetta ha header con href "#" ripetuto: la chiave univoca è l'etichetta.
  function itemKey(item: { label: string }) {
    return item.label;
  }

  function renderItem(item: { href: string; label: string; icon: LucideIcon; section?: boolean }) {
    const active = isActive(item.href);
    const Icon = item.icon;

    // Etichetta di sezione: non è un link, separa i gruppi di voci.
    if (item.section) {
      if (collapsed) {
        return (
          <div
            key={itemKey(item)}
            className="flex h-6 items-center justify-center"
            title={item.label}
          >
            <span className="block h-px w-6 bg-slate-200" aria-hidden />
          </div>
        );
      }
      return (
        <p
          key={itemKey(item)}
          className="flex items-center gap-2 px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400"
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {item.label}
        </p>
      );
    }

    if (collapsed) {
return (
        <Link
          key={itemKey(item)}
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
        key={itemKey(item)}
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
  }

  return (
    <div className="space-y-1">
      <nav aria-label="Menu Amministratore" className="space-y-1">
        {adminNavItems.map((item) => renderItem(item))}
      </nav>      {/* ── Sezione footer: navigazione rapida ─────────────────────────────── */}
      <nav
        aria-label="Navigazione rapida"
        className={`!mt-4 space-y-1 border-t border-slate-100 pt-4 ${
          collapsed ? "flex flex-col items-center" : ""
        }`}
      >
        {adminFooterItems.map((item) => renderItem(item))}
      </nav>

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
    </div>
  );
}
