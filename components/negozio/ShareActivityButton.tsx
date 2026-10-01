"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Mail, MessageCircle, Send, Share2 } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  /**
   * URL/path da condividere. Se assente usa l'URL corrente della pagina.
   * Necessario sulle card (homepage/elenco negozi): lì l'URL corrente è la
   * pagina che contiene la card, non la scheda dell'attività.
   */
  url?: string;
};

const MARGINE = 8;

/** Risolve l'URL condiviso in forma assoluta. */
function risolviUrl(url?: string): string {
  if (!url) return typeof window !== "undefined" ? window.location.href : "";
  if (/^https?:\/\//i.test(url)) return url;
  const origine = typeof window !== "undefined" ? window.location.origin : "";
  return `${origine}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function ShareActivityButton({ title, description = "", url }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const getShareData = () => ({
    title: title + " | InCittà",
    text: description ? title + " — " + description : "Scopri " + title + " su InCittà.",
    url: risolviUrl(url),
  });

  // Try the installed native app first. If the OS/browser cannot handle the
  // custom scheme, fall back to the normal web share page.
  const openAppThenFallback = (appUrl: string, webUrl: string) => {
    let handled = false;
    const markHandled = () => {
      handled = true;
      window.removeEventListener("visibilitychange", markHandled);
    };

    window.addEventListener("visibilitychange", markHandled);
    window.location.href = appUrl;

    window.setTimeout(() => {
      window.removeEventListener("visibilitychange", markHandled);
      if (!handled && document.visibilityState === "visible") {
        window.location.href = webUrl;
      }
    }, 1200);

    setOpen(false);
  };

  const copyLink = async () => {
    const value = getShareData().url;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copia questo link", value);
    }
  };

  const nativeShare = async () => {
    const data = getShareData();
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share(data);
      setOpen(false);
    } catch {
      // Annullamento della finestra nativa: nessun errore da mostrare.
    }
  };

  const shareFacebook = () => {
    const value = getShareData().url;
    const webUrl = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(value);
    const appUrl = "fb://facewebmodal/f?href=" + encodeURIComponent(webUrl);
    openAppThenFallback(appUrl, webUrl);
  };

  const shareTelegram = () => {
    const data = getShareData();
    const webUrl =
      "https://t.me/share/url?url=" +
      encodeURIComponent(data.url) +
      "&text=" +
      encodeURIComponent(data.text);
    const appUrl =
      "tg://msg_url?url=" +
      encodeURIComponent(data.url) +
      "&text=" +
      encodeURIComponent(data.text);
    openAppThenFallback(appUrl, webUrl);
  };

  const shareWhatsApp = () => {
    const data = getShareData();
    const message = encodeURIComponent(data.text + " " + data.url);
    const webUrl = "https://wa.me/?text=" + message;
    const appUrl = "whatsapp://send?text=" + message;
    openAppThenFallback(appUrl, webUrl);
  };

  const shareSms = () => {
    const data = getShareData();
    window.location.href = "sms:?body=" + encodeURIComponent(data.text + " " + data.url);
    setOpen(false);
  };

  const shareEmail = () => {
    const data = getShareData();
    window.location.href =
      "mailto:?subject=" +
      encodeURIComponent(data.title) +
      "&body=" +
      encodeURIComponent(data.text + "\n\n" + data.url);
    setOpen(false);
  };

  // Posizionamento del menu (fixed) ancorato al trigger, con clamp nel viewport.
  // La misura avviene in requestAnimationFrame (dopo il commit) e sugli eventi
  // resize/scroll: nessun setState sincrono nel corpo dell'effect.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const update = () => {
      const t = trigger.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = t.left;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const voceMenu =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={"Condividi " + title}
        onClick={() => {
          if (!open) setPos(null); // rimisura alla nuova apertura
          setOpen((value) => !value);
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:shadow"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Condividi
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Condividi attività"
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            <button type="button" role="menuitem" onClick={nativeShare} className={voceMenu}>
              <Share2 className="h-4 w-4 text-blue-600" aria-hidden /> Web / altre app
            </button>
            <button type="button" role="menuitem" onClick={shareFacebook} className={voceMenu}>
              <span className="flex h-4 w-4 items-center justify-center text-xs font-black text-blue-600" aria-hidden>f</span> Facebook
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                // Instagram has no stable public web share endpoint. Open the
                // installed app when possible; otherwise use the native share sheet.
                let handled = false;
                const markHandled = () => {
                  handled = true;
                  window.removeEventListener("visibilitychange", markHandled);
                };
                window.addEventListener("visibilitychange", markHandled);
                window.location.href = "instagram://app";
                window.setTimeout(() => {
                  window.removeEventListener("visibilitychange", markHandled);
                  if (!handled && document.visibilityState === "visible") void nativeShare();
                }, 1000);
                setOpen(false);
              }}
              className={voceMenu}
            >
              <span className="flex h-4 w-4 items-center justify-center text-xs font-black text-pink-600" aria-hidden>◎</span> Instagram
            </button>
            <button type="button" role="menuitem" onClick={shareTelegram} className={voceMenu}>
              <Send className="h-4 w-4 text-sky-500" aria-hidden /> Telegram
            </button>
            <button type="button" role="menuitem" onClick={shareWhatsApp} className={voceMenu}>
              <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden /> WhatsApp
            </button>
            <button type="button" role="menuitem" onClick={shareSms} className={voceMenu}>
              <MessageCircle className="h-4 w-4 text-slate-500" aria-hidden /> Messaggio / SMS
            </button>
            <button type="button" role="menuitem" onClick={shareEmail} className={voceMenu}>
              <Mail className="h-4 w-4 text-slate-500" aria-hidden /> Email
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button type="button" role="menuitem" onClick={copyLink} className={voceMenu}>
              {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4 text-slate-500" aria-hidden />}
              {copied ? "Link copiato" : "Copia link"}
            </button>
            {copied && <div className="px-3 pb-1 text-[11px] font-semibold text-emerald-600" role="status">Link pronto da incollare.</div>}
          </div>,
          document.body
        )}
    </div>
  );
}
