"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, MessageCircle, Send, Share2 } from "lucide-react";

type Variante = "overlay" | "inline";

type Props = {
  /** Titolo condiviso (es. nome negozio/prodotto). Usato come testo e aria-label. */
  title: string;
  /** Testo descrittivo opzionale. */
  description?: string;
  /** URL o path da condividere. Se assente usa l'URL corrente della pagina. */
  url?: string;
  /** Etichetta accessibile aggiuntiva (fallback: title). */
  label?: string;
  /** "overlay" = icona circolare su card; "inline" = pulsante testuale nelle azioni. */
  variante?: Variante;
  /** Classi extra per il pulsante trigger (es. posizionamento assoluto). */
  className?: string;
};

const MARGINE = 8;

/**
 * Risolve l'URL da condividere in forma assoluta.
 * - url assente  → URL corrente della pagina;
 * - path relativo → origine corrente + path;
 * - URL assoluto  → invariato.
 */
function risolviUrl(url?: string): string {
  if (!url) {
    return typeof window !== "undefined" ? window.location.href : "";
  }
  if (/^https?:\/\//i.test(url)) return url;
  const origine = typeof window !== "undefined" ? window.location.origin : "";
  return `${origine}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Pulsante "Condividi" riutilizzabile (card negozio/home, pagina negozio,
 * pagina prodotto).
 *
 * Perché un PORTAL per il menu:
 * le card hanno `overflow-hidden` (serve a ritagliare l'immagine sugli angoli
 * arrotondati). Un menu assoluto dentro la card verrebbe tagliato. Invece di
 * alzare a caso lo z-index, il menu viene montato su `document.body` con
 * posizione `fixed`: esce dalla card senza dipendere dalla gerarchia di
 * stacking context, e resta comunque ancorato al pulsante (ricalcolato su
 * resize/scroll). Il click esterno e ESC lo chiudono.
 */
export default function ShareActivityButton({
  title,
  description,
  url,
  label,
  variante = "overlay",
  className = "",
}: Props) {
  const [aperto, setAperto] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Web Share API disponibile? Calcolato durante il render: il menu è montato
  // solo lato client (dopo l'interazione), quindi nessun mismatch di idratazione.
  const supportaNativo =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const chiudi = useCallback(() => {
    setAperto(false);
    setCopiato(false);
  }, []);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      // Il trigger è un fratello del <Link> della card, ma lo stopPropagation lo
      // rende sicuro anche se in futuro venisse annidato: il click non raggiunge
      // il Link che apre il negozio.
      e.stopPropagation();
      if (aperto) {
        setAperto(false);
        setCopiato(false);
      } else {
        setPos(null); // rimisura alla nuova apertura, niente posizione stantia
        setAperto(true);
      }
    },
    [aperto]
  );

  // Posizionamento del menu (fixed) ancorato al trigger, con clamp nel viewport.
  // La misura avviene in requestAnimationFrame (dopo il commit) e sugli eventi
  // di resize/scroll: nessun setState sincrono nel corpo dell'effect.
  useEffect(() => {
    if (!aperto) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const update = () => {
      const t = trigger.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = t.right - m.width; // bordo destro allineato al pulsante
      let top = t.bottom + MARGINE;
      if (top + m.height > vh - MARGINE) top = t.top - m.height - MARGINE;

      left = Math.min(Math.max(MARGINE, left), Math.max(MARGINE, vw - m.width - MARGINE));
      top = Math.min(Math.max(MARGINE, top), Math.max(MARGINE, vh - m.height - MARGINE));
      setPos({ top, left });
    };

    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [aperto]);

  // Chiusura su click esterno, scroll del menu e tasto ESC.
  useEffect(() => {
    if (!aperto) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      chiudi();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudi();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [aperto, chiudi]);

  const copiaLink = useCallback(async () => {
    const valore = risolviUrl(url);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(valore);
      } else {
        // Fallback per contesti non sicuri (http) o browser datati.
        const ta = document.createElement("textarea");
        ta.value = valore;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiato(true);
      window.setTimeout(() => setCopiato(false), 1800);
    } catch {
      // Clipboard non disponibile: nessuna azione distruttiva, l'utente può
      // ancora copiare dal menu del browser.
    }
  }, [url]);

  const condividiNativo = useCallback(async () => {
    try {
      await navigator.share({
        title,
        text: description || title,
        url: risolviUrl(url),
      });
      chiudi();
    } catch {
      // L'utente ha annullato o il browser ha rifiutato: nessun errore da mostrare.
    }
  }, [title, description, url, chiudi]);

  const testoCondivisione = description ? `${title} — ${description}` : title;
  const urlCondivisione = risolviUrl(url);
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${testoCondivisione} ${urlCondivisione}`)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(
    urlCondivisione
  )}&text=${encodeURIComponent(testoCondivisione)}`;

  const baseTrigger =
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  const triggerClass =
    variante === "inline"
      ? `${baseTrigger} inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:shadow`
      : `${baseTrigger} inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur transition hover:bg-white hover:text-blue-700`;

  const voceMenu =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={aperto}
        aria-controls={aperto ? menuId : undefined}
        aria-label={`Condividi ${label ?? title}`}
        className={`${triggerClass} ${className}`}
      >
        <Share2 className="h-4 w-4" aria-hidden />
        {variante === "inline" && <span>Condividi</span>}
      </button>

      {aperto &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Condividi ${title}`}
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-2xl shadow-slate-900/10"
          >
            <button
              type="button"
              role="menuitem"
              onClick={copiaLink}
              className={voceMenu}
            >
              {copiato ? (
                <Check className="h-4 w-4 text-emerald-500" aria-hidden />
              ) : (
                <Copy className="h-4 w-4 text-slate-400" aria-hidden />
              )}
              {copiato ? "Link copiato" : "Copia link"}
            </button>

            <a
              role="menuitem"
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={chiudi}
              className={voceMenu}
            >
              <MessageCircle className="h-4 w-4 text-emerald-500" aria-hidden />
              WhatsApp
            </a>

            <a
              role="menuitem"
              href={tgHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={chiudi}
              className={voceMenu}
            >
              <Send className="h-4 w-4 text-sky-500" aria-hidden />
              Telegram
            </a>

            {supportaNativo && (
              <>
                <div className="my-1 h-px bg-slate-100" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={condividiNativo}
                  className={voceMenu}
                >
                  <Share2 className="h-4 w-4 text-slate-400" aria-hidden />
                  Altre opzioni…
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
