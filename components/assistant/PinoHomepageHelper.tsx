"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { PINO_ASSET, PINO_ASSET_H, PINO_ASSET_W } from "./PinoSprite";
import { isPinoTransactionalRoute } from "./pino-route";

/**
 * Asset della homepage: lo stato neutro di Pino, già scontornato e ad alta
 * risoluzione (378x560). Rigenerabile con `python scripts/gen-pino-assets.py`.
 */
const PINO_HOME_SRC = PINO_ASSET.neutral;
const PINO_HOME_W = PINO_ASSET_W;
const PINO_HOME_H = PINO_ASSET_H;
const PINO_HOME_HEIGHT = 120; // px a schermo: leggermente più grande di prima (erano 92)

const PINO_DISMISSED_KEY = "incitta_pino_home_dismissed_v1";
/** Posizione salvata del widget chiuso (offset dal suo ancoraggio in basso a destra). */
const PINO_POSITION_KEY = "incitta_pino_position_v1";
/** Sotto questa distanza un pointerdown+pointerup è un tap, non un drag. */
const SOGLIA_DRAG = 5;

type Posizione = { x: number; y: number };

const POSIZIONE_DEFAULT: Posizione = { x: 0, y: 0 };

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function trasla(pos: Posizione): string {
  return `translate3d(${pos.x}px, ${pos.y}px, 0)`;
}

/** Legge la posizione salvata. Tollerante: storage assente o danneggiato = default. */
function leggiPosizioneSalvata(): Posizione | null {
  try {
    const grezzo = window.localStorage.getItem(PINO_POSITION_KEY);
    if (!grezzo) return null;
    const valore = JSON.parse(grezzo) as Partial<Posizione>;
    if (typeof valore?.x !== "number" || typeof valore?.y !== "number") return null;
    if (!Number.isFinite(valore.x) || !Number.isFinite(valore.y)) return null;
    return { x: valore.x, y: valore.y };
  } catch {
    return null;
  }
}

/** Salva la posizione così che sopravviva a ricariche e nuove sessioni. */
function salvaPosizione(pos: Posizione): void {
  try {
    window.localStorage.setItem(PINO_POSITION_KEY, JSON.stringify(pos));
  } catch {
    // Storage non disponibile: il widget resta comunque spostabile in questa sessione.
  }
}

type Riquadro = { left: number; top: number; width: number; height: number };

/**
 * Riquadro VISIVO del widget: unione del contenitore e di tutti i suoi
 * discendenti. Su desktop la sagoma di Pino è scalata 2x (`md:scale-[2]`) e
 * sporge dal box del contenitore: senza l'unione il clamp lascerebbe sbordare
 * proprio la parte visibile.
 */
function riquadroVisivo(root: HTMLElement): Riquadro {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const elemento of [root, ...Array.from(root.querySelectorAll("*"))]) {
    const r = elemento.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    const r = root.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Limiti di traslazione che tengono l'intero widget dentro la viewport.
 *
 * Il widget è ancorato con `position: fixed bottom-* right-*`: la posizione è un
 * offset (`translate3d`) rispetto a quell'ancoraggio. Togliendo dal riquadro
 * visivo attuale l'offset già applicato si ottiene il riquadro "base"; i limiti
 * sono gli offset che portano quel riquadro a restare nei bordi dello schermo.
 */
function limitiViewport(elemento: HTMLElement, applicata: Posizione) {
  const riquadro = riquadroVisivo(elemento);
  const baseLeft = riquadro.left - applicata.x;
  const baseTop = riquadro.top - applicata.y;

  return {
    minX: -baseLeft,
    maxX: window.innerWidth - (baseLeft + riquadro.width),
    minY: -baseTop,
    maxY: window.innerHeight - (baseTop + riquadro.height),
  };
}

type StatoDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  moved: boolean;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/**
 * Trascinamento del widget chiuso, condiviso da Pino flottante e dalla sua
 * versione ridotta ("richiama Pino").
 *
 * - mouse (desktop) e touch (mobile): un unico percorso basato sui Pointer Events;
 * - fluido: la posizione è scritta direttamente sull'elemento (nessun re-render
 *   per ogni pointermove) e gli aggiornamenti sono raggruppati su
 *   requestAnimationFrame, quindi il movimento resta a filo del frame;
 * - non esce dallo schermo: i limiti sono misurati all'inizio del drag e ogni
 *   spostamento viene clampato dentro la viewport; il clamp viene riapplicato
 *   al mount, al resize e alla rotazione;
 * - tap vs drag: sotto la soglia di 5px è un tap → `onTap` (apre la chat o
 *   richiama Pino), sopra è un drag e il click successivo viene soppresso;
 * - la posizione è ripristinata da localStorage al primo mount e risalvata a
 *   ogni drag concluso (anche se il gesto viene interrotto dal browser).
 */
function usePinoTrascinabile(onTap: () => void) {
  const elementRef = useRef<HTMLElement | null>(null);
  const posizioneRef = useRef<Posizione>(POSIZIONE_DEFAULT);
  const ripristinataRef = useRef(false);
  const dragRef = useRef<StatoDrag | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendenteRef = useRef<Posizione | null>(null);
  /** `true` se l'ultima interazione è stato un drag: serve a sopprimere il click. */
  const wasDraggedRef = useRef(false);
  const onTapRef = useRef(onTap);

  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  /** Scrive la posizione sull'elemento: nessuno stato React da sincronizzare. */
  const applica = useCallback((pos: Posizione) => {
    posizioneRef.current = pos;
    const elemento = elementRef.current;
    if (elemento) elemento.style.transform = trasla(pos);
  }, []);

  const commit = useCallback(
    (next: Posizione) => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      pendenteRef.current = null;
      applica(next);
    },
    [applica]
  );

  /** Aggiornamento raggruppato a un frame: movimento fluido anche su mobile. */
  const schedule = useCallback(
    (next: Posizione) => {
      pendenteRef.current = next;
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const valore = pendenteRef.current;
        if (valore) applica(valore);
      });
    },
    [applica]
  );

  /**
   * Riporta il widget dentro la viewport se la posizione corrente lo fa
   * sbordare: succede al mount (la sagoma desktop 2x sporge dal suo ancoraggio)
   * e ogni volta che la finestra cambia dimensione.
   */
  const clampAllaViewport = useCallback(() => {
    const elemento = elementRef.current;
    if (!elemento || dragRef.current) return;

    const attuale = posizioneRef.current;
    const limiti = limitiViewport(elemento, attuale);
    const next = {
      x: clamp(attuale.x, limiti.minX, limiti.maxX),
      y: clamp(attuale.y, limiti.minY, limiti.maxY),
    };

    if (next.x !== attuale.x || next.y !== attuale.y) {
      commit(next);
      salvaPosizione(next);
    }
  }, [commit]);

  /**
   * Callback ref: funziona sia sul <div> flottante sia sul <button> ridotto e,
   * al primo mount, ripristina la posizione salvata prima del paint (nessun
   * salto visibile). Il componente resta montato quando Pino è nascosto nelle
   * rotte transazionali, quindi al ritorno la posizione è già in memoria.
   */
  const attachRef = useCallback(
    (node: HTMLElement | null) => {
      elementRef.current = node;
      if (!node) return;

      if (!ripristinataRef.current) {
        const salvata = leggiPosizioneSalvata();
        if (salvata) posizioneRef.current = salvata;
        ripristinataRef.current = true;
      }

      node.style.transform = trasla(posizioneRef.current);
    },
    []
  );

  // Mount, resize e rotazione: il widget non deve mai sbordare dallo schermo.
  useEffect(() => {
    clampAllaViewport();

    window.addEventListener("resize", clampAllaViewport);
    window.addEventListener("orientationchange", clampAllaViewport);
    return () => {
      window.removeEventListener("resize", clampAllaViewport);
      window.removeEventListener("orientationchange", clampAllaViewport);
    };
  }, [clampAllaViewport]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const elemento = elementRef.current;
    if (!elemento) return;

    const attuale = posizioneRef.current;
    const limiti = limitiViewport(elemento, attuale);

    wasDraggedRef.current = false;
    try {
      elemento.setPointerCapture(event.pointerId);
    } catch {
      // Senza pointer capture il drag resta comunque funzionante.
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: attuale.x,
      baseY: attuale.y,
      moved: false,
      ...limiti,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.abs(dx) < SOGLIA_DRAG && Math.abs(dy) < SOGLIA_DRAG) return;
      drag.moved = true;
      wasDraggedRef.current = true;
    }

    schedule({
      x: clamp(drag.baseX + dx, drag.minX, drag.maxX),
      y: clamp(drag.baseY + dy, drag.minY, drag.maxY),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    const elemento = elementRef.current;
    if (elemento) {
      try {
        elemento.releasePointerCapture(event.pointerId);
      } catch {
        // Nulla da rilasciare.
      }
    }

    if (!drag.moved) {
      onTapRef.current();
      return;
    }

    // Materializza l'ultimo movimento in sospeso e salvalo per le prossime sessioni.
    const finale = pendenteRef.current ?? posizioneRef.current;
    commit(finale);
    salvaPosizione(finale);
  };

  // Il browser può interrompere un gesto touch (gesture di sistema, perdita
  // del pointer): non buttiamo via lo spostamento già fatto, lo consolidiamo.
  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId || !drag.moved) return;

    const finale = pendenteRef.current ?? posizioneRef.current;
    commit(finale);
    salvaPosizione(finale);
  };

  const dragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };

  /** Il click nativo che segue un drag va ignorato (altrimenti aprirebbe la chat). */
  const clickSopraggio = useCallback(() => wasDraggedRef.current, []);

  return { attachRef, dragHandlers, clickSopraggio };
}

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
 * Il personaggio è trascinabile (mouse e touch) sia nella versione flottante
 * sia in quella ridotta: la posizione resta dentro la viewport e viene
 * ricordata tra sessioni. Nei flussi transazionali (carrello, checkout,
 * pagamento, conferma ordine) il widget è nascosto e ricompare appena si esce
 * da quelle rotte, senza perdere conversazione, stato o posizione.
 */
export default function PinoHomepageHelper() {
  const pathname = usePathname();
  const [chiuso, setChiuso] = useState(false);

  useEffect(() => {
    try {
      setChiuso(window.sessionStorage.getItem(PINO_DISMISSED_KEY) === "1");
    } catch {
      // Se sessionStorage non è disponibile, manteniamo il comportamento normale.
    }
  }, []);

  const openAssistant = useCallback(() => {
    window.dispatchEvent(new Event("assistant:open"));
  }, []);

  const richiama = useCallback(() => {
    try {
      window.sessionStorage.removeItem(PINO_DISMISSED_KEY);
    } catch {
      // Il richiamo resta comunque disponibile.
    }
    setChiuso(false);
  }, []);

  const chiudiPresentazione = useCallback(() => {
    try {
      window.sessionStorage.setItem(PINO_DISMISSED_KEY, "1");
    } catch {
      // Chiusura comunque valida per questa visualizzazione.
    }
    setChiuso(true);
  }, []);

  // TASK 1 — il widget chiuso è trascinabile in entrambe le sue forme:
  // tap = apri la chat (o richiama Pino), drag = spostalo.
  const { attachRef, dragHandlers, clickSopraggio } = usePinoTrascinabile(() => {
    if (chiuso) richiama();
    else openAssistant();
  });

  // TASK 2 — Pino sparisce nei flussi transazionali. Il componente resta montato
  // (stato e posizione intatti): semplicemente non disegna nulla, quindi al
  // ritorno sulla homepage ricompare nella posizione salvata.
  if (isPinoTransactionalRoute(pathname)) return null;

  // Dopo la X Pino resta chiuso per tutta la sessione, ma rimane sempre richiamabile.
  if (chiuso) {
    return (
      <button
        ref={attachRef}
        type="button"
        {...dragHandlers}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            richiama();
          }
        }}
        data-testid="pino-richiama"
        // Niente variazioni di scala su hover/press: il riquadro visivo deve
        // restare misurabile con esattezza, altrimenti il clamp allo schermo
        // verrebbe calcolato su una dimensione diversa da quella reale.
        className="fixed bottom-4 right-4 z-[90] flex h-12 min-w-[64px] cursor-grab touch-none select-none items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-xl shadow-slate-900/15 transition hover:border-blue-300 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 active:cursor-grabbing active:brightness-95"
        aria-label="Richiama Pino"
        title="Richiama Pino"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50">
          <img
            src={PINO_HOME_SRC}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            width={PINO_HOME_W}
            height={PINO_HOME_H}
            className="block h-full w-auto object-contain"
          />
        </span>
        <span className="pr-1 text-[11px] font-bold text-blue-800">Pino</span>
      </button>
    );
  }

  return (
    <div
      ref={attachRef}
      {...dragHandlers}
      data-testid="pino-widget"
      className="fixed bottom-5 right-5 z-[60] touch-none select-none will-change-transform"
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
              chiudiPresentazione();
            }}
            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/30 transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Chiudi Pino"
            title="Chiudi Pino"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
          </button>
          {/* Testo cliccabile: apre l'assistente (comportamento invariato).
              Se l'utente ha trascinato partendo da qui, il click viene ignorato. */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (clickSopraggio()) return;
              openAssistant();
            }}
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
          data-testid="pino-floating"
          // Su desktop la sagoma è scalata 2x (`md:scale-[2]`): un hover con
          // scala diverse sovrascriverebbe il 2x (Pino si rimpicciolirebbe al
          // passaggio del mouse) e falserebbe il clamp allo schermo.
          className="cursor-grab rounded-full outline-none transition hover:brightness-105 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-yellow-300 md:scale-[2] md:origin-bottom"
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
