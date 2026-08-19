"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CLIENTE_BASE, clienteNavItems } from "./navigation";

type ClienteBottomNavItem = {
  key: string;
  label: string;
  href: string | null;
  icon: LucideIcon;
  isMenu?: boolean;
};

/**
 * Bottom Navigation mobile dell'Area Clienti (visibile solo su mobile).
 * Stesso pattern di MerchantBottomNav (Venditore/Amministratore):
 * barra fissa in basso con le voci di navigazione dell'area + "Esci".
 * La voce "Home" NON è qui: è già il pulsante Home della top bar mobile
 * (come nelle altre aree). I dati arrivano da navigation.ts — unica fonte.
 */
export default function ClienteBottomNav() {
  const pathname = usePathname();

  const items: ClienteBottomNavItem[] = [
    ...clienteNavItems.map((item) => ({
      key: item.href,
      label: item.label,
      href: item.href,
      icon: item.icon,
    })),
    {
      key: "esci",
      label: "Esci",
      href: null,
      icon: LogOut,
      isMenu: true,
    },
  ];

  function isActive(href: string | null): boolean {
    if (!href) return false;
    if (href === "/") return pathname === "/";
    if (href === CLIENTE_BASE) return pathname === CLIENTE_BASE;
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Bottom Navigation Bar ─────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[60] md:hidden"
        aria-label="Navigazione area clienti mobile"
      >
        <div
          className="border-t border-slate-200/80 bg-white/95 shadow-[0_-1px_0_0_rgba(0,0,0,0.06),0_-8px_32px_rgba(15,23,42,0.10)] backdrop-blur-md"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-end justify-around px-1 pt-2 pb-2 touch-manipulation">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.href ? isActive(item.href) : false;

              // ── Voce "Esci" — apre signout via form ─────────────────────
              if (item.isMenu) {
                return <ClienteBottomNavEsci key={item.key} />;
              }

              // ── Voci standard ─────────────────────────────────────────────
              return (
                <Link
                  key={item.key}
                  href={item.href!}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 transition-all duration-150 active:scale-95`}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200
                      ${active ? "bg-blue-50" : "bg-transparent"}
                    `}
                  >
                    <Icon
                      className={`h-5 w-5 transition-colors duration-150
                        ${active ? "text-blue-600" : "text-slate-400"}
                      `}
                      aria-hidden
                    />
                  </span>
                  <span
                    className={`max-w-full truncate text-[10px] font-semibold leading-none tracking-wide transition-colors duration-150
                      ${active ? "text-blue-600" : "text-slate-400"}
                    `}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Spacer */}
      <div
        className="md:hidden"
        style={{
          height: `calc(72px + env(safe-area-inset-bottom, 0px))`,
        }}
        aria-hidden
      />
    </>
  );
}

function ClienteBottomNavEsci() {
  return (
    <form action="/api/auth/signout" method="post" className="flex min-w-0 flex-1 flex-col items-center">
      <button
        type="submit"
        className="flex w-full min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 transition-all duration-150 active:scale-95"
        aria-label="Esci dall'area clienti"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-transparent transition-all duration-200">
          <LogOut className="h-5 w-5 text-slate-400" aria-hidden />
        </span>
        <span className="max-w-full truncate text-[10px] font-semibold leading-none tracking-wide text-slate-400">
          Esci
        </span>
      </button>
    </form>
  );
}