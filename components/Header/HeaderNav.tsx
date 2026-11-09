"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Grid2X2, Home, MapPinned, Store, Tag } from "lucide-react";
import type { ComponentType } from "react";

type VoceNav = {
  label: string;
  href: string;
  icona: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  badge: string | null;
  micro: string | null;
  attiva: boolean;
  menu?: { label: string; href: string }[];
};

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
export default function HeaderNav({ overlay = false }: { overlay?: boolean } = {}) {
  const pathname = usePathname();

  // Voce "Territorio": il click apre un menù a tendina con i link della guida.
  // Il contenuto delle sezioni resta nella pagina /attrazioni, qui viene solo
  // riorganizzato: "Sapori locali" è la prima voce e "Eventi" non è più
  // elencato perché le sue schede sono già raccolte in Cultura e Sapori.
  const [menuAperto, setMenuAperto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAperto) return;
    function chiudiFuori(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuAperto(false);
      }
    }
    document.addEventListener("pointerdown", chiudiFuori);
    return () => document.removeEventListener("pointerdown", chiudiFuori);
  }, [menuAperto]);

  // La voce "Offerte" resta IDENTICA alle altre (stessa struttura, larghezza,
  // font, padding): "SALDI" è un micro-badge rosso compatto ancorato
  // all'angolo dell'icona (il simbolo), visivamente subordinato a "Offerte"
  // e che NON allarga il tasto rispetto agli altri.
  const voci: VoceNav[] = [
    { label: "Home", href: "/", icona: Home, badge: null, micro: null, attiva: pathname === "/" },
    { label: "Negozi", href: "/negozi", icona: Store, badge: null, micro: null, attiva: pathname === "/negozi" || pathname.startsWith("/negozi/") },
    { label: "Offerte", href: "/offerte", icona: Tag, badge: "SALDI", micro: null, attiva: pathname === "/offerte" || pathname.startsWith("/offerte/") },
    { label: "Categorie", href: "/categorie", icona: Grid2X2, badge: null, micro: null, attiva: pathname === "/categorie" || pathname.startsWith("/categorie/") },
    {
      label: "Territorio",
      href: "/attrazioni",
      icona: MapPinned,
      badge: null,
      micro: null,
      attiva: pathname === "/attrazioni" || pathname.startsWith("/attrazioni/"),
      menu: [
        { label: "Sapori locali", href: "/attrazioni#sapori" },
        { label: "Luoghi da vedere", href: "/attrazioni#luoghi" },
        { label: "Cultura e tradizioni", href: "/attrazioni#cultura" },
        { label: "Dintorni", href: "/attrazioni#dintorni" },
      ],
    },
  ];

  return (
    <div className={overlay ? "w-full lg:w-auto" : "w-full lg:w-auto incitta-desktop-public-nav"}>
      <nav
        aria-label="Navigazione principale"
        className={overlay ? "relative mx-auto grid w-full max-w-[680px] grid-cols-5 items-center justify-items-center py-1 md:py-2 xl:w-auto" : "relative mx-auto grid w-full max-w-[550px] grid-cols-5 items-center justify-items-center border-y border-slate-200 bg-white py-1 md:py-1 xl:w-auto"}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute top-1/2 h-8 w-px -translate-y-1/2 ${overlay ? "bg-white/50" : "bg-slate-200"}`}
            style={{ left: `calc(20% + ${i * 20}%)` }}
          />
        ))}
        {voci.map((voce) => {
          const Icona = voce.icona;
          const classiVoce =
            "incitta-public-nav-item group relative mx-1 flex min-w-0 flex-col items-center gap-1 px-1.5 py-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:mx-1.5 sm:px-2 md:py-1 lg:mx-1 lg:px-1.5";
          const contenuto = (
            <>
              <span className="incitta-public-nav-icon relative flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400">
                <Icona
                  aria-hidden
                  className="h-[22px] w-[22px] text-white transition-colors duration-200"
                />
                {voce.badge && (
                  <span
                    aria-hidden
                    className={`absolute -top-2 inline-flex items-center rounded-full bg-red-600 font-black uppercase leading-none tracking-tight text-white shadow-sm ring-2 ring-white ${voce.badge === "CV" ? "-right-1.5 px-2 py-1 text-[9px]" : "-right-2 px-1.5 py-0.5 text-[8px]"}`}
                  >
                    {voce.badge}
                  </span>
                )}
              </span>

              <span className={`incitta-public-nav-label whitespace-nowrap text-xs font-bold leading-none tracking-tight transition-colors duration-200 sm:text-sm ${overlay ? "text-white drop-shadow-sm" : "text-slate-900"}`}>
                {voce.label}
                {voce.menu && (
                  <ChevronDown
                    aria-hidden
                    className={`ml-0.5 inline h-3 w-3 align-[-1px] transition-transform duration-200 ${menuAperto ? "rotate-180" : ""}`}
                  />
                )}
              </span>

              <span
                aria-hidden
                className={`mt-0.5 h-1 w-6 rounded-full transition-opacity duration-200 ${
                  voce.attiva ? "bg-blue-600 opacity-100" : "bg-transparent opacity-0"
                }`}
              />
            </>
          );

          if (voce.menu) {
            return (
              <div
                key={voce.href}
                ref={menuRef}
                className="relative flex min-w-0 justify-center"
                onMouseLeave={() => setMenuAperto(false)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setMenuAperto(false);
                }}
              >
                <button
                  type="button"
                  aria-expanded={menuAperto}
                  aria-controls="menu-territorio"
                  onClick={() => setMenuAperto((aperto) => !aperto)}
                  className={classiVoce}
                >
                  {contenuto}
                </button>

                {menuAperto && (
                  <div
                    id="menu-territorio"
                    aria-label="Sezioni della guida Territorio"
                    className="absolute right-0 top-full z-50 mt-1 w-56 max-w-[80vw] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl"
                  >
                    {voce.menu.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMenuAperto(false)}
                        className="block px-4 py-2.5 text-sm font-bold text-slate-800 transition-colors hover:bg-yellow-50 hover:text-blue-800 focus-visible:bg-yellow-50 focus-visible:outline-none"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={voce.href}
              href={voce.href}
              aria-label={voce.label}
              aria-current={voce.attiva ? "page" : undefined}
              className={classiVoce}
            >
              {contenuto}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
