"use client";

import { useEffect, useRef, useState } from "react";
import { useLingua } from "@/components/i18n/LanguageProvider";
import type { Lingua } from "@/lib/i18n/dictionary";

/**
 * Selettore di lingua: la bandierina mostra la lingua attiva e apre una
 * tendina con italiano, inglese, francese, spagnolo e tedesco. Resta in miniatura
 * (24 px con bandiera 20 px) per non spostare account e carrello.
 */

type Voce = { codice: Lingua; nome: string; descrizione: string };

const LINGUE: Voce[] = [
  { codice: "it", nome: "Italiano", descrizione: "Bandiera italiana" },
  { codice: "en", nome: "English", descrizione: "Bandiera del Regno Unito" },
  { codice: "fr", nome: "Français", descrizione: "Bandiera francese" },
  { codice: "es", nome: "Español", descrizione: "Bandiera spagnola" },
  { codice: "de", nome: "Deutsch", descrizione: "Bandiera tedesca" },
];

/** Bandiera del Regno Unito (Union Jack semplificato, tagliato a quadrato). */
function BandieraRegnoUnito() {
  return (
    <svg
      viewBox="0 0 60 40"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#ffffff" strokeWidth="9" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#c8102e" strokeWidth="4" />
      <path d="M30 0 V40 M0 20 H60" stroke="#ffffff" strokeWidth="13" />
      <path d="M30 0 V40 M0 20 H60" stroke="#c8102e" strokeWidth="7" />
    </svg>
  );
}

/** Bandiera italiana (tricolore verticale). */
function BandieraItalia() {
  return (
    <svg
      viewBox="0 0 60 40"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="20" height="40" fill="#009246" />
      <rect x="20" width="20" height="40" fill="#ffffff" />
      <rect x="40" width="20" height="40" fill="#ce2b37" />
    </svg>
  );
}

/** Bandiera francese (tricolore verticale). */
function BandieraFrancia() {
  return (
    <svg
      viewBox="0 0 60 40"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="20" height="40" fill="#0055a4" />
      <rect x="20" width="20" height="40" fill="#ffffff" />
      <rect x="40" width="20" height="40" fill="#ef4135" />
    </svg>
  );
}

/** Bandiera spagnola (roja y gualda con stemma stilizzato). */
function BandieraSpagna() {
  return (
    <svg
      viewBox="0 0 60 40"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="60" height="40" fill="#aa151b" />
      <rect y="10" width="60" height="20" fill="#f1bf00" />
      <rect x="13" y="15" width="7" height="10" rx="1" fill="#aa151b" opacity="0.85" />
    </svg>
  );
}

/** Bandiera tedesca (tricolore orizzontale nero, rosso e oro). */
function BandieraGermania() {
  return (
    <svg
      viewBox="0 0 60 40"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="60" height="40" fill="#000000" />
      <rect y="13.33" width="60" height="13.34" fill="#dd0000" />
      <rect y="26.67" width="60" height="13.33" fill="#ffce00" />
    </svg>
  );
}

function Bandiera({ codice }: { codice: Lingua }) {
  if (codice === "it") return <BandieraItalia />;
  if (codice === "fr") return <BandieraFrancia />;
  if (codice === "es") return <BandieraSpagna />;
  if (codice === "de") return <BandieraGermania />;
  return <BandieraRegnoUnito />;
}

export default function LanguageToggle() {
  const { lingua, cambiaLingua } = useLingua();
  const [aperto, setAperto] = useState(false);
  const contenitore = useRef<HTMLDivElement | null>(null);
  const attiva = LINGUE.find((voce) => voce.codice === lingua) ?? LINGUE[0];

  // Chiusura con tocco fuori o con Esc: la tendina non resta aperta per caso.
  useEffect(() => {
    if (!aperto) return undefined;

    const suTocco = (evento: PointerEvent) => {
      if (!contenitore.current?.contains(evento.target as Node)) setAperto(false);
    };
    const suTasto = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAperto(false);
    };

    document.addEventListener("pointerdown", suTocco);
    document.addEventListener("keydown", suTasto);
    return () => {
      document.removeEventListener("pointerdown", suTocco);
      document.removeEventListener("keydown", suTasto);
    };
  }, [aperto]);

  const scegli = (codice: Lingua) => {
    cambiaLingua(codice);
    setAperto(false);
  };

  return (
    /* data-no-translate: i nomi delle lingue restano nella lingua originale. */
    <div ref={contenitore} className="relative" data-no-translate>
      <button
        type="button"
        onClick={() => setAperto((corrente) => !corrente)}
        aria-label={`Lingua: ${attiva.nome}`}
        title={`Lingua: ${attiva.nome}`}
        aria-haspopup="menu"
        aria-expanded={aperto}
        data-testid="cambia-lingua"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white p-0.5 ring-1 ring-gold-soft transition hover:ring-2 hover:ring-gold active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
      >
        <span className="block h-5 w-5 overflow-hidden rounded-full ring-1 ring-black/10">
          <Bandiera codice={lingua} />
        </span>
      </button>

      {aperto ? (
        <div
          role="menu"
          aria-label="Lingua"
          className="absolute right-0 top-full z-[70] mt-1.5 w-44 overflow-hidden rounded-xl border border-[#e5ded0] bg-white p-1 shadow-[0_16px_40px_-16px_rgb(27_54_36_/_0.45)]"
        >
          {LINGUE.map((voce) => {
            const selezionata = voce.codice === lingua;
            return (
              <button
                key={voce.codice}
                type="button"
                role="menuitemradio"
                aria-checked={selezionata}
                onClick={() => scegli(voce.codice)}
                data-testid={`lingua-${voce.codice}`}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${
                  selezionata
                    ? "bg-[#f4efe4] font-bold text-forest-deep"
                    : "font-semibold text-slate-700 hover:bg-[#f8f5ee] hover:text-forest"
                }`}
              >
                <span className="block h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10">
                  <Bandiera codice={voce.codice} />
                </span>
                <span className="min-w-0 truncate">{voce.nome}</span>
                <span className="sr-only">{voce.descrizione}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
