"use client";

import { useRef, useState } from "react";

export default function PinoHomepageHelper() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);

  const openAssistant = () => {
    window.dispatchEvent(new Event("assistant:open"));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
      moved: false,
    };
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
          onClick={(event) => event.stopPropagation()}
          className="relative mb-8 max-w-[190px] rounded-[22px] rounded-br-[8px] border border-white/80 bg-white px-3.5 py-2 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.45)] outline-none transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-yellow-300"
          aria-label="Apri l'assistente AI di InCittà"
        >
          <span className="block text-[12px] font-bold leading-4 text-blue-900">
            Ciao, sono Pino, pronto ad aiutarti.
          </span>
          <span className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45 border-r border-b border-white/80 bg-white" aria-hidden="true" />
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
          <div
            aria-hidden="true"
            className="h-[78px] w-[60px] overflow-hidden bg-no-repeat drop-shadow-[0_7px_10px_rgba(15,23,42,0.2)]"
            style={{
              backgroundImage: 'url("/pino-sprite.jpg")',
              backgroundSize: "300% 100%",
              backgroundPosition: "50% 0%",
            }}
          />
        </div>
      </div>
      <span className="sr-only">Trascina Pino per spostarlo oppure clicca per aprire la ricerca AI.</span>
    </div>
  );
}
