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

  useEffect(() => {
    if (pathname !== "/") {
      setHasReachedArea(false);
      setIsScrolling(false);
      return;
    }

    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const updateVisibility = () => {
      const reached = window.scrollY >= PINO_TRIGGER_SCROLL;
      setHasReachedArea(reached);
      setIsScrolling(true);

      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        setIsScrolling(false);
      }, PINO_SCROLL_SETTLE_MS);
    };

    const syncInitialPosition = () => {
      setHasReachedArea(window.scrollY >= PINO_TRIGGER_SCROLL);
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

  // Pino homepage è intenzionalmente escluso dai flussi transazionali.
  if (pathname !== "/" || isPinoTransactionalRoute(pathname)) return null;

  const visible = hasReachedArea && !isScrolling;

  return (
    <div
      aria-label="Pino, assistente di InCittà"
      className={[
        "pointer-events-none fixed inset-x-0 bottom-0 z-[60]",
        "transition-[opacity,transform] duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
      aria-hidden={!visible}
    >
      {/* Fascia piena da bordo a bordo. È volutamente appena più alta
          del Pino chiuso, così il personaggio sembra integrato nella UI. */}
      <div
        className="pointer-events-auto flex w-full items-center justify-end border-t border-slate-200/90 bg-white/95 px-3 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:px-5"
        style={{ minHeight: PINO_BAR_HEIGHT }}
      >
        <div className="flex w-full items-center gap-3 sm:gap-4">
          <p className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-700 sm:text-base">
            Ciao, sono Pino il tuo assistente virtuale.
          </p>

          <button
            type="button"
            onClick={openAssistant}
            className="shrink-0 rounded-lg bg-yellow-400 px-3 py-2 text-[11px] font-black tracking-wide text-blue-900 shadow-sm transition hover:bg-yellow-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-[0.98] sm:px-4 sm:text-xs"
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
