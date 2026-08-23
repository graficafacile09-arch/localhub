"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Carrello nell'Header con badge del numero di pezzi (FASE F2.4).
 *
 * - Default: icona circolare gialla (usata fuori dall'header o in versioni
 *   compatte).
 * - `pill`: voce di navigazione completa (icona + testo "Carrello"), coerente
 *   con le altre voci della riga di navigazione pubblica.
 *
 * La logica del carrello è sempre la stessa: link a /carrello con badge del
 * numero di articoli.
 */
export default function CartBadge({ pill = false }: { pill?: boolean }) {
  const { pezzi } = useCarrello();

  if (pill) {
    return (
      <Link
        href="/carrello"
        title="Carrello"
        aria-label={`Carrello, ${pezzi} ${pezzi === 1 ? "articolo" : "articoli"}`}
        className="relative inline-flex items-center gap-1.5 rounded-full bg-yellow-400 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95 max-sm:px-2 max-sm:text-xs"
      >
        <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
        Carrello
        {pezzi > 0 && (
          <span
            data-testid="cart-badge"
            className="absolute -right-1.5 -top-1.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white"
          >
            {pezzi > 99 ? "99+" : pezzi}
          </span>
        )}
      </Link>
    );
  }

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
