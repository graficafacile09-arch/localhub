"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, Menu } from "lucide-react";
import type { MerchantStoreSummary } from "@/lib/merchant/types";
import { ADMIN_BASE } from "@/components/amministratore/navigation";
import { MERCHANT_BASE, getMerchantTopTitle } from "./navigation";
import MerchantMobileMenu from "./MerchantMobileMenu";

type MerchantTopBarProps = {
  storeName?: string | null;
  area?: "merchant" | "admin";
  /** Negozi per l'elenco "I tuoi negozi" nel drawer mobile. */
  stores?: MerchantStoreSummary[];
  /** Conteggio ordini non letti per negozio (badge nel drawer). */
  ordiniNonLettiPerNegozio?: Record<string, number>;
  /** Conteggio reclami attivi per negozio (badge voce Ordini). */
  reclamiApertiPerNegozio?: Record<string, number>;
};

export default function MerchantTopBar({
  storeName,
  area = "merchant",
  stores = [],
  ordiniNonLettiPerNegozio,
  reclamiApertiPerNegozio,
}: MerchantTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = area === "admin";
  const baseHref = isAdmin ? ADMIN_BASE : MERCHANT_BASE;
  const storeId = pathname.match(/^\/merchant\/([^/]+)/)?.[1] ?? null;
  const dashboardHref = storeId ? `/merchant/${storeId}` : baseHref;

  const title = getMerchantTopTitle(pathname, storeName, isAdmin);

  const isRoot =
    pathname === baseHref ||
    (storeId !== null && pathname === `/merchant/${storeId}`);

  const [menuOpen, setMenuOpen] = useState(false);

  // Chiude il drawer a ogni cambio di route.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function handleBack() {
    if (isRoot) {
      if (storeId) router.push(baseHref);
      return;
    }
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(dashboardHref);
    }
  }

  return (
    <div
      className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-blue-800/20 bg-blue-700 px-3 text-white md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Home button — sempre visibile */}
      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="Vai alla Home"
        className="flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-bold transition active:bg-white/20"
      >
        <Home className="h-[16px] w-[16px]" aria-hidden />
        <span>Home</span>
      </button>

      {/* Back button — nascosto sulla root */}
      <button
        type="button"
        onClick={handleBack}
        aria-label="Torna indietro"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition active:bg-white/20 ${
          isRoot && !storeId ? "invisible" : ""
        }`}
      >
        <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {/* Title */}
      <span className="truncate text-sm font-bold tracking-tight text-white/90">
        {title}
      </span>

      {/* Hamburger — menu "Altro" (drawer) per entrambe le aree */}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Apri il menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 transition active:bg-white/20"
      >
        <Menu className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {menuOpen && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-900/50"
          />
          <MerchantMobileMenu
            area={area}
            stores={stores}
            storeId={storeId}
            storeName={storeName}
            ordiniNonLettiPerNegozio={ordiniNonLettiPerNegozio}
            reclamiApertiPerNegozio={reclamiApertiPerNegozio}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
