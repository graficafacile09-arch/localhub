"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Icona Carrello COMPATTA da posizionare accanto al logo nell'header.
 *
 * Rappresenta ESATTAMENTE la stessa funzione della voce "Carrello" della
 * vecchia barra di navigazione: stessa destinazione (/carrello) e stesso
 * badge numerico (pezzi) già gestito da useCarrello. Nessuna nuova logica
 * di conteggio, nessun duplicato: si riusa la stessa fonte dati.
 *
 * - Visivamente piccola e discreta, proporzionata al logo.
 * - Badge giallo con numero (stessa logica del badge precedente).
 * - Slot-only da usare sia con utente loggato sia non loggato: si adatta
 *   allo spazio disponibile senza spingere o sovrapporre gli elementi.
 */
export default function HeaderCartIcon() {
  const { pezzi } = useCarrello();

  return (
    <Link
      href="/carrello"
      aria-label={`Carrello${pezzi > 0 ? ` (${pezzi} articoli)` : ""}`}
      className="group relative inline-flex h-8 w-8 shrink-0 items-center justify-center transition-colors duration-200 hover:text-yellow-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 max-sm:h-7 max-sm:w-7"
    >
      <ShoppingCart
        aria-hidden
        className="h-[22px] w-[22px] text-yellow-400 transition-colors duration-200 group-hover:text-yellow-500 max-sm:h-5 max-sm:w-5"
      />
      {pezzi > 0 && (
        <span
          data-testid="cart-badge"
          className="absolute -right-1.5 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-black leading-none text-brand-deep ring-2 ring-white"
        >
          {pezzi > 99 ? "99+" : pezzi}
        </span>
      )}
    </Link>
  );
}