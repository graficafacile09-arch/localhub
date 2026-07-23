/**
 * LocalHub Assistant — AssistantChat
 *
 * Componente principale della chat. Layout ChatGPT-style:
 * - Header compatto sticky in cima (titolo + badge Online)
 * - Area messaggi flex-1 min-h-0 overflow-y-auto (occupa tutto lo spazio)
 * - Welcome screen con chip che scompare completamente al primo messaggio
 * - Input barra nel normal-flow in fondo, con padding-bottom safe-area
 *
 * Altezze corrette su mobile perché:
 *   page.tsx → <main> è `flex flex-1 flex-col min-h-0`
 *   AssistantChat → `flex h-full flex-col`
 *   scrollable area → `flex-1 min-h-0 overflow-y-auto`
 *
 * @module components/assistant/AssistantChat
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AssistantMessage, { type ChatMessage } from "./AssistantMessage";
import AssistantInput from "./AssistantInput";
import TypingIndicator from "./TypingIndicator";
import type { SearchResult } from "@/lib/search-service";

// ─── Suggerimenti iniziali ────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Cerca una pizzeria vicino al centro",
  "Ho mal di testa, dove posso trovare una farmacia?",
  "Negozi di abbigliamento aperti oggi",
  "Ristorante per una cena romantica",
];

// ─── ID univoci per i messaggi ────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++_idCounter}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Ref per evitare closure stale su isLoading nei callback
  const isLoadingRef = useRef(false);

  // Container scrollabile — usiamo scrollTop direttamente per non
  // innescare lo scroll del viewport su mobile.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Ref all'inizio dell'ultimo messaggio assistente — per portarlo in vista.
  const lastAssistantRef = useRef<HTMLDivElement>(null);

  // Conta i messaggi assistente già visti per rilevare nuove risposte.
  const assistantCountRef = useRef(0);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isLoading) {
      // Typing indicator: porta il fondo in vista
      container.scrollTop = container.scrollHeight;
      return;
    }

    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const newCount = assistantMessages.length;

    if (newCount > assistantCountRef.current) {
      // Nuova risposta arrivata: scrolla all'inizio del messaggio assistente.
      // Piccolo delay per lasciar completare il render delle card.
      assistantCountRef.current = newCount;
      setTimeout(() => {
        const el = lastAssistantRef.current;
        if (!el || !container) return;
        // Calcola l'offset dell'elemento rispetto al container scrollabile
        const containerTop = container.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        const offset = elTop - containerTop + container.scrollTop - 8; // 8px di respiro
        container.scrollTo({ top: offset, behavior: "smooth" });
      }, 80);
    } else if (messages.length > 0) {
      // Messaggio utente o aggiornamento: porta il fondo in vista
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isLoading]);

  // ── Invio messaggio ─────────────────────────────────────────────────────────

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
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: termine }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error ?? `Errore HTTP ${response.status}`
        );
      }

      const data = (await response.json()) as SearchResult;

      let content = data.risposta?.trim() ?? "";

      if (!content && data.negozi.length > 0) {
        content = `Ho trovato **${data.negozi.length} ${data.negozi.length === 1 ? "negozio" : "negozi"}** pertinenti alla tua ricerca.`;
      }

      if (!content && data.negozi.length === 0) {
        content =
          "Non ho trovato negozi corrispondenti alla tua ricerca. Prova con termini diversi, ad esempio il tipo di attività o categoria.";
      }

      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content,
        negozi: data.negozi.length > 0 ? data.negozi : undefined,
        processingMs: data.processingMs,
        source: data.source,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Si è verificato un errore.";

      const errorMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: `⚠️ **Si è verificato un errore**\n\n${message}\n\nRiprova tra qualche secondo.`,
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">

      {/* ── Area messaggi ──────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        {showWelcome ? (
          /*
           * Welcome screen — centra verticalmente icon + testo + chip.
           * h-full garantisce che utilizzi tutta l'area scrollabile.
           * Scompare completamente dal DOM al primo messaggio.
           */
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 pb-4 sm:px-6">
            {/* Icona */}
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
                Ciao! Sono l&apos;Assistente di LocalHub
              </h2>
              <p className="mt-1 max-w-sm text-[13px] leading-5 text-slate-500">
                Posso aiutarti a trovare negozi, servizi e attività locali.
                Dimmi cosa cerchi!
              </p>
            </div>

            {/* Chip suggerimenti */}
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

            {/* Typing indicator */}
            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* ── Input area ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-5">
        <div className="mx-auto max-w-3xl">
          <AssistantInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}
            placeholder="Chiedi qualcosa… es. farmacia aperta adesso, pizzeria in centro"
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
