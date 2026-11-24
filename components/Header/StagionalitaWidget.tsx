"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Droplets,
  Flower2,
  Grape,
  Ham,
  Leaf,
  Milk,
  Package,
  Sprout,
  TreePine,
  X,
} from "lucide-react";
import {
  gruppiDelPeriodo,
  periodoCorrente,
  type CategoriaId,
} from "@/lib/stagionalita/calendario";
import { immagineVoce } from "@/lib/stagionalita/immagini";

/**
 * Simbolo di ogni categoria di produzione: nella finestra i prodotti citati
 * non sono solo testo, si riconoscono a colpo d'occhio.
 */
const ICONE_CATEGORIA: Record<CategoriaId, typeof Sprout> = {
  coltivazioni: Sprout,
  olivicoltura: Droplets,
  latticini: Milk,
  salumi: Ham,
  viticoltura: Grape,
  apicoltura: Flower2,
  bosco: TreePine,
  trasformazioni: Package,
};

/** Marchi ufficiali già presenti nel sito (file locali in `public/loghi`). */
const MARCHI: Record<string, { src: string; alt: string }> = {
  DOP: { src: "/loghi/dop.png", alt: "DOP" },
  IGP: { src: "/loghi/igp.png", alt: "IGP" },
  PAT: { src: "/loghi/pat.png", alt: "PAT" },
  IGT: { src: "/loghi/igt.png", alt: "IGT" },
};

/** Marchio citato nel nome del prodotto («… IGP», «… DOP»), se c'è. */
function marchioDi(nome: string) {
  const trovato = nome.match(/\b(DOP|IGP|PAT|IGT)\b/i);
  return trovato ? MARCHI[trovato[1].toUpperCase()] ?? null : null;
}

/**
 * STAGIONALITÀ — sostituisce il widget "Farmacia di turno" nella riga
 * superiore dell'header.
 *
 * Layout: riprende misure, spaziature e struttura del widget precedente
 * (contenitore relativo, pulsante `min-h-7` con icona 18–22 px e due righe
 * di testo a 11/9 px) così la riga meteo + widget resta identica.
 *
 * Finestra: stesso sistema del widget Meteo (`WeatherWidget.tsx`), cioè un
 * pannello assoluto aperto da stato locale con il pulsante e chiuso dallo
 * stesso pulsante o dalla X. Nessun portale, nessuna libreria esterna.
 */

/**
 * Icona del widget. Il file definitivo fornito dal cliente va salvato con
 * questo nome (stesso percorso, stesso formato): si sostituisce senza toccare
 * il codice e senza rebuild della grafica.
 */
const ICONA_STAGIONALITA = "/stagionalita/icona-stagionalita.png";

export default function StagionalitaWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Apri la stagionalità delle produzioni calabresi"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-left transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
      >
        {/* Il riquadro conserva l'ingombro storico (20/22 px): l'icona più
            grande (24/27 px) è centrata in posizione assoluta, quindi si vede
            di più ma non aggiunge nemmeno un pixel all'altezza della riga. */}
        <span
          aria-hidden
          className="relative inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center sm:h-[22px] sm:w-[22px]"
        >
          {/* L'immagine fornita è usata così com'è: nessun filtro, nessun ritaglio. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ICONA_STAGIONALITA}
            alt=""
            width={54}
            height={54}
            className="absolute left-1/2 top-1/2 h-[24px] w-[24px] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain sm:h-[27px] sm:w-[27px]"
          />
        </span>
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="max-w-[150px] truncate text-[11px] font-bold text-slate-900">
            Stagionalità
          </span>
          <span className="text-[9px] font-medium text-slate-600">In Calabria</span>
        </span>
      </button>

      {open && <PannelloStagionalita onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * Contenuto della finestra: calcolato al momento dell'apertura, quindi sempre
 * allineato alla data corrente. Solo testo, nessuna immagine.
 */
function PannelloStagionalita({ onClose }: { onClose: () => void }) {
  const periodo = periodoCorrente();
  const gruppi = gruppiDelPeriodo(periodo);

  return (
    <div
      role="dialog"
      aria-label="Stagionalità in Calabria"
      className="absolute right-0 top-full z-[80] mt-2 max-h-[min(70vh,26rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Stagionalità in Calabria
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">{periodo.titolo}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi la stagionalità"
          className="rounded p-1 text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {gruppi.map(({ categoria, voci }) => {
        const Icona = ICONE_CATEGORIA[categoria.id] ?? Leaf;
        return (
          <div key={categoria.id} className="mt-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              <Icona className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {categoria.titolo}
            </p>
            <ul className="mt-1 space-y-1">
              {voci.map((voce) => {
                // Immagine del singolo prodotto (clementina, arancia, cipolla…);
                // se manca si usa l'icona della categoria. Il marchio compare
                // quando il nome lo cita (DOP, IGP, PAT, IGT), anche in piccolo.
                const immagine = immagineVoce(voce.id);
                const marchio = marchioDi(voce.nome);
                return (
                  <li key={voce.id} className="flex gap-1.5 text-xs leading-5 text-slate-700">
                    {immagine ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={immagine}
                        alt=""
                        width={22}
                        height={22}
                        loading="lazy"
                        className="-ml-0.5 h-[22px] w-[22px] shrink-0 object-contain"
                        aria-hidden
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"
                      >
                        <Icona className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-900">{voce.nome}</span>
                      {marchio && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={marchio.src}
                          alt={`Marchio ${marchio.alt}`}
                          width={14}
                          height={14}
                          loading="lazy"
                          className="ml-1 inline-block h-3.5 w-3.5 translate-y-[1px] object-contain align-baseline"
                        />
                      )}
                      : {voce.sintesi}
                      {voce.zone && <span className="text-slate-500"> · {voce.zone}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <Link
        href="/stagionalita"
        onClick={onClose}
        className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
      >
        Consulta il calendario annuale <span aria-hidden>→</span>
      </Link>
      <p className="mt-2 text-[10px] leading-4 text-slate-400">
        Servizio informativo di Radici Calabria, indipendente dal catalogo commerciale.
      </p>
    </div>
  );
}
