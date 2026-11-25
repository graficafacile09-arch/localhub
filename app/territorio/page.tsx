import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import { GRUPPI_TERRITORI, ORDINE_GRUPPI, territoriDelGruppo } from "@/lib/territori";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  // Il layout aggiunge già "| Radici Calabria" (template "%s | nome sito").
  title: "Territorio",
  description:
    "Parchi, aree territoriali e comuni tra paesaggio, storia e produzioni tipiche: le schede dei territori di Radici Calabria.",
  openGraph: {
    title: "Territorio",
    description:
      "Parchi, aree territoriali e comuni tra paesaggio, storia e produzioni tipiche: le schede dei territori di Radici Calabria.",
    url: `${getSiteUrl()}/territorio`,
    type: "website",
    siteName: "Radici Calabria",
  },
  alternates: { canonical: `${getSiteUrl()}/territorio` },
};

/**
 * SEZIONE TERRITORIO — aperta dalla voce "Territorio" della navigazione.
 *
 * Non è un secondo elenco: legge gli stessi dati della fascia Territorio in
 * homepage (`lib/territori.ts`) e ne usa lo stesso ordine condiviso
 * (`ORDINE_GRUPPI` / `territoriDelGruppo`): Parchi, Aree territoriali, Comuni,
 * con i nomi in ordine alfabetico dentro ogni gruppo.
 * Ogni voce porta alla scheda già esistente /territorio/[slug].
 *
 * Le schede riprendono la resa della fascia in homepage: fotografia del
 * territorio a tutta card con velo scuro in basso, nome in targhetta gialla
 * (blu del logo per il testo) e rimandi in blu: niente riquadri grigi.
 */
export default function TerritorioPage() {
  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Scopri"
        titolo="Territorio"
        icona={MapPin}
        idTitolo="titolo-territorio"
        sommario="Parchi, aree territoriali e comuni tra paesaggio, storia e produzioni tipiche."
      />

      <div className="rd-guscio py-8 md:py-12">

        {ORDINE_GRUPPI.map((gruppo) => {
          const territori = territoriDelGruppo(gruppo);
          const descrizione = GRUPPI_TERRITORI.find((g) => g.titolo === gruppo)?.descrizione;
          const idGruppo = `gruppo-${gruppo.toLowerCase().replace(/\s+/g, "-")}`;

          return (
            <section key={gruppo} aria-labelledby={idGruppo} className="mt-10 first:mt-0 md:mt-14">
              <h2
                id={idGruppo}
                className="rd-titolo-sezione flex flex-wrap items-center gap-2 text-xl md:text-2xl"
              >
                <MapPin className="h-4 w-4 text-[#8a5a3b]" aria-hidden />
                {gruppo}
              </h2>
              {descrizione && (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#57534e]">{descrizione}</p>
              )}

              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {territori.map((territorio) => (
                  <li key={territorio.slug}>
                    <Link
                      href={`/territorio/${territorio.slug}`}
                      className="rd-scheda group h-full"
                    >
                      {/* Fotografia del territorio, stessa resa della fascia in homepage */}
                      <span className="relative isolate flex h-40 w-full items-end overflow-hidden bg-slate-900 sm:h-44">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={territorio.immagine.src}
                          alt={territorio.immagine.alt}
                          loading="lazy"
                          className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-300 motion-safe:group-hover:scale-105"
                        />
                        {/* Velo SOLO dietro il testo in basso: la parte alta della foto resta libera */}
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(2,6,23,0.92)_0%,rgba(2,6,23,0.62)_42%,transparent_78%)]"
                        />

                        <span className="block p-3">
                          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/85">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {territorio.gruppo}
                          </span>
                          {/* Nome del luogo nella forma gialla già usata nel sito */}
                          <span className="mt-2 flex w-fit max-w-full items-center rounded-lg bg-[#d5a83a] px-2.5 py-1 text-base font-black leading-tight tracking-tight text-[#1b3624] shadow-sm sm:text-lg">
                            {territorio.nome}
                          </span>
                        </span>
                      </span>

                      <span className="flex flex-1 flex-col justify-between p-4">
                        <span className="block text-sm leading-6 text-[#57534e]">
                          {territorio.sommario}
                        </span>
                        <span className="rd-link-freccia mt-4">
                          Apri la scheda completa
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
