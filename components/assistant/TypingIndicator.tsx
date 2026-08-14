/**
 * LocalHub Assistant — TypingIndicator
 *
 * Mostra tre pallini animati mentre l'AI elabora la risposta.
 * Stile coerente con il tema LocalHub.
 *
 * @module components/assistant/TypingIndicator
 */

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3" role="status" aria-label="L'AI sta pensando...">
      {/* Avatar AI */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-sm">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
          />
        </svg>
      </div>

      {/* Bubble con pallini */}
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-200/80">
        <span className="sr-only">L&apos;AI sta pensando...</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-blue-500"
            style={{
              animation: "typing-bounce 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
            aria-hidden
          />
        ))}
      </div>

      {/* Keyframe inline — Tailwind v4 non ha animate-bounce con delay personalizzabile */}
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
