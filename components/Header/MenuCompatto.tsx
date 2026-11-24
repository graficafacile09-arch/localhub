"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Sprout, X } from "lucide-react";
import LanguageToggle from "./LanguageToggle";
import { VOCI_NAV, voceAttiva } from "./voci-nav";

/**
 * Menu compatto per smartphone e tablet: pulsante chiaramente riconoscibile
 * che apre l'elenco delle sezioni principali, la ricerca e la stagionalità.
 * Si chiude alla selezione di una voce, con la X, con Esc, toccando fuori o
 * quando cambia la rotta.
 */
export default function MenuCompatto() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const contenitore = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function chiudiConClickEsterno(event: MouseEvent) {
      if (contenitore.current && !contenitore.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function chiudiConEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", chiudiConClickEsterno);
    document.addEventListener("keydown", chiudiConEsc);
    return () => {
      document.removeEventListener("mousedown", chiudiConClickEsterno);
      document.removeEventListener("keydown", chiudiConEsc);
    };
  }, [open]);

  const chiudi = () => setOpen(false);

  return (
    <div className="relative lg:hidden" ref={contenitore}>
      <button
        type="button"
        onClick={() => setOpen((valore) => !valore)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="menu-compatto-pannello"
        aria-label={open ? "Chiudi il menu" : "Apri il menu"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-soft bg-white text-forest transition-colors hover:border-gold hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={chiudi}
            className="fixed inset-x-0 bottom-0 top-17 z-40 bg-slate-950/20"
          />
          <div
            id="menu-compatto-pannello"
            role="menu"
            aria-label="Sezioni del sito"
            className="fixed inset-x-0 top-17 z-50 max-h-[calc(100dvh-4.25rem)] overflow-y-auto border-b border-slate-200 bg-white shadow-xl"
          >
            <div className="mx-auto w-full max-w-[1500px] px-3 py-3">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Sezioni
              </p>
              <div className="flex flex-col">
                {VOCI_NAV.map((voce) => {
                  const attiva = voceAttiva(pathname, voce.href);
                  return (
                    <Link
                      key={voce.href}
                      href={voce.href}
                      role="menuitem"
                      onClick={chiudi}
                      aria-current={attiva ? "page" : undefined}
                      className={`rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                        attiva
                          ? "bg-forest text-white"
                          : "text-forest hover:bg-cream hover:text-forest-deep"
                      }`}
                    >
                      {voce.label}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-2 border-t border-slate-100 pt-2">
                <Link
                  href="/ricerca"
                  role="menuitem"
                  onClick={chiudi}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-cream hover:text-forest"
                >
                  <Search className="h-4 w-4 shrink-0" aria-hidden />
                  Cerca prodotti e attività
                </Link>
                <Link
                  href="/stagionalita"
                  role="menuitem"
                  onClick={chiudi}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-cream hover:text-forest"
                >
                  <Sprout className="h-4 w-4 shrink-0" aria-hidden />
                  Stagionalità
                </Link>
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-3 pt-3">
                <span className="text-xs font-semibold text-slate-500">Lingua</span>
                <LanguageToggle />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
