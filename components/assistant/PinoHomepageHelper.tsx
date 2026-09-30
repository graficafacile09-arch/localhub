"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** Limiti di traslazione che tengono il widget dentro la viewport. */
type Limiti = { minX: number; maxX: number; minY: number; maxY: number };

type StatoDrag = {
  /** Id del pointer attivo: nessun altro pointer deve muovere il widget. */
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
 * Come è reso fluido (nessun lavoro inutile durante il movimento):
 * - i listener sono nativi: `pointerdown` sull'elemento, `pointermove`
 *   (passive), `pointerup` e `pointercancel` su `window`. React non entra mai
 *   nel percorso caldo del movimento → nessun render e nessuna allocazione di
 *   eventi sintetici mentre il dito o il mouse scorrono;
 * - `pointermove` fa solo aritmetica: le ultime coordinate finiscono in due ref
 *   numeriche (nessun oggetto temporaneo, nessun setState);
 * - la scrittura sull'elemento avviene al massimo una volta per frame
 *   (`requestAnimationFrame`) e solo se la posizione è davvero cambiata;
 * - durante il movimento non si legge il layout (nessun
 *   `getBoundingClientRect`) e non si tocca localStorage: i limiti allo schermo
 *   sono misurati una volta sola e poi riusati, la posizione viene salvata solo
 *   al termine del gesto;
 * - mouse (desktop) e touch (mobile) passano da un unico percorso basato sui
 *   Pointer Events, con pointer capture per non perdere il gesto;
 * - non esce dallo schermo: il clamp viene riapplicato al mount, al resize e
 *   alla rotazione;
 * - tap vs drag: sotto la soglia di 5px è un tap → `onTap` (apre la chat o
 *   richiama Pino), sopra è un drag e il click successivo viene soppresso;
 * - la posizione è ripristinata da localStorage al primo mount e risalvata a
 *   ogni drag concluso (anche se il gesto viene interrotto dal browser).
 */
function usePinoTrascinabile(onTap: () => void) {
  const elementRef = useRef<HTMLElement | null>(null);
  /** Posizione applicata all'elemento (mutata in place: nessuna allocazione per frame). */
  const posizioneRef = useRef<Posizione>({ ...POSIZIONE_DEFAULT });
  const ripristinataRef = useRef(false);
  const dragRef = useRef<StatoDrag | null>(null);
  const frameRef = useRef<number | null>(null);
  /** Ultima posizione richiesta dal puntatore, non ancora scritta sull'elemento. */
  const pendenteXRef = useRef(0);
  const pendenteYRef = useRef(0);
  const haPendenteRef = useRef(false);
  /** `true` se l'ultima interazione è stato un drag: serve a sopprimere il click. */
  const wasDraggedRef = useRef(false);
  const onTapRef = useRef(onTap);
  /** Limiti già misurati: vengono invalidati al resize e al cambio di nodo. */
  const limitiRef = useRef<Limiti | null>(null);
  /** Smonta i listener nativi legati al nodo corrente. */
  const staccaNodoRef = useRef<(() => void) | null>(null);
  /** Smonta i listener nativi attivi solo durante il drag. */
  const staccaDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  // Smontaggio: nessun listener nativo resta appeso al documento.
  useEffect(
    () => () => {
      staccaNodoRef.current?.();
      staccaDragRef.current?.();
    },
    []
  );

  /** Scrive la posizione sull'elemento: nessuno stato React da sincronizzare. */
  const applica = useCallback((x: number, y: number) => {
    const pos = posizioneRef.current;
    pos.x = x;
    pos.y = y;
    const elemento = elementRef.current;
    if (elemento) elemento.style.transform = trasla(pos);
  }, []);

  /** Scrive solo se la posizione è cambiata davvero: nessuno stile ridondante. */
  const applicaSeCambiata = useCallback(
    (x: number, y: number) => {
      const pos = posizioneRef.current;
      if (pos.x === x && pos.y === y) return;
      applica(x, y);
    },
    [applica]
  );

  /** Scrittura raggruppata a un frame: il movimento resta a filo del refresh. */
  const flush = useCallback(() => {
    frameRef.current = null;
    if (!haPendenteRef.current) return;
    haPendenteRef.current = false;
    applicaSeCambiata(pendenteXRef.current, pendenteYRef.current);
  }, [applicaSeCambiata]);

  /** Materializza subito l'ultimo movimento in sospeso (annulla il frame). */
  const applicaSubito = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (!haPendenteRef.current) return;
    haPendenteRef.current = false;
    applicaSeCambiata(pendenteXRef.current, pendenteYRef.current);
  }, [applicaSeCambiata]);

  /** Misura i limiti allo schermo una volta sola, tenendoli in cache. */
  const calcolaLimiti = useCallback((): Limiti => {
    const elemento = elementRef.current;
    if (!elemento) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    limitiRef.current = limitiViewport(elemento, posizioneRef.current);
    return limitiRef.current;
  }, []);

  /** Limiti validi per la viewport attuale: se già misurati non costano nulla. */
  const limitiCorrenti = useCallback(
    (): Limiti => limitiRef.current ?? calcolaLimiti(),
    [calcolaLimiti]
  );

  /**
   * Riporta il widget dentro la viewport se la posizione corrente lo fa
   * sbordare: succede al mount (la sagoma desktop 2x sporge dal suo ancoraggio)
   * e ogni volta che la finestra cambia dimensione.
   */
  const clampAllaViewport = useCallback(() => {
    const elemento = elementRef.current;
    if (!elemento || dragRef.current) return;

    const limiti = calcolaLimiti();
    const attuale = posizioneRef.current;
    const x = clamp(attuale.x, limiti.minX, limiti.maxX);
    const y = clamp(attuale.y, limiti.minY, limiti.maxY);

    if (x !== attuale.x || y !== attuale.y) {
      applica(x, y);
      salvaPosizione(posizioneRef.current);
    }
  }, [applica, calcolaLimiti]);

  /**
   * Inizio del drag: registrato come listener nativo sull'elemento.
   *
   * Da qui in poi il movimento non passa più da React: `pointermove`, `pointerup`
   * e `pointercancel` sono ascoltati su `window` (passive dove possibile) e
   * vengono smontati appena il gesto finisce.
   */
  const iniziaDrag = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // La X del fumetto non deve iniziare un drag: i listener nativi scattano
      // prima degli handler React, quindi un semplice stopPropagation non
      // basterebbe più.
      if ((event.target as Element | null)?.closest?.("[data-pino-nodrag]")) return;
      if (dragRef.current) return;

      const elemento = elementRef.current;
      if (!elemento) return;

      // Nessuna lettura di layout: se i limiti sono già in cache (misurati al
      // mount o all'ultimo resize) l'inizio del drag è immediato.
      const limiti = limitiCorrenti();

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
        baseX: posizioneRef.current.x,
        baseY: posizioneRef.current.y,
        moved: false,
        ...limiti,
      };

      /** Fine del gesto: smonta i listener di drag e rilascia il pointer. */
      const stacca = () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onCancel, true);
        staccaDragRef.current = null;
        try {
          elemento.releasePointerCapture(event.pointerId);
        } catch {
          // Nulla da rilasciare.
        }
      };

      function onMove(moveEvent: PointerEvent) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== moveEvent.pointerId) return;

        const dx = moveEvent.clientX - drag.startX;
        const dy = moveEvent.clientY - drag.startY;

        if (!drag.moved) {
          if (Math.abs(dx) < SOGLIA_DRAG && Math.abs(dy) < SOGLIA_DRAG) return;
          drag.moved = true;
          wasDraggedRef.current = true;
        }

        // Solo aritmetica: niente DOM, niente storage, niente render.
        pendenteXRef.current = clamp(drag.baseX + dx, drag.minX, drag.maxX);
        pendenteYRef.current = clamp(drag.baseY + dy, drag.minY, drag.maxY);
        haPendenteRef.current = true;

        // Al massimo una scrittura per frame, anche con mouse ad alta frequenza.
        if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
      }

      function onUp(upEvent: PointerEvent) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== upEvent.pointerId) return;

        const spostato = drag.moved;
        dragRef.current = null;
        stacca();

        if (!spostato) {
          // Tap: apre la chat (o richiama Pino).
          onTapRef.current();
          return;
        }

        // Fissiamo l'ultimo movimento in sospeso e solo ora salviamo: durante il
        // drag localStorage non viene mai toccato.
        applicaSubito();
        salvaPosizione(posizioneRef.current);
      }

      function onCancel(cancelEvent: PointerEvent) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== cancelEvent.pointerId) return;

        const spostato = drag.moved;
        dragRef.current = null;
        stacca();
        if (!spostato) return;

        // Il browser ha interrotto il gesto (gesture di sistema, perdita del
        // pointer): consolidiamo lo spostamento già fatto invece di buttarlo via.
        applicaSubito();
        salvaPosizione(posizioneRef.current);
      }

      window.addEventListener("pointermove", onMove, { passive: true, capture: true });
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onCancel, true);
      staccaDragRef.current = stacca;
    },
    [applicaSubito, flush, limitiCorrenti]
  );

  /**
   * Callback ref: funziona sia sul <div> flottante sia sul <button> ridotto e,
   * al primo mount, ripristina la posizione salvata prima del paint (nessun
   * salto visibile). Il componente resta montato quando Pino è nascosto nelle
   * rotte transazionali, quindi al ritorno la posizione è già in memoria.
   *
   * I listener del drag sono legati qui al nodo: nessun handler React nel
   * percorso caldo del movimento.
   */
  const attachRef = useCallback(
    (node: HTMLElement | null) => {
      staccaNodoRef.current?.();
      staccaNodoRef.current = null;
      staccaDragRef.current?.();
      staccaDragRef.current = null;
      dragRef.current = null;
      // Nodo diverso (flottante ↔ ridotto): i limiti misurati non valgono più.
      limitiRef.current = null;
      elementRef.current = node;
      if (!node) return;

      if (!ripristinataRef.current) {
        const salvata = leggiPosizioneSalvata();
        if (salvata) {
          posizioneRef.current.x = salvata.x;
          posizioneRef.current.y = salvata.y;
        }
        ripristinataRef.current = true;
      }

      node.style.transform = trasla(posizioneRef.current);

      // Misura qui i limiti allo schermo (una volta per nodo): così anche il
      // primo pointerdown è pura aritmetica, senza letture di layout.
      calcolaLimiti();

      node.addEventListener("pointerdown", iniziaDrag);
      staccaNodoRef.current = () => node.removeEventListener("pointerdown", iniziaDrag);
    },
    [calcolaLimiti, iniziaDrag]
  );

  // Mount, resize e rotazione: il widget non deve mai sbordare dallo schermo.
  // Al cambio di dimensione i limiti in cache non valgono più e vanno rimisurati.
  useEffect(() => {
    const ricalcola = () => {
      limitiRef.current = null;
      clampAllaViewport();
    };

    ricalcola();

    window.addEventListener("resize", ricalcola);
    window.addEventListener("orientationchange", ricalcola);
    return () => {
      window.removeEventListener("resize", ricalcola);
      window.removeEventListener("orientationchange", ricalcola);
    };
  }, [clampAllaViewport]);

  /** Il click nativo che segue un drag va ignorato (altrimenti aprirebbe la chat). */
  const clickSopraggio = useCallback(() => wasDraggedRef.current, []);

  return { attachRef, clickSopraggio };
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
  const { attachRef, clickSopraggio } = usePinoTrascinabile(() => {
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
        //
        // `transition` è limitato a colori e luminosità: la versione generica
        // include anche `transform`, quindi ogni scrittura durante il drag
        // verrebbe animata in 150ms e il trascinamento sembrerebbe lento.
        className="fixed bottom-4 right-4 z-[90] flex h-12 min-w-[64px] cursor-grab touch-none select-none items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-xl shadow-slate-900/15 transition-[color,background-color,border-color,filter] hover:border-blue-300 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 active:cursor-grabbing active:brightness-95"
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
      data-testid="pino-widget"
      className="fixed bottom-5 right-5 z-[60] touch-none select-none will-change-transform"
      aria-label="Pino, assistente di InCittà"
    >
      {/* gap-0.5: il fumetto è adiacente a Pino → un unico blocco visivo.
          md:pr-6 riserva il bordo destro dove si sovrappone la sagoma di Pino. */}
      <div className="flex items-end gap-0.5">
        <div className="relative mb-4 flex max-w-[172px] items-start rounded-2xl bg-gradient-to-br from-cyan-700 to-sky-700 py-2 pl-2.5 pr-1.5 text-white shadow-[0_10px_26px_-12px_rgba(8,51,68,0.55)] sm:max-w-[188px] md:mb-14 md:pr-7">
          {/* X: chiude completamente la presentazione. `data-pino-nodrag` la
              esclude dal drag: i listener nativi del contenitore non possono
              essere fermati da uno stopPropagation React (scattano prima), e
              un gesto da qui non deve aprire l'assistente. */}
          <button
            type="button"
            data-pino-nodrag="1"
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
