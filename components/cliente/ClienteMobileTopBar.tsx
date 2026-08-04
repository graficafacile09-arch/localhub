"use client";

import Link from "next/link";
import { Menu, ShoppingBasket } from "lucide-react";

/**
 * Barra superiore mobile dell'Area Clienti (visibile solo su mobile).
 * Apre il drawer di navigazione tramite la callback passata dal ClienteShell.
 */
export default function ClienteMobileTopBar({
  onOpenMenu,
  menuOpen = false,
}: {
  onOpenMenu: () => void;
  menuOpen?: boolean;
}) {
  return (
    <div
      className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-teal-900/20 bg-[linear-gradient(180deg,#0f766e_0%,#0d9488_100%)] px-3 text-white md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <Link
        href="/"
        aria-label="LocalHub — torna al sito"
        className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1.5 text-sm font-black tracking-tight transition active:bg-white/20"
      >
        <ShoppingBasket className="h-4 w-4 text-cyan-200" aria-hidden />
        <span>LocalHub</span>
      </Link>

      <span className="truncate text-sm font-bold tracking-tight text-white/90">
        Area Clienti
      </span>

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
