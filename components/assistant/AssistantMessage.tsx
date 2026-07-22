/**
 * LocalHub Assistant — AssistantMessage
 *
 * Renderizza un singolo messaggio nella chat.
 * - Messaggi utente: bolla destra, sfondo ambra
 * - Messaggi assistente: bolla sinistra, sfondo bianco + Markdown + ShopResultCard
 *
 * @module components/assistant/AssistantMessage
 */

import { Fragment } from "react";
import ShopResultCard from "./ShopResultCard";
import type { NegozioRicerca } from "@/lib/ricerca-ai";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  negozi?: NegozioRicerca[];
  /** Tempo di elaborazione ms (solo messaggi assistant) */
  processingMs?: number;
  /** Sorgente (brain | fallback) */
  source?: "brain" | "fallback";
}

interface AssistantMessageProps {
  message: ChatMessage;
}

// ─── Markdown parser minimalista ──────────────────────────────────────────────
// Evita dipendenze esterne (react-markdown già presente nel progetto, ma
// il requisito dice "nessuna libreria aggiuntiva" — usiamo quella già installata
// solo se il progetto la ha; altrimenti implementiamo un subset sufficiente).
// Poiché react-markdown e remark-gfm sono già in package.json, li usiamo.

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="mt-6 text-xl font-black tracking-tight text-slate-950 first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-5 text-lg font-black tracking-tight text-slate-950 first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-4 text-base font-bold text-slate-900 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-3 text-[15px] leading-7 text-slate-700 first:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mt-3 space-y-2 text-slate-700">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700 marker:font-semibold marker:text-blue-600">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50 px-3 py-2.5 text-[14px] leading-6 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-gradient-to-b from-blue-600 to-cyan-400" />
      <span className="block pl-2">{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-extrabold text-slate-950">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="font-medium text-blue-700">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-4 rounded-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-slate-700 shadow-sm">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-800"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-mono text-slate-800">
      {children}
    </code>
  ),
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AssistantMessage({ message }: AssistantMessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-blue-600 via-blue-600 to-cyan-500 px-4 py-3 text-white shadow-sm">
          <p className="text-[15px] leading-7 whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // ── Messaggio assistente ─────────────────────────────────────────────────
  return (
    <div className="flex items-start gap-3">
      {/* Avatar AI */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-linear-to-r from-blue-600 to-cyan-500 text-white shadow-sm"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
          />
        </svg>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Bolla testo */}
        {message.content && (
          <div className="rounded-2xl rounded-tl-sm bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200/80">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Grid di ShopResultCard */}
        {message.negozi && message.negozi.length > 0 && (
          <Fragment>
            <p className="ml-1 text-[12px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {message.negozi.length}{" "}
              {message.negozi.length === 1 ? "negozio trovato" : "negozi trovati"}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {message.negozi.map((negozio, index) => (
                <ShopResultCard
                  key={negozio.id}
                  negozio={negozio}
                  rank={index + 1}
                />
              ))}
            </div>
          </Fragment>
        )}

        {/* Meta: source + processing time */}
        {message.processingMs !== undefined && (
          <p className="ml-1 text-[11px] text-slate-400">
            {message.source === "brain" ? "🧠 Brain" : "⚡ Ricerca veloce"} ·{" "}
            {message.processingMs}ms
          </p>
        )}
      </div>
    </div>
  );
}
