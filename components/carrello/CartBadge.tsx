"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Icona carrello nell'header pubblico (barra blu): icona bianca, badge giallo
 * con il numero di pezzi. Logica invariata (CartContext + route /carrello).
 */
export default function CartBadge() {
  const { pezzi } = useCarrello();

  return (
    <Link
      href="/carrello"
      title="Carrello"
      aria-label={`Carrello, ${pezzi} ${pezzi === 1 ? "articolo" : "articoli"}`}
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition hover:bg-white/10 active:scale-95"
    >
      <ShoppingCart className="h-[18px] w-[18px]" aria-hidden />
      {pezzi > 0 && (
        <span
          data-testid="cart-badge"
          className="absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-black leading-none text-blue-950 ring-2 ring-blue-950"
        >
          {pezzi > 99 ? "99+" : pezzi}
        </span>
      )}
    </Link>
  );
}
