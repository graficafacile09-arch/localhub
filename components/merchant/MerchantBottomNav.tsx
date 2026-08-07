"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LogOut,
  Package,
  Sparkles,
  Store,
  Trash2,
  Users,
} from "lucide-react";

type MerchantBottomNavProps = {
  storeId: string | null;
  area?: "merchant" | "admin";
};

export default function MerchantBottomNav({
  storeId: storeIdProp,
  area = "merchant",
}: MerchantBottomNavProps) {
  const pathname = usePathname();

  const isAdmin = area === "admin";
  const baseHref = isAdmin ? "/amministratore" : "/merchant";
  const ADMIN_BASE = "/amministratore";

  // Pagine globali dell'area merchant che NON identificano un negozio
  const GLOBAL_MERCHANT_SLUGS = ["nuovo"];

  // Estrae negozioId direttamente dall'URL: /merchant/[negozioId]/...
  const urlStoreId = pathname.match(/^\/merchant\/([^/]+)/)?.[1] ?? null;
  const storeId =
    urlStoreId && !GLOBAL_MERCHANT_SLUGS.includes(urlStoreId)
      ? storeIdProp ?? urlStoreId
      : storeIdProp;

  const hasStore = Boolean(storeId);

  // ── Voci dell'Area Amministratore (mobile): la stessa gerarchia della
  //    sidebar desktop — Negozi sopra Cestino sopra Utenti. ────────────────
  const adminNavItems = [
    {
      key: "home",
      label: "Home",
      icon: Home,
      href: "/",
      available: true,
      ai: false,
    },
    {
      key: "negozi",
      label: "Negozi",
      icon: Store,
      href: `${ADMIN_BASE}/attivita`,
      available: true,
      ai: false,
    },
    {
      key: "cestino",
      label: "Cestino",
      icon: Trash2,
      href: `${ADMIN_BASE}/cestino`,
      available: true,
      ai: false,
    },
    {
      key: "utenti",
      label: "Utenti",
      icon: Users,
      href: `${ADMIN_BASE}/utenti`,
      available: true,
      ai: false,
    },
    {
      key: "altro",
      label: "Esci",
      icon: LogOut,
      href: null,
      available: true,
      isMenu: true,
      ai: false,
    },
  ];

  // Nell'Area Amministratore si usa la gerarchia admin, non le voci merchant.

  // Voce AI — la più prominente, posizionata al centro
  const navItems = [
    {
      key: "home",
      label: "Home",
      icon: Home,
      href: "/",
      available: true,
      ai: false,
    },
    {
      key: "dashboard",
      label: "Negozio",
      icon: Store,
      href: storeId ? `/merchant/${storeId}` : baseHref,
      available: true,
      ai: false,
    },
    {
      key: "prodotti",
      label: "Prodotti",
      icon: Package,
      href: storeId ? `/merchant/${storeId}/prodotti` : baseHref,
      available: hasStore,
      ai: false,
    },
    {
      key: "ai",
      label: "AI",
      icon: Sparkles,
      href: storeId ? `/merchant/${storeId}/prodotti/ai` : baseHref,
      available: hasStore,
      ai: true, // pulsante centrale prominente
    },
    {
      key: "negozio",
      label: "Gestione",
      icon: Store,
      href: storeId ? `/merchant/${storeId}/impostazioni` : baseHref,
      available: hasStore,
      ai: false,
    },
    {
      key: "altro",
      label: "Esci",
      icon: LogOut,
      href: null,
      available: true,
      ai: false,
      isMenu: true,
    },
  ];

  // Nell'Area Amministratore si usa la gerarchia admin, non le voci merchant.
  const items = isAdmin ? adminNavItems : navItems;

  function isActive(href: string | null): boolean {
    if (!href) return false;
    if (href === "/") return pathname === "/";
    if (href === `/merchant/${storeId}`) {
      return pathname === href;
    }
    // "Negozio" (senza negozio selezionato) è attivo solo sulla home dell'area
    if (href === baseHref) return pathname === baseHref;
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Bottom Navigation Bar ────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[60] md:hidden"
        aria-label="Navigazione area amministratore mobile"
      >
        <div
          className="border-t border-slate-200/80 bg-white/95 shadow-[0_-1px_0_0_rgba(0,0,0,0.06),0_-8px_32px_rgba(15,23,42,0.10)] backdrop-blur-md"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-end justify-around px-1 pt-2 pb-2 touch-manipulation">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.href ? isActive(item.href) : false;

              // ── Pulsante AI — prominente e sollevato ──────────────────────
              if (item.ai) {
                return (
                  <Link
                    key={item.key}
                    href={item.available ? item.href! : "#"}
                    aria-label="Aggiungi prodotto con AI"
                    className="relative -mt-5 flex flex-col items-center"
                  >
                    <span
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-all duration-200 active:scale-95
                        ${
                          active
                            ? "bg-blue-700 shadow-blue-600/50"
                            : "bg-linear-to-br from-blue-600 to-blue-500 shadow-blue-500/40"
                        }
                        ${!item.available ? "opacity-40" : ""}
                      `}
                    >
                      <Icon className="h-6 w-6 text-white" aria-hidden />
                    </span>
                    <span
                      className={`mt-1.5 text-[10px] font-bold leading-none tracking-wide transition-colors
                        ${active ? "text-blue-700" : "text-slate-500"}
                      `}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              }

              // ── Voce "Esci" — apre signout via form ─────────────────────
              if (item.isMenu) {
                return (
                  <MerchantBottomNavAltro key={item.key} />
                );
              }

              // ── Voci standard ─────────────────────────────────────────────
              return (
                <Link
                  key={item.key}
                  href={item.available ? item.href! : "#"}
                  className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all duration-150 active:scale-95
                    ${!item.available ? "pointer-events-none opacity-30" : ""}
                  `}
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
                    className={`text-[10px] font-semibold leading-none tracking-wide transition-colors duration-150
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

function MerchantBottomNavAltro() {
  return (
    <form action="/api/auth/signout" method="post" className="flex flex-col items-center">
      <button
        type="submit"
        className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all duration-150 active:scale-95"
        aria-label="Esci dall'area amministratore"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-transparent transition-all duration-200">
          <LogOut className="h-5 w-5 text-slate-400" aria-hidden />
        </span>
        <span className="text-[10px] font-semibold leading-none tracking-wide text-slate-400">
          Esci
        </span>
      </button>
    </form>
  );
}
