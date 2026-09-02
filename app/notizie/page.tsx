import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Newspaper } from "lucide-react";
import Header from "@/components/Header/Header";
import {
  formattaDataNotizia,
  getNotiziePubbliche,
} from "@/lib/notizie-pubbliche";
import { CATEGORIE_NOTIZIE } from "@/lib/notizie/types";

export const metadata: Metadata = {
  title: "Notizie CV | InCittà",
  description:
    "Le notizie di Castrovillari raccolte automaticamente da fonti istituzionali e pubbliche: Comune, Provincia, Regione, Parco del Pollino e Protezione Civile.",
};

export const revalidate = 900;

export default async function NotiziePage() {
  const notizie = await getNotiziePubbliche();

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        {/* ── Intestazione ─────────────────────────────────────────────── */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Notizie <span className="text-yellow-500">CV</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Aggregatore automatico di notizie su Castrovillari da fonti
            istituzionali e pubbliche. Ogni notizia rimanda alla fonte
            originale.
          </p>
        </div>

        {/* ── Categorie ───────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="rounded-full bg-yellow-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-900">
            Tutte
          </span>
          {CATEGORIE_NOTIZIE.map((categoria) => (
            <span
              key={categoria}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500"
            >
              {categoria}
            </span>
          ))}
        </div>

        {/* ── Elenco notizie ──────────────────────────────────────────── */}
        {notizie.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-50">
              <Newspaper className="h-8 w-8 text-yellow-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
              Non ci sono ancora notizie disponibili.
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              L&apos;aggregatore raccoglie le notizie di Castrovillari
              periodicamente. Torna presto a trovarci.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-sm font-bold text-slate-900 transition hover:bg-yellow-300"
            >
              Torna alla home
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {notizie.map((notizia) => {
              const data = formattaDataNotizia(notizia.publishedAt);
              return (
                <article
                  key={notizia.id}
                  className="flex flex-col rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-yellow-200 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {notizia.category && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {notizia.category}
                      </span>
                    )}
                    {data && (
                      <span className="text-[11px] text-slate-400">{data}</span>
                    )}
                  </div>

                  <h2 className="mt-3 text-base font-black leading-snug tracking-tight text-slate-900">
                    {notizia.title}
                  </h2>

                  {notizia.excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                      {notizia.excerpt}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                    <span className="min-w-0 truncate text-[11px] font-semibold text-slate-400">
                      {notizia.sourceName}
                    </span>
                    <a
                      href={notizia.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-yellow-400 px-3 py-1.5 text-[11px] font-bold text-slate-900 transition hover:bg-yellow-300"
                    >
                      Leggi la fonte
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}