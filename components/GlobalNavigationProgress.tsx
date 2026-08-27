"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Ritardo prima di mostrare la barra: evita il "flash" sulle navigazioni istantanee. */
const SHOW_DELAY_MS = 150;
/** Fallback di sicurezza: la barra non resta MAI bloccata (il completamento primario è il cambio route). */
const SAFETY_MS = 5000;
/** Durata della dissolvenza finale. */
const FADE_MS = 250;
/** Passo del trickle (avanzamento "in corso" mentre la pagina carica). */
const TRICKLE_MS = 180;

/**
 * BARRA DI AVANZAMENTO GLOBALE PER LA NAVIGAZIONE (App Router).
 *
 * Unica implementazione centralizzata, montata una sola volta nel root layout.
 * - AVVIO: click su <a> interno (Link), back/forward (popstate) e
 *   router.push/replace (patch di history.pushState/replaceState).
 * - COMPLETAMENTO: cambio effettivo della route (usePathname + useSearchParams),
 *   come da pattern ufficiale "router events" di Next.js App Router.
 *
 * Non si attiva per: menu/modal/accordion/toggle/checkbox/filtri locali/API
 * senza cambio pagina (nessun cambio di route → nessuna barra).
 */
export default function GlobalNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [shown, setShown] = useState(false);
  const [pct, setPct] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const navigatingRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstUrlRef = useRef<string | null>(null);

  const query = searchParams.toString();
  const url = `${pathname}${query ? `?${query}` : ""}`;

  // Larghezza mostrata: statica (50%) per reduced-motion, altrimenti il pct animato.
  const progress = reducedMotion ? (shown ? 50 : 0) : pct;

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (trickleTimerRef.current) {
      clearInterval(trickleTimerRef.current);
      trickleTimerRef.current = null;
    }
  }, []);

  /** Completa la navigazione: riempie la barra e la dissolve. */
  const finish = useCallback(() => {
    navigatingRef.current = false;
    clearTimers();
    setPct(100);
    fadeTimerRef.current = setTimeout(() => {
      setShown(false);
      setPct(0);
    }, FADE_MS);
  }, [clearTimers]);

  /** Avvia la navigazione (con soglia anti-flash). */
  const start = useCallback(() => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    clearTimers();
    setPct(0);
    showTimerRef.current = setTimeout(() => {
      if (!navigatingRef.current) return;
      setShown(true);
      setPct(12);
    }, SHOW_DELAY_MS);
    safetyTimerRef.current = setTimeout(() => {
      if (navigatingRef.current) finish();
    }, SAFETY_MS);
  }, [clearTimers, finish]);

  // Trickle: avanzamento progressivo mentre la pagina è in caricamento.
  // Con prefers-reduced-motion non c'è animazione: larghezza statica derivata.
  useEffect(() => {
    if (!shown || reducedMotion) return;
    trickleTimerRef.current = setInterval(() => {
      setPct((p) => (p >= 90 ? p : p + (100 - p) * 0.12));
    }, TRICKLE_MS);
    return () => {
      if (trickleTimerRef.current) {
        clearInterval(trickleTimerRef.current);
        trickleTimerRef.current = null;
      }
    };
  }, [shown, reducedMotion]);

  // prefers-reduced-motion: mantieni aggiornata la preferenza (valore iniziale
  // letto via useState initializer, nessun setState sincrono nell'effetto).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // COMPLETAMENTO: la route è cambiata → chiudi la barra.
  useEffect(() => {
    if (firstUrlRef.current === null) {
      firstUrlRef.current = url;
      return;
    }
    if (url !== firstUrlRef.current) {
      firstUrlRef.current = url;
      finish();
    }
  }, [url, finish]);

  // AVVIO: click su link interni, back/forward, router.push/replace.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const el = event.target as Element | null;
      const anchor = el?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href === "#" || href.startsWith("#")) return;
      if (anchor.hasAttribute("download")) return;

      const target = (anchor.getAttribute("target") ?? "").toLowerCase();
      if (target && target !== "_self") return;

      const rel = (anchor.getAttribute("rel") ?? "").toLowerCase();
      if (rel.split(/\s+/).includes("external")) return;

      let dest: URL;
      try {
        dest = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (dest.origin !== window.location.origin) return;
      if (
        dest.pathname === window.location.pathname &&
        dest.search === window.location.search
      ) {
        return;
      }

      start();
    }

    function onPopState() {
      start();
    }

    // router.push / router.replace (navigazione programmatica): l'App Router
    // usa la History API, quindi intercettarla copre anche queste chiamate.
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function pushState(data, unused, urlParam) {
      start();
      return originalPushState.call(this, data, unused, urlParam);
    };
    history.replaceState = function replaceState(data, unused, urlParam) {
      start();
      return originalReplaceState.call(this, data, unused, urlParam);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, [start]);

  return (
    <div
      data-testid="global-navigation-progress"
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999]"
      role={shown ? "progressbar" : undefined}
      aria-label={shown ? "Caricamento pagina" : undefined}
      aria-hidden={!shown}
    >
      <div
        className="h-[3px] w-full origin-left bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.45)]"
        style={{
          transform: `scaleX(${progress / 100})`,
          opacity: shown ? 1 : 0,
          transition: reducedMotion
            ? "none"
            : "transform 200ms ease-out, opacity 200ms ease-out",
        }}
      />
    </div>
  );
}
