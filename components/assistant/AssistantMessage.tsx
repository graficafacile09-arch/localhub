import { Fragment } from "react";
import ShopResultCard from "./ShopResultCard";
import type { NegozioRicerca, ProdottoRicerca } from "@/lib/ricerca-ai";
import Link from "next/link";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  negozi?: NegozioRicerca[];
  prodotti?: ProdottoRicerca[];
  processingMs?: number;
  source?: "brain" | "fallback";
}

interface AssistantMessageProps {
  message: ChatMessage;
}

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="mt-4 text-base font-black tracking-tight text-slate-950 first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-3 text-sm font-black tracking-tight text-slate-950 first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-2 text-sm font-bold text-slate-900 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-2 text-[13px] leading-5 text-slate-700 first:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mt-2 space-y-1 text-slate-700">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-700 marker:font-semibold marker:text-blue-600">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-[13px] leading-5 text-slate-700">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-extrabold text-slate-950">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="font-medium text-blue-700">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-2 rounded-lg border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-[13px] text-slate-700">
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
    <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px] font-mono text-slate-800">
      {children}
    </code>
  ),
};

export default function AssistantMessage({ message }: AssistantMessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl rounded-tr-sm bg-blue-600 px-3 py-2 text-white">
          <p className="text-[13px] leading-5 whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 text-white"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {message.content && (
          <div className="rounded-xl rounded-tl-sm bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/80">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Prodotti trovati */}
        {message.prodotti && message.prodotti.length > 0 && (
          <Fragment>
            <p className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {message.prodotti.length} prodott{message.prodotti.length === 1 ? "o trovato" : "i trovati"}
            </p>
            <div className="grid grid-cols-2 gap-1.5 pb-1">
              {message.prodotti.map((prodotto) => (
                <Link
                  key={prodotto.id}
                  href={`/prodotto/${prodotto.slug}`}
                  className="flex gap-2 overflow-hidden rounded-lg border border-slate-100 bg-white p-1.5 transition hover:border-blue-200 hover:shadow-sm"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-100">
                    <div
                      role="img"
                      aria-label={prodotto.nome}
                      className="h-full w-full bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${getProdottoImmagine({
                          immagine_principale: prodotto.immagine_principale,
                          categoria: prodotto.categoria,
                        })})`,
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-[11px] font-bold text-slate-900">{prodotto.nome}</p>
                    <p className="text-[11px] font-black text-blue-700">€{prodotto.prezzo}</p>
                    <p className="line-clamp-1 text-[9px] text-slate-400">{prodotto.negozio_nome}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Fragment>
        )}

        {/* Negozi trovati */}
        {message.negozi && message.negozi.length > 0 && (
          <Fragment>
            <p className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {message.negozi.length} negoz{message.negozi.length === 1 ? "io trovato" : "i trovati"}
            </p>
            <div className="grid grid-cols-1 gap-1.5 pb-1">
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

        {message.processingMs !== undefined && (
          <p className="ml-1 text-[10px] text-slate-400">
            {message.source === "brain" ? "🧠 Brain" : "⚡ Ricerca"} · {message.processingMs}ms
          </p>
        )}
      </div>
    </div>
  );
}
