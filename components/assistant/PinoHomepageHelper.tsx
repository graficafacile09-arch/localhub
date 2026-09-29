"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { PINO_ASSET, PINO_ASSET_H, PINO_ASSET_W } from "./PinoSprite";

/**
 * Asset della homepage: lo stato neutro di Pino, già scontornato e ad alta
 * risoluzione (378x560). Rigenerabile con `python scripts/gen-pino-assets.py`.
 */
const PINO_HOME_SRC = PINO_ASSET.neutral;
const PINO_HOME_W = PINO_ASSET_W;
const PINO_HOME_H = PINO_ASSET_H;
const PINO_HOME_HEIGHT = 120; // px a schermo: leggermente più grande di prima (erano 92)
const PINO_DISMISSED_KEY = "incitta_pino_home_dismissed_v1";

/**
 * Pino flottante con il suo messaggio di presentazione.
 *
 * Il fumetto è una card compatta con lo STESSO gradiente del pannello di Pino
 * (from-cyan-700 to-sky-700): sembra parte dell'interfaccia del personaggio,
 * non un box estraneo. Sta adiacente al personaggio (gap minimo) e ha una coda
 * che punta verso di lui, così fumetto + Pino si leggono come un unico blocco.
 *
 * La X chiude completamente la presentazione (il personaggio flottante
 * sparisce): l'assistente resta apribile dagli altri punti di ingresso già
 * esistenti (header, homepage, /ricerca). È nell'angolo in alto a SINISTRA
 * perché il personaggio sta sulla destra: su desktop la sua sagoma (scalata
 * 2x) copre la parte destra del fumetto, quindi l'angolo destro non è un
 * bersaglio cliccabile. Per lo stesso motivo il testo ha un padding destro
 * riservato su desktop: nessuna parola finisce sotto Pino.
 *
 * Il personaggio è leggermente più grande di prima (e con le proporzioni reali
 * del disegno): la nitidezza arriva dall'asset ad alta risoluzione, non da un
 * ingrandimento del browser.
 */
export default function PinoHomepageHelper() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [chiuso, setChiuso] = useState(false);

  useEffect(() => {
    try {
      setChiuso(window.sessionStorage.getItem(PINO_DISMISSED_KEY) === "1");
    } catch {
      // Se sessionStorage non è disponibile, manteniamo il comportamento normale.
    }
  }, []);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);

  const openAssistant = () => window.dispatchEvent(new Event("assistant:open"));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, baseX: position.x, baseY: position.y, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
    setPosition({
      x: Math.max(-window.innerWidth + 170, Math.min(window.innerWidth - 30, drag.baseX + dx)),
      y: Math.max(-window.innerHeight + 170, Math.min(window.innerHeight - 30, drag.baseY + dy)),
    });
  };

  const onPointerUp = () => {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (!moved) openAssistant();
  };

  // Chiusura completa della presentazione: né fumetto né personaggio flottante.
  if (chiuso) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[60] touch-none select-none"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
      aria-label="Pino, assistente di InCittà"
    >
      {/* gap-0.5: il fumetto è adiacente a Pino → un unico blocco visivo.
          md:pr-6 riserva il bordo destro dove si sovrappone la sagoma di Pino. */}
      <div className="flex items-end gap-0.5">
        <div className="relative mb-4 flex max-w-[172px] items-start rounded-2xl bg-gradient-to-br from-cyan-700 to-sky-700 py-2 pl-2.5 pr-1.5 text-white shadow-[0_10px_26px_-12px_rgba(8,51,68,0.55)] sm:max-w-[188px] md:mb-14 md:pr-7">
          {/* X: chiude completamente la presentazione. Stop della propagazione
              su pointerdown/pointerup per non avviare il drag del personaggio
              (l'onPointerUp del contenitore aprirebbe l'assistente). */}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              try {
                window.sessionStorage.setItem(PINO_DISMISSED_KEY, "1");
              } catch {
                // Chiusura comunque valida per questa visualizzazione.
              }
              setChiuso(true);
            }}
            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/30 transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Chiudi Pino"
            title="Chiudi Pino"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
          </button>
          {/* Testo cliccabile: apre l'assistente (comportamento invariato) */}
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); openAssistant(); }}
            className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Apri l'assistente AI di InCittà"
          >
            <span className="block text-[12px] font-bold leading-[16px] tracking-tight text-white sm:text-[13px] sm:leading-[17px]">
              Ciao sono Pino, chatta con me.
            </span>
          </button>
          {/* Coda del fumetto verso Pino (lato destro, all'altezza del busto) */}
          <span
            aria-hidden="true"
            className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 rounded-[2px] bg-sky-700"
          />
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Apri l'assistente AI"
          className="cursor-grab rounded-full outline-none transition hover:scale-105 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-yellow-300 md:scale-[2] md:origin-bottom"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openAssistant();
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PINO_HOME_SRC}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            width={PINO_HOME_W}
            height={PINO_HOME_H}
            // w-auto: la larghezza segue le proporzioni reali del disegno,
            // quindi nessuna deformazione orizzontale o verticale.
            className="block w-auto drop-shadow-[0_7px_10px_rgba(15,23,42,0.2)]"
            style={{ height: `${PINO_HOME_HEIGHT}px`, imageRendering: "auto" }}
          />
        </div>
      </div>
      <span className="sr-only">
        Trascina Pino per spostarlo oppure clicca per aprire la ricerca AI. Usa la X per chiudere la presentazione.
      </span>
    </div>
  );
}
