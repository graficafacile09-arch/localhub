"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home, Menu, X } from "lucide-react";
import AdminSidebar from "@/components/amministratore/AdminSidebar";

type MerchantTopBarProps = {
  storeName?: string | null;
  area?: "merchant" | "admin";
};

export default function MerchantTopBar({
  storeName,
  area = "merchant",
}: MerchantTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = area === "admin";
  const baseHref = isAdmin ? "/amministratore" : "/merchant";
  const storeId = pathname.match(/^\/merchant\/([^/]+)/)?.[1] ?? null;
  const dashboardHref = storeId ? `/merchant/${storeId}` : baseHref;

  const title = resolveTitle(pathname, storeName, isAdmin);

  const isRoot =
    pathname === baseHref ||
    (storeId !== null && pathname === `/merchant/${storeId}`);

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
      className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-blue-900/20 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] px-3 text-white md:hidden"
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

      {/* Menu amministratore mobile — stessa gerarchia della sidebar desktop */}
      {isAdmin ? <AdminMobileMenuButton /> : null}
    </div>
  );
}

/** Pulsante hamburger + drawer mobile con lo STESSO AdminSidebar della sidebar
 *  desktop: identica gerarchia (Strumenti di piattaforma → Negozi → Cestino →
 *  … → Amministrazione → Panoramica). */
function AdminMobileMenuButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri il menu amministratore"
        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 transition active:bg-white/20"
      >
        <Menu className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Chiudi il menu amministratore"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/50"
          />
          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-[#eef3f8] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/70 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Area Amministratore
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition active:bg-slate-200"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <AdminSidebar />
          </div>
        </div>
      ) : null}
    </>
  );
}

function resolveTitle(
  pathname: string,
  storeName?: string | null,
  isAdmin = false
): string {
  if (isAdmin && pathname === "/amministratore") return "I tuoi negozi";
  if (isAdmin && pathname.startsWith("/amministratore")) return "Amministrazione";
  if (pathname === "/merchant") return "I tuoi negozi";

  const withStore = /^\/merchant\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!withStore) return isAdmin ? "Amministratore" : "Venditore";

  const suffix = withStore[2] ?? "";

  if (suffix === "" || suffix === "/") return storeName ?? "Dashboard";
  if (suffix === "/prodotti/ai") return "Aggiungi con AI";
  if (suffix === "/prodotti/nuovo") return "Nuovo prodotto";
  if (/^\/prodotti\/[^/]+$/.test(suffix)) return "Modifica prodotto";
  if (suffix === "/prodotti") return "Prodotti";
  if (suffix === "/impostazioni") return "Impostazioni";

  return storeName ?? "Venditore";
}
