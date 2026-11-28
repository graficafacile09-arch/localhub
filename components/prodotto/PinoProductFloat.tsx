"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import PinoSprite from "@/components/assistant/PinoSprite";
import {
  categoriaProdottoPino,
  domandaProdottoPino,
} from "@/lib/assistente/prodotti-pino";

/** Distanza minima (px) oltre la quale un movimento è trascinamento, non tap. */
const SOGLIA_TRASCINAMENTO = 6;

/**
 * Pino a figura intera, fluttuante sulla scheda prodotto. Trascinabile con
 * mouse o dito; un tap apre Pino con una domanda precompilata (vino o alimento).
 * Si nasconde con la × e mentre il pannello di Pino è aperto.
 */
export default function PinoProductFloat({
  productName,
  categoria = "",
}: {
  productName: string;
  categoria?: string;
}) {
  const famiglia = categoriaProdottoPino(productName, categoria);
  const domanda = domandaProdottoPino(productName, categoria);

  const [chiuso, setChiuso] = useState(false);
  const [pannelloAperto, setPannelloAperto] = useState(false);
  const [posizione, setPosizione] = useState<{ x: number; y: number } | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const trascinamento = useRef<{
    id: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    mosso: boolean;
  } | null>(null);

  // Il float si nasconde mentre il pannello di Pino è aperto: il pannello ha
  // data-pino-panel="true" e lo osserviamo nel DOM senza toccare AssistantPanel.
  useEffect(() => {
    const aggiorna = () =>
      setPannelloAperto(!!document.querySelector('[data-pino-panel="true"]'));
    aggiorna();
    const osservatore = new MutationObserver(aggiorna);
    osservatore.observe(document.body, { childList: true, subtree: true });
    return () => osservatore.disconnect();
  }, []);

  const limita = useCallback((x: number, y: number) => {
    const el = areaRef.current;
    const w = el?.offsetWidth ?? 80;
    const h = el?.offsetHeight ?? 80;
    const contenitore = el?.offsetParent as HTMLElement | null | undefined;
    return {
      x: Math.min(Math.max(0, x), (contenitore?.clientWidth ?? window.innerWidth) - w),
      y: Math.min(Math.max(0, y), (contenitore?.clientHeight ?? window.innerHeight) - h),
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = areaRef.current?.getBoundingClientRect();
    const padre = areaRef.current?.offsetParent?.getBoundingClientRect();
    if (!r || !padre) return;
    trascinamento.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: r.left - padre.left,
      origY: r.top - padre.top,
      mosso: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = trascinamento.current;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.startX;
    const dy = e.clientY - t.startY;
    if (!t.mosso && Math.hypot(dx, dy) < SOGLIA_TRASCINAMENTO) return;
    t.mosso = true;
    setPosizione(limita(t.origX + dx, t.origY + dy));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = trascinamento.current;
    trascinamento.current = null;
    if (!t || t.id !== e.pointerId) return;
    // Solo un tap (senza trascinamento) apre Pino.
    if (!t.mosso) {
      window.dispatchEvent(
        new CustomEvent("assistant:open", { detail: { initialQuery: domanda } })
      );
    }
  };

  if (chiuso || pannelloAperto) return null;

  return (
    <div
      ref={areaRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (trascinamento.current = null)}
      style={{
        touchAction: "none",
        ...(posizione
          ? { left: posizione.x, top: posizione.y, right: "auto", bottom: "auto" }
          : {}),
      }}
      className={`absolute z-20 flex cursor-grab select-none flex-row items-end gap-2 active:cursor-grabbing ${
        posizione ? "" : "bottom-3 right-3"
      }`}
      aria-label="Chiedi a Pino"
    >
      <PinoSprite mood="happy" className="h-[94px] w-auto max-w-none shrink-0 drop-shadow-md" />
      <div className="group relative max-w-[200px] rounded-2xl border border-stone-200/70 bg-white/92 px-3.5 py-2.5 pr-7 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-md transition-all duration-200 hover:border-emerald-300/80 hover:shadow-[0_10px_34px_rgb(16,185,129,0.12)]">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800/80">
            Chiedi a Pino
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[13px] font-medium leading-snug text-stone-800">
            {famiglia === "dolce" ? "Abbinamento e vino" : "Ricette e abbinamenti"}
          </span>
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setChiuso(true);
          }}
          aria-label="Chiudi Pino"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100/80 hover:text-stone-700"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}
