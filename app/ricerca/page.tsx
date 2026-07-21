import Header from "@/components/Header/Header";
import SearchForm from "@/components/home/SearchForm";
import BackLink from "@/components/ui/BackLink";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUpRight,
  MapPin,
  Phone,
  Sparkles,
  Store,
} from "lucide-react";
import { cercaNegozi } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { ricercaConAi } from "@/lib/ricerca-ai";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSearchTerms(query: string) {
  return Array.from(
    new Set(
      query
        .split(/\s+/)
        .map((termine) => termine.trim())
        .filter((termine) => termine.length >= 2)
    )
  );
}

function evidenziaTesto(testo: string | null | undefined, query: string): ReactNode {
  if (!testo) {
    return null;
  }

  const termini = getSearchTerms(query);

  if (termini.length === 0) {
    return testo;
  }

  const pattern = new RegExp(`(${termini.map(escapeRegExp).join("|")})`, "gi");
  const parti = testo.split(pattern);

  return parti.map((parte, indice) => {
    const eMatch = termini.some(
      (termine) => termine.toLowerCase() === parte.toLowerCase()
    );

    if (!eMatch) {
      return <Fragment key={`${parte}-${indice}`}>{parte}</Fragment>;
    }

    return (
      <mark
        key={`${parte}-${indice}`}
        className="rounded-lg bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900"
      >
        {parte}
      </mark>
    );
  });
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="mt-8 text-2xl font-black tracking-tight text-slate-950 first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-8 text-xl font-black tracking-tight text-slate-950 first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-6 text-lg font-bold text-slate-900 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-4 text-base leading-8 text-slate-700 first:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mt-5 space-y-3 text-slate-700">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-5 list-decimal space-y-3 pl-6 text-slate-700 marker:font-semibold marker:text-blue-600">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50 px-4 py-4 leading-7 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-blue-600 to-cyan-400" />
      <span className="block pl-3">{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-extrabold text-slate-950">{children}</strong>
  ),
  em: ({ children }) => <em className="font-medium text-blue-700">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="mt-5 rounded-2xl border-l-4 border-amber-400 bg-amber-50 px-5 py-4 text-slate-700 shadow-sm">
      {children}
    </blockquote>
  ),
  a: ({ children, ...props }) => (
    <a
      {...props}
      className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-800"
    >
      {children}
    </a>
  ),
};

export default async function RicercaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termine = q?.trim() ?? "";

  let negozi = termine ? await cercaNegozi(termine) : [];
  let rispostaAi: string | null = null;
  let erroreAi: string | null = null;

  if (termine) {
    try {
      const risultato = await ricercaConAi(termine);
      rispostaAi = risultato.risposta;
      if (negozi.length === 0 && risultato.negozi.length > 0) {
        negozi = risultato.negozi;
      }
    } catch (error) {
      erroreAi =
        error instanceof Error
          ? error.message
          : "Impossibile generare la risposta AI.";
    }
  }

  const migliorRisultato = negozi[0] ?? null;
  const altriNegozi = negozi.slice(1);

  return (
    <main className="min-h-screen bg-gray-100">
      <Header />

      <section className="max-w-7xl mx-auto px-6 py-8">
        <BackLink href="/" label="Torna alla Home" />

        <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
          Risultati ricerca
        </h1>

        <div className="mt-8">
          <SearchForm initialQuery={termine} />
        </div>

        {termine ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
              {negozi.length} risultat{negozi.length === 1 ? "o" : "i"} per
              <span className="ml-2 rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-100">
                {termine}
              </span>
            </div>
            <div className="inline-flex items-center rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 ring-1 ring-amber-100">
              Ricerca locale attiva
            </div>
          </div>
        ) : (
          <p className="mt-6 text-lg text-gray-600">
            Inserisci una parola chiave nella barra di ricerca.
          </p>
        )}

        {negozi.length > 0 && (
          <div className="mt-8 rounded-[2rem] border border-blue-100 bg-gradient-to-r from-blue-600 via-blue-600 to-cyan-500 p-5 text-white shadow-[0_20px_70px_rgba(37,99,235,0.18)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-100">
                  Negozi trovati
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Guarda il negozio
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
                  I primi risultati utili sono qui sotto, con link diretto alla
                  scheda del negozio.
                </p>
              </div>

              {negozi.length === 1 && (
                <Link
                  href={`/negozio/${negozi[0].id}`}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-2xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
                >
                  Guarda il negozio
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {negozi.slice(0, 3).map((negozio) => (
                <Link
                  key={negozio.id}
                  href={`/negozio/${negozio.id}`}
                  className="group rounded-[1.4rem] bg-white/12 p-4 ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-white/18"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black tracking-tight text-white">
                        {evidenziaTesto(negozio.nome, termine)}
                      </p>
                      {negozio.categoria && (
                        <p className="mt-1 text-sm font-medium text-blue-100">
                          {negozio.categoria}
                        </p>
                      )}
                    </div>
                    <div className="rounded-2xl bg-white/15 p-2 text-white ring-1 ring-white/15">
                      <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>

                  {negozio.indirizzo && (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-blue-50">
                      {negozio.indirizzo}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {erroreAi && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            <p className="font-semibold">Assistente AI non disponibile</p>
            <p className="mt-2 text-sm">{erroreAi}</p>
          </div>
        )}

        {termine && negozi.length === 0 && !rispostaAi && !erroreAi && (
          <p className="mt-8 text-gray-500">
            Nessun negozio trovato. Prova con un altro termine.
          </p>
        )}

        {migliorRisultato && (
          <div className="mt-10">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-600">
                  Miglior match
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                  Guarda questo negozio
                </h2>
              </div>
              <div className="inline-flex items-center self-start rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 ring-1 ring-amber-100">
                Primo risultato
              </div>
            </div>

            <Link
              href={`/negozio/${migliorRisultato.id}`}
              className="group block overflow-hidden rounded-[2rem] border border-amber-100 bg-white shadow-[0_24px_80px_rgba(245,158,11,0.16)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(37,99,235,0.16)]"
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
                <div className="relative min-h-[280px] overflow-hidden bg-gradient-to-br from-blue-100 via-cyan-50 to-amber-50">
                  <div
                    role="img"
                    aria-label={`Fotografia del negozio ${migliorRisultato.nome}`}
                    className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                    style={{
                      backgroundImage: `url(${getNegozioCardImmagine({
                        immagine: migliorRisultato.immagine,
                        categoria: migliorRisultato.categoria,
                      })})`,
                    }}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-900/10 to-transparent" />
                  <div className="absolute left-5 top-5 inline-flex items-center rounded-full bg-white/90 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-amber-700 shadow-sm ring-1 ring-white/80">
                    Miglior match
                  </div>
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">
                        Negozio
                      </p>
                      <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                        {evidenziaTesto(migliorRisultato.nome, termine)}
                      </h3>
                      {migliorRisultato.categoria && (
                        <p className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 ring-1 ring-blue-100">
                          {migliorRisultato.categoria}
                        </p>
                      )}
                    </div>
                    <div className="rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-500 p-3 text-white shadow-lg">
                      <ArrowUpRight className="h-5 w-5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>

                  <p className="mt-5 text-base leading-8 text-slate-600">
                    {migliorRisultato.descrizione
                      ? evidenziaTesto(migliorRisultato.descrizione, termine)
                      : "Scheda del negozio disponibile."}
                  </p>

                  <div className="mt-6 space-y-3">
                    {migliorRisultato.indirizzo && (
                      <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-100">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                        <span>{migliorRisultato.indirizzo}</span>
                      </div>
                    )}

                    {migliorRisultato.telefono && (
                      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-100">
                        <Phone className="h-4 w-4 shrink-0 text-blue-600" />
                        <span>{migliorRisultato.telefono}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20">
                    Guarda il negozio
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        )}

        {negozi.length > 0 && (
          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600">
                {altriNegozi.length > 0 ? "Altri negozi trovati" : "Negozi trovati"}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                {altriNegozi.length > 0
                  ? "Altri negozi"
                  : "Risultato disponibile"}
              </h2>
              <p className="mt-2 max-w-2xl text-slate-600">
                {altriNegozi.length > 0
                  ? "Altri negozi disponibili."
                  : "Il risultato principale e mostrato sopra."}
              </p>
            </div>

            <div className="inline-flex items-center self-start rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
              {altriNegozi.length > 0
                ? `${altriNegozi.length} altr${altriNegozi.length === 1 ? "o risultato" : "i risultati"}`
                : "Top risultato"}
            </div>
          </div>
        )}

        {altriNegozi.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
            {altriNegozi.map((negozio) => (
              <Link
                key={negozio.id}
                href={`/negozio/${negozio.id}`}
                className="group overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(37,99,235,0.16)]"
              >
                <div className="relative h-56 overflow-hidden bg-gradient-to-br from-blue-100 via-cyan-50 to-amber-50">
                  <div
                    role="img"
                    aria-label={`Fotografia del negozio ${negozio.nome}`}
                    className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                    style={{
                      backgroundImage: `url(${getNegozioCardImmagine({
                        immagine: negozio.immagine,
                        categoria: negozio.categoria,
                      })})`,
                    }}
                  />

                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/65 via-slate-900/15 to-transparent" />
                  {negozio.categoria && (
                    <div className="absolute left-4 top-4 inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-700 shadow-sm ring-1 ring-white/80 backdrop-blur-sm">
                      {negozio.categoria}
                    </div>
                  )}
                </div>

                <div className="p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight text-slate-950">
                        {evidenziaTesto(negozio.nome, termine)}
                      </h3>
                      <p className="mt-2 text-sm font-medium text-slate-500">
                        Scheda locale disponibile
                      </p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100">
                      <Store className="h-5 w-5" />
                    </div>
                  </div>

                  <p className="mt-4 min-h-24 text-[15px] leading-7 text-slate-600">
                    {negozio.descrizione
                      ? evidenziaTesto(negozio.descrizione, termine)
                      : "Dettagli in aggiornamento per questa attivita locale."}
                  </p>

                  <div className="mt-5 space-y-3">
                    {negozio.indirizzo && (
                      <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-100">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                        <span>{negozio.indirizzo}</span>
                      </div>
                    )}

                    {negozio.telefono && (
                      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-100">
                        <Phone className="h-4 w-4 shrink-0 text-blue-600" />
                        <span>{negozio.telefono}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition group-hover:brightness-110">
                    Guarda il negozio
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {rispostaAi && (
          <div className="mt-10 overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_20px_60px_rgba(37,99,235,0.12)]">
            <div className="flex flex-col gap-4 border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/80 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">
                    Approfondimento
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                    Dettagli utili sui risultati
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Se vuoi piu contesto, qui trovi una sintesi ordinata dopo i
                    link diretti ai negozi.
                  </p>
                </div>
              </div>

              {termine && (
                <span className="inline-flex items-center self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  Query: {termine}
                </span>
              )}
            </div>

            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="rounded-[1.5rem] bg-gradient-to-b from-white to-slate-50/70 p-1 ring-1 ring-slate-100">
                <div className="rounded-[1.3rem] bg-white px-5 py-5 sm:px-6 sm:py-6">
                  <div className="mb-5 flex flex-wrap gap-2">
                    {getSearchTerms(termine).slice(0, 4).map((termineChip) => (
                      <span
                        key={termineChip}
                        className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-700 ring-1 ring-cyan-100"
                      >
                        {termineChip}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {rispostaAi}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
