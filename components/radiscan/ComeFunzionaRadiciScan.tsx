"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";

const PASSI = [
  "Fotografa l'etichetta",
  "L'AI legge marchio DOP/IGP/IGT, biologico (Eurofoglia, BIO, codice IT-BIO) e stabilimento",
  "Scopri filiera e disciplinare",
];

/**
 * Pillola "Come funziona?" accanto al titolo RadiciScan.
 *
 * Il modale è montato in un portale su document.body: l'intestazione usa
 * un'animazione con transform, che altrimenti renderebbe l'overlay fixed
 * relativo alla testata invece che alla finestra. Così l'apertura non
 * cambia di un pixel l'altezza dell'header e i tasti di caricamento
 * restano dove sono.
 */
export default function ComeFunzionaRadiciScan() {
  const [aperto, setAperto] = useState(false);
  const chiudiRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aperto) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAperto(false);
    }

    document.addEventListener("keydown", onKeyDown);
    const overflowPrecedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    chiudiRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowPrecedente;
    };
  }, [aperto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        aria-haspopup="dialog"
        aria-expanded={aperto}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#d6cab2] bg-white px-2 py-1 text-[9px] font-bold tracking-[0.02em] text-[#24462f] transition hover:border-[#24462f] hover:bg-[#f4efe4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24462f] md:text-[10px]"
      >
        <HelpCircle className="h-3 w-3" aria-hidden />
        Come funziona?
      </button>

      {aperto
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0d1a12]/50 p-4 backdrop-blur-sm sm:items-center"
              onClick={(event) => {
                if (event.target === event.currentTarget) setAperto(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="radiscan-come-funziona"
                className="w-full max-w-sm rounded-2xl border border-[#e5ded0] bg-[#fffdf7] p-4 shadow-[0_30px_60px_-30px_rgba(13,26,18,0.85)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p
                    id="radiscan-come-funziona"
                    className="text-sm font-black text-[#1b3624]"
                  >
                    Come funziona RadiciScan
                  </p>
                  <button
                    ref={chiudiRef}
                    type="button"
                    onClick={() => setAperto(false)}
                    aria-label="Chiudi"
                    className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#6b6459] transition hover:bg-[#f4efe4] hover:text-[#1b3624]"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <ol className="mt-3 space-y-2">
                  {PASSI.map((passo, indice) => (
                    <li key={passo} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#24462f] text-[10px] font-bold text-white">
                        {indice + 1}
                      </span>
                      <span className="text-[13px] leading-5 text-[#3f3a33]">
                        {passo}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
