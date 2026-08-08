"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AssistantMessage, { type ChatMessage } from "@/components/assistant/AssistantMessage";
import AssistantInput from "@/components/assistant/AssistantInput";
import TypingIndicator from "@/components/assistant/TypingIndicator";

const SUGGESTIONS = [
  "Quanti negozi attivi abbiamo?",
  "Quali sono i negozi in evidenza?",
  "Mostrami le offerte attive.",
  "Quali sono le categorie più utilizzate?",
  "Dammi una panoramica della piattaforma.",
] as const;

let _idCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++_idCounter}`;
}

export default function AssistantAdminChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isLoadingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const assistantCountRef = useRef(0);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isLoading) {
      container.scrollTop = container.scrollHeight;
      return;
    }

    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const newCount = assistantMessages.length;

    if (newCount > assistantCountRef.current) {
      assistantCountRef.current = newCount;
      setTimeout(() => {
        const el = lastAssistantRef.current;
        if (!el || !container) return;
        const containerTop = container.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        const offset = elTop - containerTop + container.scrollTop - 8;
        container.scrollTo({ top: offset, behavior: "smooth" });
      }, 80);
    } else if (messages.length > 0) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (query: string) => {
    const termine = query.trim();
    if (!termine || isLoadingRef.current) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      content: termine,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const response = await fetch("/api/amministratore/assistente-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domanda: termine }),
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as {
          error?: string | { message?: string };
        };
        const errMessage =
          (typeof errData?.error === "string"
            ? errData.error
            : errData?.error?.message) ?? `Errore HTTP ${response.status}`;
        throw new Error(errMessage);
      }

      const json = (await response.json()) as {
        risposta?: string;
        data?: { risposta?: string };
      };

      // L'API restituisce { success: true, data: { risposta } }.
      // Fallback su data.risposta per compatibilità con eventuali versioni precedenti.
      const risposta = json?.data?.risposta ?? json?.risposta;

      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: risposta ?? "Nessuna risposta.",
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Si è verificato un errore.";

      const errorMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: `**Errore**\n\n${message}\n\nRiprova tra qualche secondo.`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const handleSend = useCallback(() => {
    sendMessage(inputValue);
  }, [inputValue, sendMessage]);

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage(suggestion);
    },
    [sendMessage]
  );

  const showWelcome = messages.length === 0 && !isLoading;

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        {showWelcome ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 pb-4 sm:px-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/30">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-6 w-6"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
            </div>

            <div className="text-center">
              <h2 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                Assistente AI Amministrazione
              </h2>
              <p className="mt-1 max-w-sm text-[13px] leading-5 text-slate-500">
                Analizza e consulta i dati reali della piattaforma InCittà.
                Fai una domanda qui sotto.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 active:scale-95"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-3 pt-3 pb-4 sm:px-5">
            {messages.map((message, index) => {
              const isLastAssistant =
                message.role === "assistant" &&
                !messages.slice(index + 1).some((m) => m.role === "assistant");

              return (
                <div
                  key={message.id}
                  ref={isLastAssistant ? lastAssistantRef : undefined}
                >
                  <AssistantMessage message={message} />
                </div>
              );
            })}

            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-5">
        <div className="mx-auto max-w-3xl">
          <AssistantInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}
            placeholder="Chiedi qualcosa sui dati della piattaforma…"
          />
          <p className="mt-1 text-center text-[10px] text-slate-400">
            <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{" "}
            invia ·{" "}
            <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd>{" "}
            a capo
          </p>
        </div>
      </div>
    </div>
  );
}