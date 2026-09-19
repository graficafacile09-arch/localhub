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
    { label: "Notizie", href: "/notizie", icona: Newspaper, badge: null, micro: "CV", attiva: pathname === "/notizie" || pathname.startsWith("/notizie/") },
  ];

  return (
    <div className="w-full lg:w-auto">
      <nav
        aria-label="Navigazione principale"
        className="relative mx-auto grid w-full max-w-[550px] grid-cols-5 items-center justify-items-center border-y border-slate-200 bg-white lg:w-auto"
      >
        {/* Separatori verticali sottili tra le voci (molto discreti, danno
            struttura senza essere protagonisti). */}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-9 w-px -translate-y-1/2 bg-slate-200 max-sm:h-8"
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
              className="group relative mx-1 flex min-w-0 flex-col items-center gap-1 px-3 py-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:mx-1.5 lg:mx-2 max-sm:px-1.5"
            >
              {/* Icona protagonista — "SALDI" (Offerte) è un micro-badge
                  compatto ancorato all'angolo del simbolo; "CV" (Notizie) è
                  un micro-elemento rosso ancora più discreto, aderente
                  all'icona. Entrambi in position:absolute: NON aumentano la
                  larghezza del tasto. */}
              <span className="relative flex h-10 w-10 items-center justify-center max-sm:h-9 max-sm:w-9">
                <Icona
                  aria-hidden
                  className={`h-6 w-6 transition-colors duration-200 max-sm:h-[22px] max-sm:w-[22px] ${
                    voce.attiva
                      ? "text-yellow-400"
                      : "text-yellow-400 group-hover:text-yellow-500"
                  }`}
                />
                {voce.badge && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 inline-flex items-center rounded-full bg-red-600 px-1 py-px text-[7px] font-black uppercase leading-none tracking-tight text-white"
                  >
                    {voce.badge}
                  </span>
                )}
                {voce.micro && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-1 text-[8px] font-black uppercase leading-none tracking-tight text-red-600"
                  >
                    {voce.micro}
                  </span>
                )}
              </span>

              {/* Testo sotto l'icona — sempre GIALLO e identico per tutte le
                  voci ("Notizie" come le altre: nessun badge nel testo,
                  larghezza coerente). */}
              <span
                className={`whitespace-nowrap text-xs font-bold leading-none tracking-tight transition-colors duration-200 sm:text-sm ${
                  voce.attiva
                    ? "text-yellow-500"
                    : "text-yellow-500 group-hover:text-yellow-600"
                }`}
              >
                {voce.label}
              </span>

              {/* Indicatore attivo: semplice linea orizzontale sottile sotto
                  il testo (blu, come nel mockup) */}
              <span
                aria-hidden
                className={`mt-1 h-1 w-8 rounded-full transition-opacity duration-200 max-sm:w-6 ${
                  voce.attiva ? "bg-yellow-400 opacity-100" : "bg-transparent opacity-0"
                }`}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
