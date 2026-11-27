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
// Il cerchio bianco (80px) contiene il personaggio per intero: la sagoma di
// pino-neutro.webp è larga quasi quanto il canvas, quindi l'immagine va resa a
// 66px di altezza (≈60px di figura) perché chioma, rami e piedi restino dentro
// il cerchio senza tagli. Il cerchio non ha bordo né ombra: si vede solo come
// alone bianco dove sporge dallo sfondo della pagina, senza fare da badge.
// Alzato di 15px rispetto al centro della barra (58px)
// sporge di 26px sopra la fascia e resta 4px sopra il bordo inferiore della
// viewport. Lo spostamento è un transform, non un margine: così l'altezza della
// riga non lo riassorbe e la sporgenza resta esatta.
const PINO_CLOSED_SIZE = 80;
const PINO_CLOSED_IMG_H = 66;
const PINO_CLOSED_RAISE = 15;
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
        <div className="grid w-full grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4 lg:w-auto lg:grid-cols-[80px_auto_auto] lg:gap-3">
          <button
            type="button"
            onClick={openAssistant}
            data-testid="pino-richiama"
            aria-label="Apri Pino, assistente di Radici Calabria"
            title="Apri Pino"
            className="pointer-events-auto flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-white p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
            style={{
              width: PINO_CLOSED_SIZE,
              height: PINO_CLOSED_SIZE,
              transform: `translateY(-${PINO_CLOSED_RAISE}px)`,
            }}
          >
            <img
              src={PINO_HOME_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
              decoding="async"
              width={PINO_HOME_W}
              height={PINO_HOME_H}
              className="block w-auto max-w-none -translate-y-[3px] object-contain"
              style={{ height: PINO_CLOSED_IMG_H }}
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
