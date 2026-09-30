"use client";

import PinoSprite from "./PinoSprite";

export default function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 pl-1" role="status" aria-label="Pino sta cercando...">
      <PinoSprite mood="neutral" className="h-[92px] w-[70px] animate-pulse" />
      <div className="mb-2 rounded-2xl rounded-bl-sm bg-blue-50 px-3 py-2 shadow-sm ring-1 ring-blue-100">
        <div className="text-xs font-bold text-blue-900">Pino sta cercando...</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="sr-only">Ricerca in corso</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-blue-500"
              style={{
                animation: "typing-bounce 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
