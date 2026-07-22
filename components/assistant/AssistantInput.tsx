/**
 * LocalHub Assistant — AssistantInput
 *
 * Area di input in basso nella chat.
 * - Textarea auto-resize (max 5 righe)
 * - Enter invia, Shift+Enter va a capo
 * - Disabilitata durante il caricamento
 * - Pulsante invia con spinner
 *
 * @module components/assistant/AssistantInput
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface AssistantInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AssistantInput({
  value,
  onChange,
  onSend,
  isLoading,
  placeholder = "Scrivi un messaggio…",
}: AssistantInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize della textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max ~5 righe (circa 130px)
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Focus automatico al mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter senza Shift → invia
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSend();
      }
    }
  };

  const canSend = !isLoading && value.trim().length > 0;

  return (
    <div className="relative flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.10)] ring-1 ring-slate-100 transition-shadow focus-within:shadow-[0_8px_30px_rgba(37,99,235,0.16)] focus-within:ring-blue-200">
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder={placeholder}
        rows={1}
        className="max-h-[130px] min-h-[40px] flex-1 resize-none bg-transparent text-[15px] leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
        aria-label="Messaggio per l'assistente"
        aria-multiline="true"
      />

      {/* Pulsante invia */}
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={isLoading ? "Invio in corso…" : "Invia messaggio"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ArrowUp className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
