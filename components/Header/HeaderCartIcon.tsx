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
      className="group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-brand-dark hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 max-sm:h-9 max-sm:w-9"
    >
      <ShoppingCart
        aria-hidden
        className="h-5 w-5 transition-colors duration-200 max-sm:h-[18px] max-sm:w-[18px]"
      />
      {pezzi > 0 && (
        <span
          data-testid="cart-badge"
          className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-black leading-none text-brand-deep ring-2 ring-white"
        >
          {pezzi > 99 ? "99+" : pezzi}
        </span>
      )}
    </Link>
  );
}