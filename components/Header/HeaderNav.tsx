"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Home, ShoppingCart, Store } from "lucide-react";
import type { ComponentType } from "react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Navigazione pubblica — UNICA fonte delle voci Home/Negozi/Categorie/Carrello.
 *
 * Concept approvato (mockup "V4"): barra di navigazione compatta e moderna,
 * icona sopra + testo sotto, separatori verticali sottili tra le voci e
 * linea orizzontale sottile sotto la barra. NESSUNA pill, nessun riquadro,
 * nessuna card, nessuna fascia blu piena.
 *
 * - Stato normale: icona, testo e piccolo elemento decorativo GIALLI
 *   (giallo brand del sito).
 * - Stato attivo (via usePathname): icona, testo e indicatore BLU (stesso
 *   blu della "In" del logo); l'indicatore è una semplice linea orizzontale
 *   sottile sotto il testo.
 * - Separatori verticali: sottili, molto discreti (#e5e7eb), danno
 *   struttura senza essere protagonisti.
 * - Carrello: stesso trattamento; badge numerico GIALLO con numero a
 *   contrasto, ancorato alla parte superiore dell'icona. Logica invariata.
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
    <div className="w-full lg:w-auto">
      {/* BARRA NAVIGAZIONE — griglia 4 colonne su mobile, flex centrato su
          desktop; nessun riquadro attorno alle voci. Linea orizzontale
          superiore e inferiore CONTINUE (border-y, stesso tono dei
          separatori verticali) che strutturano la barra come una fascia
          continua, senza trasformare le voci in box. */}
      <nav
        aria-label="Navigazione principale"
        className="relative mx-auto grid w-full max-w-[440px] grid-cols-4 items-center justify-items-center border-y border-slate-200 lg:w-auto lg:gap-1"
      >
        {/* Separatori verticali sottili tra le voci (molto discreti, danno
            struttura senza essere protagonisti). */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-9 w-px -translate-y-1/2 bg-slate-200 max-sm:h-8"
            style={{ left: `calc(25% + ${i * 25}%)` }}
          />
        ))}
        {voci.map((voce) => {
          const Icona = voce.icona as ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
          const isCart = voce.href === "/carrello";
          return (
            <Link
              key={voce.href}
              href={voce.href}
              aria-label={voce.label}
              aria-current={voce.attiva ? "page" : undefined}
              className="group relative flex min-w-0 flex-col items-center gap-1 px-3 py-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 max-sm:px-1.5"
            >
              {/* Icona protagonista */}
              <span className="relative flex h-10 w-10 items-center justify-center max-sm:h-9 max-sm:w-9">
                <Icona
                  aria-hidden
                  className={`h-6 w-6 transition-colors duration-200 max-sm:h-[22px] max-sm:w-[22px] ${
                    voce.attiva ? "text-brand-dark" : "text-yellow-400 group-hover:text-yellow-500"
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

              {/* Testo sotto l'icona */}
              <span
                className={`whitespace-nowrap text-xs font-bold leading-none tracking-tight transition-colors duration-200 sm:text-sm ${
                  voce.attiva ? "text-brand-dark" : "text-yellow-500 group-hover:text-yellow-600"
                }`}
              >
                {voce.label}
              </span>

              {/* Indicatore attivo: semplice linea orizzontale sottile sotto
                  il testo (blu, come nel mockup) */}
              <span
                aria-hidden
                className={`mt-1 h-[3px] w-8 rounded-full transition-opacity duration-200 max-sm:w-6 ${
                  voce.attiva ? "bg-brand opacity-100" : "bg-transparent opacity-0"
                }`}
              />
            </Link>
          );
        })}
      </nav>
      {/* La linea orizzontale sottile sotto la barra è il border-b dell'header. */}
    </div>
  );
}
