"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PINO_ASSET, PINO_ASSET_H, PINO_ASSET_W } from "./PinoSprite";
import { isPinoTransactionalRoute } from "./pino-route";

const PINO_HOME_SRC = PINO_ASSET.neutral;
const PINO_HOME_W = PINO_ASSET_W;
const PINO_HOME_H = PINO_ASSET_H;
const PINO_CLOSED_SIZE = 48;
const PINO_BAR_HEIGHT = 58;
/**
 * La fascia entra in scena quando l'utente ha raggiunto la parte bassa della
 * homepage, dove iniziano le vetrine di negozi/prodotti.
 */
const PINO_TRIGGER_SCROLL = 560;
/** Ritardo breve per considerare terminato lo scroll, evitando sfarfallii. */
const PINO_SCROLL_SETTLE_MS = 180;

export default function PinoHomepageHelper() {
  const pathname = usePathname();
  const [hasReachedArea, setHasReachedArea] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      setHasReachedArea(false);
      setIsScrolling(false);
      return;
    }

    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const updateVisibility = () => {
      const reached = window.scrollY >= PINO_TRIGGER_SCROLL;
      const blueZone = document.querySelector<HTMLElement>("[data-pino-footer-zone=\"true\"]");
      const blueZoneFinished = blueZone
        ? blueZone.getBoundingClientRect().top <= window.innerHeight
        : false;
      setHasReachedArea(reached);
      setIsNearBottom(blueZoneFinished);
      setIsScrolling(true);

      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        setIsScrolling(false);
      }, PINO_SCROLL_SETTLE_MS);
    };

    const syncInitialPosition = () => {
      const blueZone = document.querySelector<HTMLElement>("[data-pino-footer-zone=\"true\"]");
      const blueZoneFinished = blueZone
        ? blueZone.getBoundingClientRect().top <= window.innerHeight
        : false;
      setHasReachedArea(window.scrollY >= PINO_TRIGGER_SCROLL);
      setIsNearBottom(blueZoneFinished);
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

  if (pathname !== "/" || isPinoTransactionalRoute(pathname)) return null;

  const visible = hasReachedArea && !isScrolling && !isNearBottom;

  if (!visible) return null;

  return (
    <div
      aria-label="Pino, assistente di InCittà"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60]"
      aria-hidden="false"
    >
      <div
        className="pointer-events-auto flex w-full items-center justify-center border-t border-slate-200/90 bg-white/95 px-3 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:px-5"
        style={{ minHeight: PINO_BAR_HEIGHT }}
      >
        <div className="flex w-full items-center justify-center gap-2 sm:gap-3">
          <p className="min-w-0 text-center text-sm font-semibold text-slate-700 sm:text-base">
            Tu chiedi. Pino trova.
          </p>

          <button
            type="button"
            onClick={openAssistant}
            className="shrink-0 rounded-md bg-yellow-400 px-2 py-1.5 text-[9px] font-black tracking-wide text-blue-900 shadow-sm transition hover:bg-yellow-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.98] sm:px-2.5 sm:py-1.5 sm:text-[10px]"
            aria-label="Clicca per aprire Pino"
          >
            CLICCA
          </button>

          <button
            type="button"
            onClick={openAssistant}
            data-testid="pino-richiama"
            aria-label="Apri Pino, assistente di InCittà"
            title="Apri Pino"
            className="pointer-events-auto shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
            style={{ width: PINO_CLOSED_SIZE, height: PINO_CLOSED_SIZE }}
          >
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-slate-50 shadow-lg ring-1 ring-slate-200">
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
          </button>
        </div>
      </div>
    </div>
  );
}
