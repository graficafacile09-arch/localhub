import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Newspaper, UserRound } from "lucide-react";
import Header from "@/components/Header/Header";
import {
  getContenutoPubblicoBySlug,
  formattaDataPubblicazione,
} from "@/lib/contenuti-pubblici";
import { getSiteUrl } from "@/lib/site";

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const contenuto = await getContenutoPubblicoBySlug(slug);
  if (!contenuto) return { title: "Contenuto non trovato | InCittà" };

  const titolo = contenuto.titolo || "Contenuto";
  const descrizione =
    (contenuto.riassunto ?? "").slice(0, 155) || `Leggi ${titolo} su InCittà.`;
  const canonical = `${getSiteUrl()}/contenuti/${contenuto.slug}`;

  return {
    title: `${titolo} | InCittà`,
    description: descrizione,
    alternates: { canonical },
    openGraph: {
      title: `${titolo} | InCittà`,
      description: descrizione,
      url: canonical,
      type: "article",
      siteName: "InCittà",
      ...(contenuto.immagine_url ? { images: [contenuto.immagine_url] } : {}),
    },
  };
}

export const dynamic = "force-dynamic";

export default async function ContenutoDettaglioPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const contenuto = await getContenutoPubblicoBySlug(slug);

  // 404 standard: slug inesistente oppure contenuto NON pubblicato
  // (bozza/archiviato). Il filtro stato='pubblicato' è nella query, quindi
  // è impossibile ottenere un contenuto interno cambiando l'URL.
  if (!contenuto) {
    notFound();
  }

  const data = formattaDataPubblicazione(contenuto.pubblicato_il);

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <Link
          href="/contenuti"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Tutti i contenuti
        </Link>

        <article className="mt-5 overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm">
          {contenuto.immagine_url && (
            <div className="relative h-56 w-full bg-slate-100 sm:h-72">
              <div
                role="img"
                aria-label={contenuto.titolo}
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${contenuto.immagine_url})` }}
              />
            </div>
          )}

          <div className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {data && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {data}
                </span>
              )}
              {contenuto.autore && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                  {contenuto.autore}
                </span>
              )}
            </div>

            <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-slate-900 md:text-3xl">
              {contenuto.titolo}
            </h1>

            {contenuto.riassunto && (
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                {contenuto.riassunto}
              </p>
            )}

            {/* Il corpo è testo semplice salvato dagli admin (textarea, niente
                HTML/markdown): renderizzato con whitespace pre-wrap, stesso
                pattern di AssistantMessage. Nessun dangerouslySetInnerHTML:
                nessuna pipeline di sanitizzazione HTML esiste nel progetto. */}
            <div className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">
              {contenuto.corpo}
            </div>
          </div>
        </article>

        <div className="mt-6 flex items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-6 text-center shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Newspaper className="h-4 w-4 text-blue-500" aria-hidden />
            Vuoi altri approfondimenti?
            <Link
              href="/contenuti"
              className="font-bold text-blue-600 transition hover:text-blue-500"
            >
              Scopri tutti i contenuti
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}