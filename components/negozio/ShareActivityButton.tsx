"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, MessageCircle, Send, Share2 } from "lucide-react";

type Props = { title: string; description?: string };

export default function ShareActivityButton({ title, description = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const getShareData = () => ({
    title: title + " | InCittà",
    text: description ? title + " — " + description : "Scopri " + title + " su InCittà.",
    url: window.location.href,
  });

  const openUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer,width=700,height=700");
    setOpen(false);
  };

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
    const url = getShareData().url;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copia questo link", url);
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
    const url = getShareData().url;
    const webUrl = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
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

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={"Condividi " + title}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 hover:shadow"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Condividi
      </button>

      {open && (
        <div role="menu" aria-label="Condividi attività" className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <button type="button" role="menuitem" onClick={nativeShare} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Share2 className="h-4 w-4 text-blue-600" aria-hidden /> Web / altre app
          </button>
          <button type="button" role="menuitem" onClick={shareFacebook} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <span className="flex h-4 w-4 items-center justify-center text-xs font-black text-blue-600" aria-hidden>f</span> Facebook
          </button>
          <button type="button" role="menuitem" onClick={() => {
            const data = getShareData();
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
            void data;
            setOpen(false);
          }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <span className="flex h-4 w-4 items-center justify-center text-xs font-black text-pink-600" aria-hidden>◎</span> Instagram
          </button>
          <button type="button" role="menuitem" onClick={shareTelegram} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Send className="h-4 w-4 text-sky-500" aria-hidden /> Telegram
          </button>
          <button type="button" role="menuitem" onClick={shareWhatsApp} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden /> WhatsApp
          </button>
          <button type="button" role="menuitem" onClick={shareSms} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <MessageCircle className="h-4 w-4 text-slate-500" aria-hidden /> Messaggio / SMS
          </button>
          <button type="button" role="menuitem" onClick={shareEmail} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Mail className="h-4 w-4 text-slate-500" aria-hidden /> Email
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" role="menuitem" onClick={copyLink} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">
            {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4 text-slate-500" aria-hidden />}
            {copied ? "Link copiato" : "Copia link"}
          </button>
          {copied && <div className="px-3 pb-1 text-[11px] font-semibold text-emerald-600" role="status">Link pronto da incollare.</div>}
        </div>
      )}
    </div>
  );
}
