"use client";

import { useRouter } from "next/navigation";
import { Home, Menu } from "lucide-react";

/**
 * Barra superiore mobile dell'Area Clienti (visibile solo su mobile).
 * Stessa struttura della MerchantTopBar (Venditore/Amministratore):
 * pulsante Home + titolo area + pulsante menu (drawer).
 * Apre il drawer di navigazione tramite la callback passata dal ClienteShell.
 */
export default function ClienteMobileTopBar({
  onOpenMenu,
  menuOpen = false,
}: {
  onOpenMenu: () => void;
  menuOpen?: boolean;
}) {
  const router = useRouter();

  return (
    <div
      className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-blue-900/20 bg-[linear-gradient(180deg,#1d4ed8_0%,#2563eb_100%)] px-3 text-white md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Home button — sempre visibile (stessa posizione della MerchantTopBar) */}
      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="Vai alla Home"
        className="flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-bold transition active:bg-white/20"
      >
        <Home className="h-[16px] w-[16px]" aria-hidden />
        <span>Home</span>
      </button>

      {/* Title */}
      <span className="truncate text-sm font-bold tracking-tight text-white/90">
        Area Clienti
      </span>

      {/* Menu — apre il drawer di navigazione */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Apri il menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition active:bg-white/20"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}