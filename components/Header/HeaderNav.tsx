"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Home, ShoppingCart, Store } from "lucide-react";
import type { ComponentType } from "react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Navigazione pubblica — UNICA fonte delle voci Home/Negozi/Categorie/Carrello.
 *
 * Concept grafico: "icona protagonista sopra + testo sotto", all'interno di
 * una FASCIA BLU istituzionale che dà struttura alla navigazione (nessun
 * hamburger, nessuna pill separata, nessun pulsante rettangolare).
 *
 * - Fascia: blu istituzionale del sito (blue-900), angoli arrotondati,
 *   nessuna ombra pesante.
 * - Stato normale: icona e testo GIALLO (stesso giallo brand del sito),
 *   molto visibile sulla fascia blu.
 * - Stato attivo (via usePathname): icona e testo BIANCO (blu su blu non
 *   sarebbe leggibile), con highlight circolare bianco molto leggero dietro
 *   l'icona, sottile linea bianca sotto il testo e piccolo indicatore
 *   bianco sotto la linea decorativa interna.
 * - Hover (desktop): icona e testo virano gradualmente al bianco, senza
 *   spostare gli altri elementi.
 * - Carrello: stesso trattamento; badge numerico BLU SCURO con numero
 *   bianco, integrato e leggibile.
 * - Mobile: le quattro voci restano SEMPRE visibili e distribuite
 *   orizzontalmente, con icona sopra e testo sotto, senza overflow.
 *
 * Decorazione interna: sottile linea orizzontale bianca e discreta sopra le
 * voci (solo SVG/CSS — nessuna barra piena, rettangolo pesante, gradiente
 * vistoso, emoji o simbolo Unicode).
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
    <div className="w-full lg:w-auto">
      {/* FASCIA BLU — struttura della navigazione (istituzionale, angoli
          arrotondati, nessuna ombra pesante) */}
      <div className="rounded-2xl bg-blue-900 px-2 py-2 sm:px-3 sm:py-2.5 lg:px-4 lg:py-3">
        {/* Decorazione interna: linea orizzontale bianca molto discreta con
            indicatore bianco sulla voce attiva. Solo SVG/CSS. */}
        <div aria-hidden="true" className="relative mx-auto h-[10px] w-full lg:w-[300px]">
          <svg viewBox="0 0 400 10" preserveAspectRatio="none" className="block h-full w-full">
            <line x1="10" y1="5" x2="390" y2="5" stroke="rgba(255,255,255,0.28)" strokeWidth="1.25" />
          </svg>
          {indiceAttivo >= 0 && (
            <span
              className="absolute top-[6px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-white"
              style={{ left: `calc(12.5% + ${indiceAttivo * 25}%)` }}
            />
          )}
        </div>

        {/* NAV — griglia 4 colonne (uguale su mobile e desktop, centrata su
            desktop) così l'indicatore attivo resta allineato alla voce. */}
        <nav
          aria-label="Navigazione principale"
          className="relative mx-auto grid w-full max-w-[430px] grid-cols-4 items-center justify-items-center gap-x-2 lg:w-auto lg:gap-x-1.5"
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
                className="group relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 max-sm:px-1.5 max-sm:py-1"
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
                      voce.attiva ? "text-white" : "text-yellow-400 group-hover:text-white"
                    }`}
                  />
                  {isCart && pezzi > 0 && (
                    <span
                      data-testid="cart-badge"
                      className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-950 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white"
                    >
                      {pezzi > 99 ? "99+" : pezzi}
                    </span>
                  )}
                </span>

                {/* Testo più grande e in grassetto */}
                <span
                  className={`whitespace-nowrap text-xs font-bold leading-none tracking-tight transition-colors duration-200 sm:text-sm ${
                    voce.attiva ? "text-white" : "text-yellow-400 group-hover:text-white"
                  }`}
                >
                  {voce.label}
                </span>

                {/* Sottile linea bianca sotto il testo (stato attivo) */}
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
    </div>
  );
}
