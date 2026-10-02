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
const PINO_TRIGGER_SCROLL = 560;
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

  if (pathname !== "/" || isPinoTransactionalRoute(pathname)) return null;

  const visible = hasReachedArea && !isScrolling && !isNearBottom;

  if (!visible) return null;

  return (
    <div
      aria-label="Pino, assistente di InCittà"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] h-[58px] overflow-hidden bg-white"
      aria-hidden="false"
    >
      <div
        className="pointer-events-auto flex h-full w-full items-center justify-center border-t border-slate-200/90 bg-white px-3 sm:px-5 shadow-[0_-2px_8px_rgba(15,23,42,0.06)]"
      >
        <div className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={openAssistant}
            data-testid="pino-richiama"
            aria-label="Apri Pino, assistente di InCittà"
            title="Apri Pino"
            className="pointer-events-auto flex shrink-0 cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
            style={{ width: PINO_CLOSED_SIZE, height: PINO_CLOSED_SIZE }}
          >
            <span className="flex h-full w-full items-center justify-center overflow-hidden">
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

          <p className="min-w-0 text-center text-base font-bold tracking-tight text-slate-800 sm:text-lg">
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
        </div>
      </div>
    </div>
  );
}
