/**
 * LocalHub Assistant — AssistantChat
 *
 * Componente principale della chat.
 * Gestisce:
 * - Cronologia messaggi (ChatMessage[])
 * - Chiamata POST /api/search
 * - Scroll automatico in fondo
 * - Indicatore di digitazione
 * - Schermata di benvenuto con suggerimenti
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Ref all'ultimo messaggio assistente — usato per scrollare verso il risultato
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  // Tiene traccia di quanti messaggi assistente ci sono stati finora
  const assistantCountRef = useRef(0);

  // Scroll: quando arriva una nuova risposta dell'assistente, scrolla
  // all'inizio dell'ultimo messaggio assistente così l'utente vede il risultato.
  // Quando è in loading (typing indicator) scrolla al fondo.
  useEffect(() => {
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const newCount = assistantMessages.length;

    if (isLoading) {
      // Durante il caricamento scrolla al fondo per mostrare il typing indicator
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (newCount > assistantCountRef.current) {
      // È appena arrivata una nuova risposta: scrolla all'inizio del risultato
      assistantCountRef.current = newCount;
      // Piccolo delay per lasciar completare il render delle card
      setTimeout(() => {
        lastAssistantRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    } else {
      // Messaggi utente aggiuntivi o altri aggiornamenti: scrolla al fondo
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // ── Invio messaggio ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (query: string) => {
    const termine = query.trim();
    if (!termine || isLoadingRef.current) return;

    // 1. Aggiungi messaggio utente
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
      // 2. Chiama /api/search
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

      // 3. Costruisce il testo della risposta
      let content = data.risposta?.trim() ?? "";

      // Se non c'è risposta testuale ma ci sono negozi, genera un testo sintetico
      if (!content && data.negozi.length > 0) {
        content = `Ho trovato **${data.negozi.length} ${data.negozi.length === 1 ? "negozio" : "negozi"}** pertinenti alla tua ricerca.`;
      }

      // Se non c'è nulla
      if (!content && data.negozi.length === 0) {
        content =
          "Non ho trovato negozi corrispondenti alla tua ricerca. Prova con termini diversi, ad esempio il tipo di attività o categoria.";
      }

      // 4. Aggiungi messaggio assistente
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

  const handleSuggestion = useCallback((suggestion: string) => {
    sendMessage(suggestion);
  }, [sendMessage]);

  // ── Schermata di benvenuto ─────────────────────────────────────────────────
  const showWelcome = messages.length === 0 && !isLoading;

  return (
    <div className="flex h-full flex-col">
      {/* ── Area messaggi ──────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        {showWelcome ? (
          /* Welcome screen */
          <div className="flex h-full flex-col items-center justify-center gap-6 pb-8">
            {/* Icona / logo */}
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-linear-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/30">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-8 w-8"
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
              <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Ciao! Sono l&apos;Assistente di LocalHub
              </h2>
              <p className="mt-2 max-w-md text-[15px] leading-7 text-slate-500">
                Posso aiutarti a trovare negozi, servizi e attività locali.
                Dimmi cosa cerchi!
              </p>
            </div>

            {/* Chip suggerimenti */}
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[13px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 active:scale-95"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Lista messaggi */
          <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-2 sm:pt-0">
            {messages.map((message, index) => {
              // È l'ultimo messaggio assistente della lista?
              const isLastAssistant =
                message.role === "assistant" &&
                !messages.slice(index + 1).some((m) => m.role === "assistant");

              return (
                <div
                  key={message.id}
                  // scroll-mt garantisce almeno 28px di spazio visivo sopra
                  // la card quando viene portata in view dallo scrollIntoView
                  className={isLastAssistant ? "scroll-mt-7" : undefined}
                  ref={isLastAssistant ? lastAssistantRef : undefined}
                >
                  <AssistantMessage message={message} />
                </div>
              );
            })}

            {/* Typing indicator */}
            {isLoading && <TypingIndicator />}

            {/* Sentinel per lo scroll al fondo */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-3xl">
          <AssistantInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}
            placeholder="Chiedi qualcosa… es. farmacia aperta adesso, pizzeria in centro"
          />
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Premi <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">Enter</kbd> per inviare ·{" "}
            <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">Shift+Enter</kbd> per andare a capo
          </p>
        </div>
      </div>
    </div>
  );
}
