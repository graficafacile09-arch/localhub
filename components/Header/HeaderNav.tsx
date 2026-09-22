"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, Home, Newspaper, Store, Tag } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Navigazione pubblica — UNICA fonte delle voci Home/Negozi/Offerte/Categorie.
 *
 * La voce "Carrello" NON è più qui: è rappresentata dalla piccola icona
 * compatta accanto al logo nell'header (vedi HeaderCartIcon), con lo stesso
 * badge numerico della vecchia rappresentazione.
 *
 * "OFFERTE" è la voce dedicata alle promozioni (→ /offerte), posizionata
 * tra Negozi e Categorie. Stesso identico trattamento grafico delle altre
 * voci: nessuna differenza di stile, altezza, tipografia o hover.
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
 *   (Il Carrello ora vive come piccola icona accanto al logo.)
 * - Mobile: le voci restano SEMPRE visibili e distribuite orizzontalmente,
 *   con icona sopra e testo sotto, senza overflow.
 *
 * Spaziatura: i tasti hanno margini orizzontali leggeri (mx-1, più ampi su
 * sm/lg) per restare ariosi senza allargare la barra; i separatori verticali
 * restano allineati ai bordi delle celle della griglia.
 */
export default function HeaderNav() {
  const pathname = usePathname();

  // La voce "Offerte" resta IDENTICA alle altre (stessa struttura, larghezza,
  // font, padding): "SALDI" è un micro-badge rosso compatto ancorato
  // all'angolo dell'icona (il simbolo), visivamente subordinato a "Offerte"
  // e che NON allarga il tasto rispetto agli altri.
  const voci = [
    { label: "Home", href: "/", icona: Home, badge: null, micro: null, attiva: pathname === "/" },
    { label: "Negozi", href: "/negozi", icona: Store, badge: null, micro: null, attiva: pathname === "/negozi" || pathname.startsWith("/negozi/") },
    { label: "Offerte", href: "/offerte", icona: Tag, badge: "SALDI", micro: null, attiva: pathname === "/offerte" || pathname.startsWith("/offerte/") },
    { label: "Categorie", href: "/categorie", icona: Grid2X2, badge: null, micro: null, attiva: pathname === "/categorie" || pathname.startsWith("/categorie/") },
    { label: "Notizie", href: "/notizie", icona: Newspaper, badge: "CV", micro: null, attiva: pathname === "/notizie" || pathname.startsWith("/notizie/") },
  ];

  return (
    <div className="w-full lg:w-auto">
      <nav
        aria-label="Navigazione principale"
        className="relative mx-auto grid w-full max-w-[550px] grid-cols-5 items-center justify-items-center border-y border-slate-200 bg-white py-1 md:py-1 xl:w-auto"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-8 w-px -translate-y-1/2 bg-slate-200"
            style={{ left: `calc(20% + ${i * 20}%)` }}
          />
        ))}
        {voci.map((voce) => {
          const Icona = voce.icona as ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
          return (
            <Link
              key={voce.href}
              href={voce.href}
              aria-label={voce.label}
              aria-current={voce.attiva ? "page" : undefined}
              className="group relative mx-1 flex min-w-0 flex-col items-center gap-1 px-1.5 py-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:mx-1.5 sm:px-2 md:py-1 lg:mx-1 lg:px-1.5"
            >
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400">
                <Icona
                  aria-hidden
                  className="h-[22px] w-[22px] text-white transition-colors duration-200"
                />
                {voce.badge && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 inline-flex items-center rounded-full bg-red-600 px-1 py-px text-[7px] font-black uppercase leading-none tracking-tight text-white"
                  >
                    {voce.badge}
                  </span>
                )}
              </span>

              <span className="whitespace-nowrap text-xs font-bold leading-none tracking-tight text-slate-900 transition-colors duration-200 sm:text-sm">
                {voce.label}
              </span>

              <span
                aria-hidden
                className={`mt-0.5 h-1 w-6 rounded-full transition-opacity duration-200 ${
                  voce.attiva ? "bg-blue-600 opacity-100" : "bg-transparent opacity-0"
                }`}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
