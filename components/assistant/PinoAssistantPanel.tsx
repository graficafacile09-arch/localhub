"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AssistantMessage, { type ChatMessage } from "@/components/assistant/AssistantMessage";
import AssistantInput from "@/components/assistant/AssistantInput";
import TypingIndicator from "@/components/assistant/TypingIndicator";
import type { SearchResult } from "@/lib/search-service";

type StatoPino = "neutral" | "searching" | "happy" | "sad";

const PINO_SPRITE = "/pino-sprite.jpg";

const SUGGESTIONS = [
  "Pizzeria vicino al centro",
  "Farmacia aperta adesso",
  "Negozi di abbigliamento",
  "Ristorante per stasera",
];

let idCounter = 0;
const nextId = () => `pino-${Date.now()}-${++idCounter}`;

function PinoVisual({ state, className = "" }: { state: StatoPino; className?: string }) {
  const searching = state === "searching";
  const effectivePosition = state === "happy" ? "0% 0%" : state === "sad" ? "100% 0%" : "50% 0%";

  return (
    <div
      aria-hidden
      className={`overflow-hidden bg-no-repeat ${searching ? "animate-pulse" : ""} ${className}`}
      style={{
        backgroundImage: `url(${PINO_SPRITE})`,
        backgroundSize: "300% 100%",
        backgroundPosition: effectivePosition,
      }}
    />
  );
}

export default function PinoAssistantPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<StatoPino>("neutral");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const loadingRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const sessionRef = useRef(`pino-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const openHandler = (event: Event) => {
      const query = (event as CustomEvent<{ initialQuery?: string }>).detail?.initialQuery?.trim() ?? "";
      if (query) pendingRef.current = query;
      setOpen(true);
    };
    window.addEventListener("pino:open", openHandler);
    return () => window.removeEventListener("pino:open", openHandler);
  }, []);

  const send = useCallback(async (value: string) => {
    const query = value.trim();
    if (!query || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setState("searching");
    setInput("");

    const userMessage: ChatMessage = { id: nextId(), role: "user", content: query };
    setMessages(prev => [...prev, userMessage]);

    const history = [
      ...messagesRef.current.slice(-7).map(m => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: query },
    ];

    try {
      const response = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, sessionId: sessionRef.current }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { error?: string }).error ?? `Errore HTTP ${response.status}`);
      }

      const data = await response.json() as SearchResult;
      const hasResults = (data.negozi?.length ?? 0) > 0 || (data.prodotti?.length ?? 0) > 0;
      setState(hasResults ? "happy" : "sad");

      let content = data.risposta?.trim() ?? "";
      if (!content && hasResults) {
        const total = (data.negozi?.length ?? 0) + (data.prodotti?.length ?? 0);
        content = `Ho trovato qualcosa per te! Ci sono ${total} risultati pertinenti.`;
      }
      if (!content && !hasResults) {
        content = "Mi dispiace, non ho trovato risultati. Proviamo a formulare la ricerca in un altro modo?";
      }

      setMessages(prev => [...prev, {
        id: nextId(),
        role: "assistant",
        content,
        negozi: data.negozi?.length ? data.negozi : undefined,
        prodotti: data.prodotti?.length ? data.prodotti : undefined,
        processingMs: data.processingMs,
        source: (data.source as ChatMessage["source"]) ?? "assistente",
      }]);
    } catch (error) {
      setState("sad");
      setMessages(prev => [...prev, {
        id: nextId(),
        role: "assistant",
        content: `Non riesco a completare la ricerca in questo momento. ${error instanceof Error ? error.message : "Riprova tra poco."}`,
      }]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !pendingRef.current) return;
    const query = pendingRef.current;
    pendingRef.current = null;
    void send(query);
  }, [open, send]);

  const close = () => {
    setOpen(false);
    setState("neutral");
  };

  return (
    <>
      <div className="fixed bottom-[76px] right-4 z-[85] sm:bottom-5 sm:right-5">
        {open && (
          <section
            aria-label="Assistente Pino"
            className="mb-3 flex h-[min(70dvh,620px)] w-[min(calc(100vw-2rem),410px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <PinoVisual state={state} className="h-10 w-7 shrink-0" />
                <div>
                  <p className="text-sm font-black text-slate-900">Pino</p>
                  <p className="text-[11px] text-slate-500">
                    {state === "searching" ? "Sto cercando..." : state === "happy" ? "Ho trovato qualcosa!" : state === "sad" ? "Proviamo insieme..." : "Il tuo assistente di InCittà"}
                  </p>
                </div>
              </div>
              <button type="button" onClick={close} aria-label="Chiudi Pino" className="rounded-full px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">Chiudi</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {messages.length === 0 && !loading ? (
                <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                  <PinoVisual state="neutral" className="h-40 w-[100px]" />
                  <h2 className="mt-2 text-base font-black text-slate-900">Ciao! Sono Pino.</h2>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Posso aiutarti a trovare negozi, prodotti e servizi nella tua città.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map(suggestion => (
                      <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">{suggestion}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map(message => <AssistantMessage key={message.id} message={message} />)}
                  {loading && <TypingIndicator />}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-100 p-3">
              <AssistantInput value={input} onChange={setInput} onSend={() => void send(input)} isLoading={loading} placeholder="Cosa posso cercare per te?" />
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-label={open ? "Chiudi Pino" : "Apri Pino, assistente di InCittà"}
          title="Pino — assistente di InCittà"
          className="group ml-auto flex h-[68px] w-[68px] items-end justify-center rounded-full bg-white/95 p-1 shadow-xl ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:h-[76px] sm:w-[76px]"
        >
          <PinoVisual state={state} className="h-full w-[48px] sm:w-[54px]" />
        </button>
      </div>
    </>
  );
}
