import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import Header from "@/components/Header/Header";
import { getContenutiPubblici, formattaDataPubblicazione } from "@/lib/contenuti-pubblici";

export const metadata: Metadata = {
  title: "Contenuti | InCittà",
  description:
    "Articoli e contenuti editoriali della città: storie, approfondimenti e notizie dal territorio.",
};

export const dynamic = "force-dynamic";

export default async function ContenutiPage() {
  const contenuti = await getContenutiPubblici();

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        {/* ── Intestazione ─────────────────────────────────────────────── */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Contenuti
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Articoli e approfondimenti dal territorio di InCittà.
          </p>
        </div>

        {contenuti.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white px-6 py-16 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Newspaper className="h-8 w-8 text-blue-500" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">
              Nessun contenuto al momento
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Non ci sono ancora articoli pubblicati. Torna presto a trovarci.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              Torna alla home
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {contenuti.map((contenuto) => {
              const data = formattaDataPubblicazione(contenuto.pubblicato_il);
              return (
                <Link
                  key={contenuto.id}
                  href={`/contenuti/${contenuto.slug}`}
                  className="group flex flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  {contenuto.immagine_url && (
                    <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                      {/* Immagine come sfondo coprente (stesso pattern delle card negozi). */}
                      <div
                        role="img"
                        aria-label={contenuto.titolo}
                        className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-105"
                        style={{ backgroundImage: `url(${contenuto.immagine_url})` }}
                      />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-center gap-2">
                      {data && (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-blue-600">
                          {data}
                        </span>
                      )}
                      {contenuto.autore && (
                        <span className="text-[11px] text-slate-400">
                          di {contenuto.autore}
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-black leading-snug tracking-tight text-slate-900 transition group-hover:text-blue-700">
                      {contenuto.titolo}
                    </h2>

                    {contenuto.riassunto && (
                      <p className="mt-auto line-clamp-3 text-sm leading-6 text-slate-600">
                        {contenuto.riassunto}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}