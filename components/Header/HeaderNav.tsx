"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Home, ShoppingCart, Store } from "lucide-react";
import type { ComponentType } from "react";
import { useCarrello } from "@/lib/carrello/CartContext";

/**
 * Navigazione pubblica — UNICA fonte delle voci Home/Negozi/Categorie/Carrello.
 *
 * Concept grafico (definitivo): "icona protagonista sopra + testo sotto".
 * Ogni voce è un elemento visivo (icona grande + testo piccolo e leggero),
 * NON un pulsante/pill: nessun rettangolo, bordo o sfondo pieno.
 *
 * - Stato normale: icona e testo blu scuro (colore principale), sfondo
 *   trasparente.
 * - Stato attivo (via usePathname): icona gialla (stesso giallo CTA del
 *   sito), testo giallo, piccolo highlight circolare molto leggero dietro
 *   l'icona e sottile linea gialla sotto il testo.
 * - Hover (desktop): icona e testo virano gradualmente al giallo, senza
 *   spostare gli altri elementi.
 * - Carrello: stesso trattamento grafico; il badge numerico resta vicino
 *   all'icona senza rompere l'allineamento.
 * - Mobile: le quattro voci restano SEMPRE visibili e distribuite
 *   orizzontalmente (nessun hamburger), con icona sopra e testo sotto.
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
      className="grid w-full grid-cols-4 items-center justify-items-center gap-x-2 lg:flex lg:w-auto lg:gap-1.5"
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
            className="group flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 max-sm:px-1 max-sm:py-1"
          >
            {/* Icona protagonista */}
            <span
              className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 max-sm:h-8 max-sm:w-8 ${
                voce.attiva ? "bg-yellow-100/70" : "group-hover:bg-yellow-100/50"
              }`}
            >
              <Icona
                aria-hidden
                className={`h-5 w-5 transition-colors duration-200 max-sm:h-[18px] max-sm:w-[18px] ${
                  voce.attiva ? "text-yellow-500" : "text-blue-900 group-hover:text-yellow-500"
                }`}
              />
              {isCart && pezzi > 0 && (
                <span
                  data-testid="cart-badge"
                  className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[9px] font-black leading-none text-blue-900 ring-2 ring-white"
                >
                  {pezzi > 99 ? "99+" : pezzi}
                </span>
              )}
            </span>

            {/* Testo piccolo e leggero */}
            <span
              className={`whitespace-nowrap text-[11px] font-semibold leading-none transition-colors duration-200 sm:text-xs ${
                voce.attiva ? "text-yellow-500" : "text-blue-900 group-hover:text-yellow-500"
              }`}
            >
              {voce.label}
            </span>

            {/* Sottile linea gialla sotto il testo (stato attivo) */}
            <span
              aria-hidden
              className={`mt-1 h-0.5 w-6 rounded-full bg-yellow-400 transition-opacity duration-200 max-sm:w-4 ${
                voce.attiva ? "opacity-100" : "opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
