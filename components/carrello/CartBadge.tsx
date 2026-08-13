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
      className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400 text-slate-800 shadow-md shadow-yellow-400/30 ring-1 ring-yellow-300 transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/25 before:to-transparent hover:-translate-y-0.5 hover:from-yellow-200 hover:to-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:translate-y-0 active:scale-95"
    >
      <ShoppingCart className="relative h-4 w-4" aria-hidden />
      {pezzi > 0 && (
        <span
          data-testid="cart-badge"
          className="absolute -right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white"
        >
          {pezzi > 99 ? "99+" : pezzi}
        </span>
      )}
    </Link>
  );
}
