"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AssistantMessage, { type ChatMessage } from "./AssistantMessage";
import AssistantInput from "./AssistantInput";
import TypingIndicator from "./TypingIndicator";
import type { SearchResult } from "@/lib/search-service";

const SUGGESTIONS = [
  "Pizzeria vicino al centro",
  "Farmacia aperta adesso",
  "Divano grigio per il salotto",
  "Parrucchiere uomo Castrovillari",
];

let _idCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++_idCounter}`;
}

export default function AssistantPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const assistantCountRef = useRef(0);

  // Cronologia recente + sessionId (contratto di /api/assistente: il backend
  // è stateless, la storia recente è il veicolo del contesto).
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionIdRef = useRef<string>(
    `ass-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  // Query iniziale passata dalla barra di ricerca (pulsante ✨): viene inviata
  // automaticamente all'apertura, così l'utente non deve riscriverla.
  const pendingInitialRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      setIsOpen(true);
      const query = (e as CustomEvent<{ initialQuery?: string }>).detail?.initialQuery?.trim();
      if (query) pendingInitialRef.current = query;
    };
    window.addEventListener("assistant:open", handleOpen);
    return () => window.removeEventListener("assistant:open", handleOpen);
  }, []);

  // Chiusura da eventi globali: i link dei risultati (card negozio/prodotto)
  // dispatchano "assistant:close" prima di navigare, così il pannello non
  // resta aperto sopra la pagina di destinazione.
  useEffect(() => {
    const handleClose = () => setIsOpen(false);
    window.addEventListener("assistant:close", handleClose);
    return () => window.removeEventListener("assistant:close", handleClose);
  }, []);

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

    // L'Assistente usa l'endpoint dedicato /api/assistente (Gemini): la
    // ricerca normale resta 100% database, l'AI parte SOLO da qui (pulsante
    // esplicito). Si invia la cronologia recente per mantenere il contesto.
    const storico = [
      ...messagesRef.current.slice(-7).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: termine },
    ];

    try {
      const response = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: storico, sessionId: sessionIdRef.current }),
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

      if (!content && data.negozi.length === 0 && data.prodotti.length === 0) {
        content =
          "Non ho trovato risultati corrispondenti alla tua ricerca. Prova con termini diversi.";
      }

      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content,
        negozi: data.negozi.length > 0 ? data.negozi : undefined,
        prodotti: data.prodotti.length > 0 ? data.prodotti : undefined,
        processingMs: data.processingMs,
        source: (data.source as ChatMessage["source"]) ?? "assistente",
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Si è verificato un errore.";

      const errorMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: `**Si è verificato un errore**\n\n${message}\n\nRiprova tra qualche secondo.`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Al primo render con il pannello aperto e una query in attesa, inviala.
  useEffect(() => {
    if (!isOpen) return;
    const q = pendingInitialRef.current;
    if (q) {
      pendingInitialRef.current = null;
      sendMessage(q);
    }
  }, [isOpen, sendMessage]);

  const handleSend = useCallback(() => {
    sendMessage(inputValue);
  }, [inputValue, sendMessage]);

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage(suggestion);
    },
    [sendMessage]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-sm sm:bg-black/10"
        onClick={() => setIsOpen(false)}
        aria-hidden
      />

      {/* Panel */}
      <div className="fixed bottom-0 right-0 z-[80] flex h-[85dvh] w-full flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:bottom-4 sm:right-4 sm:h-[70dvh] sm:w-[400px] sm:rounded-2xl sm:border">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-slate-900">Assistente AI</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-yellow-400 px-3 text-blue-800 shadow-sm transition hover:bg-yellow-300 active:scale-95"
            aria-label="Chiudi assistente"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm font-bold leading-none">Chiudi</span>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
          {messages.length === 0 && !isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <div className="text-center">
                <h2 className="text-sm font-bold text-slate-900">
                  Ciao! Sono l&apos;Assistente di InCittà
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Cerca negozi e prodotti nella tua città.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-3 pt-3 pb-3">
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

        {/* Input */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 pt-2 pb-3">
          <AssistantInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}
            placeholder="Chiedi qualcosa..."
          />
        </div>
      </div>
    </>
  );
}
