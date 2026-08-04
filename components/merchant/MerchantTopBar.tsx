"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";

type MerchantTopBarProps = {
  storeName?: string | null;
};

export default function MerchantTopBar({ storeName }: MerchantTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const storeId = pathname.match(/^\/merchant\/([^/]+)/)?.[1] ?? null;
  const dashboardHref = storeId ? `/merchant/${storeId}` : "/merchant";

  const title = resolveTitle(pathname, storeName);

  const isRoot =
    pathname === "/merchant" ||
    (storeId !== null && pathname === `/merchant/${storeId}`);

  function handleBack() {
    if (isRoot) {
      if (storeId) router.push("/merchant");
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
    </div>
  );
}

function resolveTitle(pathname: string, storeName?: string | null): string {
  if (pathname === "/merchant") return "I tuoi negozi";

  const withStore = /^\/merchant\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!withStore) return "Amministratore";

  const suffix = withStore[2] ?? "";

  if (suffix === "" || suffix === "/") return storeName ?? "Dashboard";
  if (suffix === "/prodotti/ai") return "Aggiungi con AI";
  if (suffix === "/prodotti/nuovo") return "Nuovo prodotto";
  if (/^\/prodotti\/[^/]+$/.test(suffix)) return "Modifica prodotto";
  if (suffix === "/prodotti") return "Prodotti";
  if (suffix === "/impostazioni") return "Impostazioni";

  return storeName ?? "Amministratore";
}
