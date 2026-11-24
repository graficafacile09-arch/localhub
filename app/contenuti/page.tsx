import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import { getContenutiPubblici, formattaDataPubblicazione } from "@/lib/contenuti-pubblici";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  // title senza suffisso "| Radici Calabria": lo aggiunge il template del layout.
  title: "Contenuti",
  description:
    "Articoli e contenuti editoriali della città: storie, approfondimenti e notizie dal territorio.",
  alternates: {
    canonical: `${getSiteUrl()}/contenuti`,
  },
};

export const dynamic = "force-dynamic";

export default async function ContenutiPage() {
  const contenuti = await getContenutiPubblici();

  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Dal territorio"
        titolo="Contenuti"
        icona={Newspaper}
        sommario="Articoli e approfondimenti dal territorio di Radici Calabria."
      />

      <div className="rd-guscio py-7 md:py-10">
        {contenuti.length === 0 ? (
          <div className="rd-fascia flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4efe4] ring-1 ring-[#e5ded0]">
              <Newspaper className="h-8 w-8 text-[#8a5a3b]" aria-hidden />
            </div>
            <h2 className="rd-titolo-scheda mt-4 text-lg">
              Nessun contenuto al momento
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-[#57534e]">
              Non ci sono ancora articoli pubblicati. Torna presto a trovarci.
            </p>
            <Link
              href="/"
              className="rd-azione mt-6"
            >
              Torna alla home
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {contenuti.map((contenuto) => {
              const data = formattaDataPubblicazione(contenuto.pubblicato_il);
              return (
                <Link
                  key={contenuto.id}
                  href={`/contenuti/${contenuto.slug}`}
                  className="rd-scheda group"
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
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8a5a3b]">
                          {data}
                        </span>
                      )}
                      {contenuto.autore && (
                        <span className="text-[11px] text-[#8a8378]">
                          di {contenuto.autore}
                        </span>
                      )}
                    </div>

                    <h2 className="rd-titolo-scheda mt-1 text-[1.05rem] transition group-hover:text-[#24462f]">
                      {contenuto.titolo}
                    </h2>

                    {contenuto.riassunto && (
                      <p className="mt-auto line-clamp-3 text-sm leading-6 text-[#57534e]">
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