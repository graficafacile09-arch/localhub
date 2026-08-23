"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Home, ShoppingCart, Store } from "lucide-react";
import type { ComponentType } from "react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Navigazione pubblica — UNICA fonte delle voci Home/Negozi/Categorie/Carrello.
 *
 * Vive dentro la FASCIA BLU full-width renderizzata dall'Header. Concept:
 * "icona protagonista sopra + testo sotto", senza pill né pulsanti
 * arrotondati (nessun rettangolo, bordo o sfondo pieno attorno alle voci).
 *
 * - Stato normale: icona e testo GIALLO brand (yellow-400), molto visibili
 *   sulla fascia blu.
 * - Hover: giallo più luminoso (yellow-300), transizione morbida.
 * - Stato attivo (via usePathname): BIANCO (leggibile sul blu), con
 *   highlight circolare bianco molto leggero dietro l'icona, sottile linea
 *   bianca sotto il testo e piccolo indicatore bianco sulla linea interna.
 * - Carrello: stesso trattamento; badge numerico BLU (stesso blu della
 *   fascia) con numero bianco, integrato e leggibile.
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

  const indiceAttivo = voci.findIndex((v) => v.attiva);

  return (
    <div className="w-full">
      {/* Linea interna decorativa: bianca, discreta, con indicatore bianco
          sulla voce attiva. Solo SVG/CSS. */}
      <div aria-hidden="true" className="relative mx-auto h-[10px] w-full lg:w-[320px]">
        <svg viewBox="0 0 400 10" preserveAspectRatio="none" className="block h-full w-full">
          <line x1="10" y1="5" x2="390" y2="5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.25" />
        </svg>
        {indiceAttivo >= 0 && (
          <span
            className="absolute top-[6px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-white"
            style={{ left: `calc(12.5% + ${indiceAttivo * 25}%)` }}
          />
        )}
      </div>

      {/* NAV — griglia 4 colonne (uguale su mobile e desktop, centrata) così
          l'indicatore attivo resta allineato alla voce. */}
      <nav
        aria-label="Navigazione principale"
        className="relative mx-auto grid w-full max-w-[460px] grid-cols-4 items-center justify-items-center gap-x-2 lg:w-auto lg:gap-x-1.5"
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
              className="group relative flex min-w-0 flex-col items-center gap-1 px-2.5 py-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 max-sm:px-1.5 max-sm:py-0.5"
            >
              {/* Icona protagonista */}
              <span
                className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 max-sm:h-9 max-sm:w-9 ${
                  voce.attiva ? "bg-white/15" : "group-hover:bg-white/10"
                }`}
              >
                <Icona
                  aria-hidden
                  className={`h-6 w-6 transition-colors duration-200 max-sm:h-[22px] max-sm:w-[22px] ${
                    voce.attiva ? "text-white" : "text-yellow-400 group-hover:text-yellow-300"
                  }`}
                />
                {isCart && pezzi > 0 && (
                  <span
                    data-testid="cart-badge"
                    className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-black leading-none text-white ring-2 ring-white"
                  >
                    {pezzi > 99 ? "99+" : pezzi}
                  </span>
                )}
              </span>

              {/* Testo in grassetto */}
              <span
                className={`whitespace-nowrap text-xs font-bold leading-none tracking-tight transition-colors duration-200 sm:text-sm ${
                  voce.attiva ? "text-white" : "text-yellow-400 group-hover:text-yellow-300"
                }`}
              >
                {voce.label}
              </span>

              {/* Linea bianca sotto il testo (stato attivo) */}
              <span
                aria-hidden
                className={`mt-1 h-1 w-6 rounded-full bg-white transition-opacity duration-200 max-sm:w-5 ${
                  voce.attiva ? "opacity-90" : "opacity-0"
                }`}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
