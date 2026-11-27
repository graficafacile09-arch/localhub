"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  isPinoAreaRiservata,
  isPinoSezioneNascosta,
  isPinoTransactionalRoute,
} from "./pino-route";

const PINO_HOME_SRC = "/pino-neutro.webp";
const PINO_HOME_W = 378;
const PINO_HOME_H = 560;
// Nella fascia chiusa Pino è a mezzo busto: chioma, rami e braccia, senza gambe
// né piedi. Il riquadro (49x52) sta tutto dentro l'altezza della fascia (58px),
// senza sporgenze e senza cerchio attorno. L'immagine intera è resa a 72px e
// spostata di 5px in alto, così il ritaglio cade appena sotto le braccia
// (y≈440 dell'asset), dove la sagoma si restringe al tronco: il taglio non
// attraversa nessun arto e ai lati resta un filo di margine.
const PINO_BUST_W = 49;
const PINO_BUST_H = 52;
const PINO_BUST_IMG_H = 72;
const PINO_BUST_TOP = -5;
const PINO_BAR_HEIGHT = 58;
const PINO_TRIGGER_SCROLL = 560;
const PINO_SCROLL_SETTLE_MS = 180;

export default function PinoHomepageHelper() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdminLogin = pathname === "/login" && searchParams.get("area") === "admin";
  const isAdminArea = isAdminLogin || pathname === "/amministratore" || pathname.startsWith("/amministratore/");
  const [hasReachedArea, setHasReachedArea] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(false);

  useEffect(() => {
    if (
      isAdminArea ||
      isPinoAreaRiservata(pathname) ||
      isPinoTransactionalRoute(pathname) ||
      isPinoSezioneNascosta(pathname)
    ) {
      setHasReachedArea(false);
      setIsScrolling(false);
      setIsNearBottom(false);
      return;
    }

    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const isFooterVisible = () => {
      const blueZone = document.querySelector<HTMLElement>(
        "[data-pino-footer-zone=\"true\"]"
      );
      const legalFooter = document.querySelector<HTMLElement>(
        "[data-pino-legal-footer=\"true\"]"
      );

      // Appena una delle due zone finali entra nella viewport, rimuoviamo
      // completamente la fascia fissa: nessun overlay o fascia grigia sopra
      // le regole/il footer.
      const blueVisible = blueZone
        ? blueZone.getBoundingClientRect().top < window.innerHeight
        : false;
      const legalVisible = legalFooter
        ? legalFooter.getBoundingClientRect().top < window.innerHeight
        : false;

      return blueVisible || legalVisible;
    };

    const updateVisibility = () => {
      setHasReachedArea(window.scrollY >= PINO_TRIGGER_SCROLL);
      setIsNearBottom(isFooterVisible());
      setIsScrolling(true);

      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        setIsScrolling(false);
      }, PINO_SCROLL_SETTLE_MS);
    };

    const syncInitialPosition = () => {
      setHasReachedArea(window.scrollY >= PINO_TRIGGER_SCROLL);
      setIsNearBottom(isFooterVisible());
      setIsScrolling(false);
    };

    syncInitialPosition();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", syncInitialPosition);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", syncInitialPosition);
    };
  }, [pathname]);

  const openAssistant = useCallback(() => {
    window.dispatchEvent(new Event("assistant:open"));
  }, []);

  // Nelle aree personali (venditore, cliente, corriere, amministratore) Pino non
  // compare, né nella sezione Territorio; sulle altre pagine pubbliche,
  // homepage compresa, resta disponibile anche per chi ha effettuato l'accesso.
  if (
    isAdminArea ||
    isPinoAreaRiservata(pathname) ||
    isPinoTransactionalRoute(pathname) ||
    isPinoSezioneNascosta(pathname)
  )
    return null;

  // Sulla homepage manteniamo il comportamento esistente: Pino compare dopo
  // lo scroll iniziale. Nelle altre pagine è disponibile subito, ma scompare
  // quando il footer entra nella viewport.
  const visible =
    !isScrolling &&
    !isNearBottom &&
    (pathname !== "/" || hasReachedArea);

  if (!visible) return null;

  return (
    <div
      aria-label="Pino, assistente di Radici Calabria"
      data-pino-helper="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] h-[58px] bg-white lg:inset-x-auto lg:left-auto lg:right-0 lg:w-fit lg:rounded-l-2xl"
      aria-hidden="false"
    >
      <div
        className="pointer-events-auto flex h-full w-full items-center justify-center border-t border-slate-200/90 bg-white px-3 sm:px-5 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] lg:w-auto"
      >
        <div className="grid w-full grid-cols-[49px_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5 lg:w-auto lg:grid-cols-[49px_auto_auto] lg:gap-3">
          <button
            type="button"
            onClick={openAssistant}
            data-testid="pino-richiama"
            aria-label="Apri Pino, assistente di Radici Calabria"
            title="Apri Pino"
            className="pointer-events-auto relative shrink-0 cursor-pointer overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
            style={{ width: PINO_BUST_W, height: PINO_BUST_H }}
          >
            <img
              src={PINO_HOME_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
              decoding="async"
              width={PINO_HOME_W}
              height={PINO_HOME_H}
              className="absolute block h-auto w-auto max-w-none"
              style={{ height: PINO_BUST_IMG_H, top: PINO_BUST_TOP, left: 0 }}
            />
          </button>

          <p className="min-w-0 text-center text-base font-bold tracking-tight text-slate-800 sm:text-lg">
            Tu chiedi. Pino trova.
          </p>

          <button
            type="button"
            onClick={openAssistant}
            className="shrink-0 rounded-md bg-yellow-400 px-4 py-2 text-xs font-black tracking-wide text-blue-900 shadow-sm transition hover:bg-yellow-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.98] sm:px-5 sm:py-2 sm:text-sm"
            aria-label="Clicca per aprire Pino"
          >
            CLICCA
          </button>
        </div>
      </div>
    </div>
  );
}
