"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Icona carrello nel Header con badge del numero di pezzi (FASE F2.4).
 * Coerente con le altre icone circolari gialle della barra di navigazione.
 */
export default function CartBadge() {
  const { pezzi } = useCarrello();

  return (
    <Link
      href="/carrello"
      title="Carrello"
      aria-label={`Carrello, ${pezzi} ${pezzi === 1 ? "articolo" : "articoli"}`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
    >
      <ShoppingCart className="h-4 w-4" aria-hidden />
      {pezzi > 0 && (
        <span
          data-testid="cart-badge"
          className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white"
        >
          {pezzi > 99 ? "99+" : pezzi}
        </span>
      )}
    </Link>
  );
}
