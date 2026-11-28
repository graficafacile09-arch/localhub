import { Fragment } from "react";
import ShopResultCard from "./ShopResultCard";
import type { NegozioRicerca, ProdottoRicerca } from "@/lib/ricerca-ai";
import Link from "next/link";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import {
  etichettaNegoziTrovatiPino,
  etichettaProdottiTrovatiPino,
} from "@/lib/assistente/etichette-risultati";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  negozi?: NegozioRicerca[];
  prodotti?: ProdottoRicerca[];
  processingMs?: number;
  source?: "brain" | "fallback" | "assistente";
  /** Lingua della risposta di Pino: le etichette dei risultati la seguono. */
  lingua?: "it" | "en";
  /** Stato d'animo di Pino deciso dal risultato reale della ricerca (non dal testo). */
  mood?: "happy" | "sad" | "neutral";
}

interface AssistantMessageProps {
  message: ChatMessage;
}

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Tipografia compatta delle bolle di Pino: titoli mai giganti, corpo leggibile
// a 13px e link interni in smeraldo, riconoscibili come azione.
const CLASSE_TITOLO_CHAT =
  "mt-2.5 mb-1 text-[13.5px] font-bold leading-snug text-stone-900 first:mt-0";
const CLASSE_TESTO_CHAT = "text-[13px] leading-relaxed text-stone-700";
const CLASSE_LINK_INTERNO =
  "font-semibold text-emerald-700 underline decoration-emerald-400 underline-offset-2 transition hover:text-emerald-900";

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className={CLASSE_TITOLO_CHAT}>{children}</h1>,
  h2: ({ children }) => <h2 className={CLASSE_TITOLO_CHAT}>{children}</h2>,
  h3: ({ children }) => <h3 className={CLASSE_TITOLO_CHAT}>{children}</h3>,
  p: ({ children }) => (
    <p className={`mt-2 first:mt-0 ${CLASSE_TESTO_CHAT}`}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul className={`mt-1.5 list-disc space-y-1 pl-4 marker:text-emerald-600 ${CLASSE_TESTO_CHAT}`}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className={`mt-1.5 list-decimal space-y-1 pl-4 marker:font-semibold marker:text-emerald-700 ${CLASSE_TESTO_CHAT}`}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className={CLASSE_TESTO_CHAT}>{children}</li>,
  strong: ({ children }) => (
    <strong className="font-bold text-stone-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="font-medium text-stone-800">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className={`mt-2 rounded-lg border-l-2 border-emerald-400 bg-emerald-50/70 px-3 py-2 ${CLASSE_TESTO_CHAT}`}>
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => {
    // Prodotti e territori restano nella chat: link interno, navigazione diretta.
    if (href && href.startsWith("/")) {
      return (
        <Link
          href={href}
          onClick={() => window.dispatchEvent(new Event("assistant:close"))}
          className={CLASSE_LINK_INTERNO}
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-800"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
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
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white"
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
              {etichettaProdottiTrovatiPino(message.prodotti.length, message.lingua)}
            </p>
            <div className="grid grid-cols-2 gap-2 pb-1">
              {message.prodotti.map((prodotto) => (
                <Link
                  key={prodotto.id}
                  href={`/prodotto/${prodotto.slug}`}
                  onClick={() => window.dispatchEvent(new Event("assistant:close"))}
                  className="group flex gap-2.5 overflow-hidden rounded-xl border border-slate-100 bg-white p-2 transition hover:border-blue-200 hover:shadow-md"
                  aria-label={`Apri il prodotto ${prodotto.nome}`}
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    <div
                      role="img"
                      aria-label={prodotto.nome}
                      className="h-full w-full bg-cover bg-center transition duration-200 group-hover:scale-105"
                      style={{
                        backgroundImage: `url(${getProdottoImmagine({
                          immagine_principale: prodotto.immagine_principale,
                          categoria: prodotto.categoria,
                        })})`,
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-bold leading-tight text-slate-900 transition group-hover:text-blue-700">
                      {prodotto.nome}
                    </p>
                    <p className="mt-0.5 text-sm font-black text-blue-700">
                      {(() => {
                        const prezzo = Number(prodotto.prezzo);
                        if (!Number.isFinite(prezzo) || prezzo <= 0) {
                          return "Prezzo non disponibile";
                        }
                        return prodotto.ha_varianti
                          ? `A partire da €${prezzo}`
                          : `€${prezzo}`;
                      })()}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{prodotto.negozio_nome}</p>
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
              {etichettaNegoziTrovatiPino(message.negozi.length, message.lingua)}
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
            {message.source === "brain"
              ? "🧠 Brain"
              : message.source === "assistente"
                ? "🤖 Assistente"
                : "⚡ Ricerca"} · {message.processingMs}ms
          </p>
        )}
      </div>
    </div>
  );
}
