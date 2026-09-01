"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Package, Heart, UserRound } from "lucide-react";
import { CLIENTE_BASE } from "./navigation";

type ClienteBottomNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Bottom Navigation mobile dell'Area Clienti (visibile solo su mobile).
 * Massimo 4 destinazioni realmente importanti: Dashboard, Ordini,
 * Preferiti, Profilo. NIENTE "Esci" qui: si esce dal menu account/drawer.
 * Le funzioni meno frequenti (es. Segnalazioni) restano nella sidebar e nel
 * drawer del menu (hamburger della top bar).
 */
const ITEMS: ClienteBottomNavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: CLIENTE_BASE,
    icon: LayoutDashboard,
  },
  {
    key: "ordini",
    label: "Ordini",
    href: `${CLIENTE_BASE}/ordini`,
    icon: Package,
  },
  {
    key: "preferiti",
    label: "Preferiti",
    href: `${CLIENTE_BASE}/preferiti`,
    icon: Heart,
  },
  {
    key: "profilo",
    label: "Profilo",
    href: `${CLIENTE_BASE}/profilo`,
    icon: UserRound,
  },
];

export default function ClienteBottomNav() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
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
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 transition-all duration-150 active:scale-95`}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200
                      ${active ? "bg-yellow-100" : "bg-transparent"}
                    `}
                  >
                    <Icon
                      className={`h-5 w-5 transition-colors duration-150
                        ${active ? "text-yellow-700" : "text-blue-600"}
                      `}
                      aria-hidden
                    />
                  </span>
                  <span
                    className={`max-w-full truncate text-[10px] font-semibold leading-none tracking-wide transition-colors duration-150
                      ${active ? "text-yellow-700" : "text-blue-600"}
                    `}
                  >
                    {item.label}
                  </span>
                  {/* Indicatore selezione: trattino giallo sotto la voce attiva */}
                  <span
                    aria-hidden
                    className={`absolute -bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full transition-opacity duration-200 ${
                      active ? "bg-yellow-400 opacity-100" : "bg-transparent opacity-0"
                    }`}
                  />
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
