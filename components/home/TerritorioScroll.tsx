import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { TERRITORI_ORDINATI } from "@/lib/territori";
import type { ProdottoCardTerritorio } from "@/lib/territori-prodotti";
import ProdottoTerritorioCard from "@/components/territorio/ProdottoTerritorioCard";
import RaccontoTerritorio from "@/components/territorio/RaccontoTerritorio";
import { chiavePreferito } from "@/lib/cliente/favorites";

type Props = {
  /** Prodotti di tutti i territori, letti in un'unica query dal catalogo. */
  prodotti: ProdottoCardTerritorio[];
  statoPreferiti: { autenticato: boolean; chiavi: Set<string> };
};

/**
 * TERRITORIO IN HOMEPAGE — le schede APERTE dei dieci territori, impilate in
 * verticale sopra "Eccellenze calabresi".
 *
 * Ogni slide è la stessa scheda aperta della pagina /territorio/[slug]:
 * fotografia a tutta card con gruppo, titolo in serif e racconto in
 * sovrimpressione, affiancata dai prodotti del territorio (sotto su mobile).
 * Il testo resta tagliato a fine frase con "Mostra tutto il testo".
 *
 * Resa allineata al resto della homepage: intestazione di sezione con
 * etichetta + titolo + rimando, schede bianche arrotondate con bordo sottile
 * e ombra leggera (radius-lg, --shadow-card), CTA gialla per l'azione
 * principale e nessun blu di riempimento sopra la fotografia.
 */
export default function TerritorioScroll({ prodotti, statoPreferiti }: Props) {
  const perSlug = new Map(prodotti.map((prodotto) => [String(prodotto.slug), prodotto]));

  return (
    <section
      id="territorio"
      aria-labelledby="titolo-territorio-home"
      className="mx-auto max-w-[1800px] scroll-mt-24 px-4 pt-10 md:px-6 md:pt-14"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="section-label flex items-center gap-1.5 font-black text-slate-700">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Scopri
          </p>
          <h2
            id="titolo-territorio-home"
            className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-3xl"
          >
            Territorio
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Parchi, aree territoriali e comuni tra paesaggio, storia e produzioni tipiche.
          </p>
        </div>
        <Link
          href="/territorio"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-blue-700 transition hover:text-blue-900 hover:underline"
        >
          Tutti i territori
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 md:gap-6" role="list" aria-label="Territori di Radici Calabria">
        {TERRITORI_ORDINATI.map((territorio) => {
          const prodottiTerritorio = territorio.prodotti
            .map((prodotto) => perSlug.get(prodotto.slug))
            .filter((prodotto): prodotto is ProdottoCardTerritorio => Boolean(prodotto));

          return (
            <article
              key={territorio.slug}
              role="listitem"
              className="group w-full overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
                {/* Fotografia a filo della scheda: gli angoli li taglia il
                    contenitore arrotondato, così non serve altro markup. */}
                <section className="relative isolate flex min-h-[400px] flex-col justify-end overflow-hidden bg-slate-900 sm:min-h-[460px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={territorio.immagine.src}
                    alt={territorio.immagine.alt}
                    className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  {/* Velo SOLO dietro il testo in basso: la parte alta della
                      fotografia resta libera e piena di colore. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(2,6,23,0.92)_0%,rgba(2,6,23,0.8)_28%,rgba(2,6,23,0.4)_52%,transparent_76%)]"
                  />

                  <div className="p-5 sm:p-7 lg:p-8">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-white/75">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {territorio.gruppo}
                    </p>
                    {/* Nome del luogo in una forma gialla, come la CTA della scheda */}
                    {/* Stesso oro del pulsante-lente della barra di ricerca
                        (#d5a83a): il nome e la CTA della scheda usano l'oro
                        del brand, non il giallo vivo delle altre pillole. */}
                    <h3 className="mt-4 flex w-fit max-w-full items-center rounded-lg bg-gold px-3 py-1.5 text-lg font-black leading-tight tracking-tight text-forest-deep shadow-sm sm:text-xl lg:text-2xl">
                      {territorio.nome}
                    </h3>

                    <div className="max-w-[44rem]">
                      <RaccontoTerritorio paragrafi={territorio.racconto} variante="scura" />
                    </div>

                    <Link
                      href={`/territorio/${territorio.slug}`}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-2 text-xs font-black text-forest-deep shadow-[0_4px_14px_-4px_rgba(213,168,58,0.45)] transition hover:bg-[#c1962f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                    >
                      Apri la scheda completa
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                </section>

                {/* Prodotti del territorio, a filo della foto */}
                <section
                  aria-label={`Prodotti di ${territorio.nome}`}
                  className="flex flex-col border-t border-slate-100 p-3 sm:p-4 lg:border-l lg:border-t-0"
                >
                  {prodottiTerritorio.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      {prodottiTerritorio.map((prodotto) => {
                        const prodottoId = String(prodotto.id);
                        return (
                          <ProdottoTerritorioCard
                            key={`${territorio.slug}-${prodottoId}`}
                            id={prodottoId}
                            slug={String(prodotto.slug ?? prodottoId)}
                            nome={String(prodotto.nome ?? "")}
                            descrizione={(prodotto.descrizione as string) ?? null}
                            prezzo={prodotto.prezzo as number}
                            categoria={(prodotto.categoria as string) ?? null}
                            immagine_principale={(prodotto.immagine_principale as string) ?? null}
                            haVarianti={Boolean(prodotto.ha_varianti)}
                            preferitoAttivo={statoPreferiti.chiavi.has(
                              chiavePreferito("prodotto", prodottoId)
                            )}
                            autenticato={statoPreferiti.autenticato}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-600">
                      I prodotti di {territorio.nome} non sono disponibili in questo momento.
                    </div>
                  )}
                </section>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
