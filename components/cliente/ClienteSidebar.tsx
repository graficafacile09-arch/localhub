"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBasket } from "lucide-react";
import { clienteFooterItems, clienteNavItems } from "./navigation";

/**
 * Menu laterale dell'Area Clienti (design system moderno).
 *
 * Ogni voce è una riga ricca con gerarchia chiara:
 *   [icona]  ORDINI              [badge]
 *            I miei acquisti
 *
 * - Stato attivo: barra di accento laterale + sfondo tinta + testo accent.
 * - Descrizione breve sotto l'etichetta (da navigation.ts, unica fonte).
 * - Badge numerico sulla voce Ordini (ordini in corso) quando presente.
 * - Gruppi separati (Ordini / Account / footer) con micro-label.
 * - Mobile drawer e sidebar desktop usano lo STESSO componente (collapsed
 *   = solo icone per la sidebar desktop comprimibile).
 * `onNavigate` (opzionale) chiude il drawer mobile prima della navigazione.
 */
export default function ClienteSidebar({
  collapsed = false,
  onNavigate,
  ordiniInCorso = 0,
  withHeader = false,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  /** Conteggio ordini in corso (badge sulla voce Ordini). */
  ordiniInCorso?: number;
  /** Mostra il blocco brand in testa alla sidebar (desktop espansa). */
  withHeader?: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/cliente") return pathname === "/cliente";
    return pathname.startsWith(href);
  }

  const GRUPPI: ReadonlyArray<{
    key: string;
    etichetta: string;
    items: typeof clienteNavItems;
    footer?: boolean;
  }> = [
    {
      key: "ordini",
      etichetta: "Ordini",
      items: clienteNavItems.filter((i) => i.gruppo === "ordini"),
    },
    {
      key: "account",
      etichetta: "Account",
      items: clienteNavItems.filter((i) => i.gruppo === "account"),
    },
  ];

  return (
    <nav aria-label="Menu Area Clienti" className="space-y-1">
      {/* ── Blocco brand (solo sidebar desktop espansa) ───────────────────── */}
      {withHeader && !collapsed && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-linear-to-br from-blue-600 to-blue-500 px-4 py-3.5 text-white shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <ShoppingBasket className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black tracking-tight">Area Clienti</span>
            <span className="block truncate text-[11px] text-blue-100">
              Il tuo spazio personale su InCittà
            </span>
          </span>
        </div>
      )}

      {GRUPPI.map((gruppo) => (
        <div key={gruppo.key} className="space-y-1.5">
          {!collapsed && (
            <p className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {gruppo.etichetta}
            </p>
          )}
          {gruppo.items.map((item) => {
            const active = isActive(item.href);
            const badge = item.href === "/cliente/ordini" ? ordiniInCorso : 0;
            const mostraBadge = badge > 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center gap-3 rounded-2xl transition-all duration-150 ${
                  collapsed ? "justify-center px-0 py-3" : "px-3 py-2.5"
                } ${
                  active
                    ? "bg-blue-50 text-blue-800 ring-1 ring-blue-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {/* Barra di accento dello stato attivo */}
                {active && !collapsed && (
                  <span
                    className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-blue-600"
                    aria-hidden
                  />
                )}

                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    active
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
                  }`}
                >
                  <item.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>

                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold">
                        {item.label}
                      </span>
                      {mostraBadge && (
                        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-black leading-none text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium leading-4 text-slate-400">
                      {item.description}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      {/* Separatore footer */}
      <div className="my-2 border-t border-slate-100" />

      {clienteFooterItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-150 hover:bg-slate-50 ${
              collapsed ? "justify-center px-0 py-3" : ""
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {item.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-medium leading-4 text-slate-400">
                  {item.description}
                </span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
