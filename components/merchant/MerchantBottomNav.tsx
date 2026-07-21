"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LogOut,
  Package,
  Settings,
  Sparkles,
  Store,
} from "lucide-react";

type MerchantBottomNavProps = {
  storeId: string | null;
};

export default function MerchantBottomNav({ storeId: storeIdProp }: MerchantBottomNavProps) {
  const pathname = usePathname();

  // Estrae negozioId direttamente dall'URL: /merchant/[negozioId]/...
  // Garantisce che la bottom nav funzioni sempre, indipendentemente
  // da come il layout passa la prop
  const urlStoreId = pathname.match(/^\/merchant\/([^/]+)/)?.[1] ?? null;
  const storeId = storeIdProp ?? urlStoreId;

  const hasStore = Boolean(storeId);

  // Voce AI — la più prominente, posizionata al centro
  const navItems = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: Home,
      href: storeId ? `/merchant/${storeId}` : "/merchant",
      available: true,
      ai: false,
    },
    {
      key: "prodotti",
      label: "Prodotti",
      icon: Package,
      href: storeId ? `/merchant/${storeId}/prodotti` : "/merchant",
      available: hasStore,
      ai: false,
    },
    {
      key: "ai",
      label: "AI",
      icon: Sparkles,
      href: storeId ? `/merchant/${storeId}/prodotti/ai` : "/merchant",
      available: hasStore,
      ai: true, // pulsante centrale prominente
    },
    {
      key: "negozio",
      label: "Negozio",
      icon: Store,
      href: storeId ? `/merchant/${storeId}/impostazioni` : "/merchant",
      available: hasStore,
      ai: false,
    },
    {
      key: "altro",
      label: "Altro",
      icon: Settings,
      href: null, // gestito con form signout + impostazioni
      available: true,
      ai: false,
      isMenu: true,
    },
  ];

  function isActive(href: string | null): boolean {
    if (!href) return false;
    // Match esatto per dashboard, prefisso per le altre
    if (href === `/merchant/${storeId}`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Bottom Navigation Bar ────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        aria-label="Navigazione merchant mobile"
      >
        {/* Safe area support — padding-bottom per notch iPhone e gesture bar Android */}
        <div
          className="border-t border-slate-200/80 bg-white/95 shadow-[0_-1px_0_0_rgba(0,0,0,0.06),0_-8px_32px_rgba(15,23,42,0.10)] backdrop-blur-md"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-end justify-around px-1 pt-2 pb-2">
            {navItems.map((item) => {
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

              // ── Voce "Altro" — apre signout via form ─────────────────────
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
                  {/* Pill indicatore attivo */}
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

      {/* Spacer: evita che il contenuto finisca sotto la bottom nav */}
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

// ── Voce "Altro": mostra logout + link impostazioni ──────────────────────────
function MerchantBottomNavAltro() {
  return (
    <form action="/api/auth/signout" method="post" className="flex flex-col items-center">
      <button
        type="submit"
        className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all duration-150 active:scale-95"
        aria-label="Esci dall'area merchant"
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
