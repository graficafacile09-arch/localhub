"use client";

import { useRef, useState } from "react";
import PinoSprite from "./PinoSprite";

export default function PinoHomepageHelper() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);

  const openAssistant = () => window.dispatchEvent(new Event("assistant:open"));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, baseX: position.x, baseY: position.y, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
    setPosition({
      x: Math.max(-window.innerWidth + 170, Math.min(window.innerWidth - 30, drag.baseX + dx)),
      y: Math.max(-window.innerHeight + 170, Math.min(window.innerHeight - 30, drag.baseY + dy)),
    });
  };

  const onPointerUp = () => {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (!moved) openAssistant();
  };

  return (
    <div
      className="fixed bottom-5 right-5 z-[60] touch-none select-none"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
      aria-label="Pino, assistente di InCittà"
    >
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); openAssistant(); }}
          className="relative mb-6 max-w-[158px] rounded-[18px] rounded-br-[7px] border border-blue-200/90 bg-blue-50/95 px-3 py-1.5 shadow-[0_5px_16px_-9px_rgba(15,23,42,0.5)] outline-none transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-blue-300"
          aria-label="Apri l'assistente AI di InCittà"
        >
          <span className="block text-[11px] font-semibold leading-[15px] text-blue-900">Ciao, sono Pino, pronto ad aiutarti.</span>
          <span className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45 border-r border-b border-blue-200/90 bg-blue-50" aria-hidden="true" />
        </button>
        <div
          role="button"
          tabIndex={0}
          aria-label="Apri l'assistente AI"
          className="cursor-grab rounded-full outline-none transition hover:scale-105 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-yellow-300"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openAssistant();
            }
          }}
        >
          <PinoSprite mood="neutral" className="h-[92px] w-[71px] drop-shadow-[0_7px_10px_rgba(15,23,42,0.2)]" />
        </div>
      </div>
      <span className="sr-only">Trascina Pino per spostarlo oppure clicca per aprire la ricerca AI.</span>
    </div>
  );
}
