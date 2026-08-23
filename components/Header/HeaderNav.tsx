"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Home, ShoppingCart, Store } from "lucide-react";
import type { ComponentType } from "react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Navigazione pubblica — UNICA fonte delle voci Home/Negozi/Categorie/Carrello.
 *
 * Concept: "icona protagonista sopra + testo sotto", su fondo chiaro, con
 * cornici/segno grafico attorno alla singola voce. Nessuna pill pesante,
 * nessun rettangolo pieno, nessun bordo spesso, nessuna ombra vistosa.
 *
 * - Stato normale: icona, testo e cornice GIALLI (giallo brand del sito),
 *   ben visibili su fondo chiaro.
 * - Stato attivo (via usePathname): icona, testo e cornice BLU (stesso blu
 *   della "In" del logo), con indicatore blu sotto il testo — chiaramente
 *   distinguibile dal normale.
 * - Hover: sfumatura leggera del giallo/blu, transizione morbida, senza
 *   spostare gli altri elementi.
 * - Carrello: stessa logica cromatica; badge numerico GIALLO con testo a
 *   contrasto (blu scuro), leggibile anche quando il Carrello è attivo
 *   (blu).
 * - Mobile: le quattro voci restano SEMPRE visibili e distribuite
 *   orizzontalmente, con icona sopra e testo sotto, senza overflow.
 */
export default function HeaderNav() {
  const pathname = usePathname();
  const { pezzi } = useCarrello();

  const voci = [
    { label: "Home", href: "/", icona: Home, attiva: pathname === "/" },
    { label: "Negozi", href: "/negozi", icona: Store, attiva: pathname === "/negozi" || pathname.startsWith("/negozi/") },
    { label: "Categorie", href: "/categorie", icona: Grid2X2, attiva: pathname === "/categorie" || pathname.startsWith("/categorie/") },
    { label: "Carrello", href: "/carrello", icona: ShoppingCart, attiva: pathname === "/carrello" || pathname.startsWith("/carrello/") },
  ];

  return (
    <nav
      aria-label="Navigazione principale"
      className="grid w-full max-w-[520px] grid-cols-4 items-center justify-items-center gap-1.5 sm:gap-2 lg:w-auto lg:gap-2.5"
    >
      {voci.map((voce) => {
        const Icona = voce.icona as ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
        const isCart = voce.href === "/carrello";
        return (
          <Link
            key={voce.href}
            href={voce.href}
            aria-label={voce.label}
            aria-current={voce.attiva ? "page" : undefined}
            className={`group relative flex w-full min-w-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 max-sm:px-1 max-sm:py-1.5 ${
              voce.attiva
                ? "border-brand-200 bg-brand-50"
                : "border-yellow-100 bg-yellow-50/60 hover:border-yellow-200 hover:bg-yellow-50"
            }`}
          >
            {/* Icona protagonista */}
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full max-sm:h-9 max-sm:w-9">
              <Icona
                aria-hidden
                className={`h-6 w-6 transition-colors duration-200 max-sm:h-[22px] max-sm:w-[22px] ${
                  voce.attiva ? "text-brand-dark" : "text-yellow-500 group-hover:text-yellow-600"
                }`}
              />
              {isCart && pezzi > 0 && (
                <span
                  data-testid="cart-badge"
                  className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-black leading-none text-brand-deep ring-2 ring-white"
                >
                  {pezzi > 99 ? "99+" : pezzi}
                </span>
              )}
            </span>

            {/* Testo in grassetto */}
            <span
              className={`whitespace-nowrap text-xs font-bold leading-none tracking-tight transition-colors duration-200 sm:text-sm ${
                voce.attiva ? "text-brand-dark" : "text-yellow-600"
              }`}
            >
              {voce.label}
            </span>

            {/* Indicatore attivo (blu) sotto il testo */}
            <span
              aria-hidden
              className={`mt-1 h-1 w-7 rounded-full transition-opacity duration-200 max-sm:w-5 ${
                voce.attiva ? "bg-brand opacity-100" : "bg-transparent opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
