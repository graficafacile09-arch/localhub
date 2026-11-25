import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, MapPin } from "lucide-react";
import Header from "@/components/Header/Header";
import ProdottoTerritorioCard from "@/components/territorio/ProdottoTerritorioCard";
import RaccontoTerritorio from "@/components/territorio/RaccontoTerritorio";
import {
  getTerritorio,
  LOGHI_RICONOSCIMENTO,
  SLUG_TERRITORI,
  TERRITORI,
} from "@/lib/territori";
import { getProdottiTerritorio } from "@/lib/territori-prodotti";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import { getSiteUrl } from "@/lib/site";
import { breadcrumbList, jsonLdSerializzato } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return SLUG_TERRITORI.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const territorio = getTerritorio(slug);
  if (!territorio) return { title: "Territorio non trovato" };

  const canonical = `${getSiteUrl()}/territorio/${territorio.slug}`;
  return {
    title: `${territorio.nome} — Territorio`,
    description: territorio.sommario,
    alternates: { canonical },
    openGraph: {
      title: `${territorio.nome} — Territorio`,
      description: territorio.sommario,
      url: canonical,
      type: "website",
      siteName: "Radici Calabria",
      images: [{ url: territorio.immagine.src, alt: territorio.immagine.alt }],
    },
  };
}

export default async function TerritorioDettaglioPage({ params }: Props) {
  const { slug } = await params;
  const territorio = getTerritorio(slug);
  if (!territorio) notFound();

  const [prodotti, statoPreferiti] = await Promise.all([
    getProdottiTerritorio(territorio.prodotti),
    getStatoPreferitiPerPagina(),
  ]);

  const ordine = new Map(territorio.prodotti.map((p, indice) => [p.slug, indice]));
  prodotti.sort(
    (a, b) => (ordine.get(String(a.slug)) ?? 0) - (ordine.get(String(b.slug)) ?? 0)
  );

  const altriTerritori = TERRITORI.filter(
    (t) => t.gruppo === territorio.gruppo && t.slug !== territorio.slug
  ).sort((a, b) => a.ordine - b.ordine);

  const base = getSiteUrl();
  const territorioJsonLd = jsonLdSerializzato({
    "@graph": [
      {
        "@type": "TouristDestination",
        "@id": `${base}/territorio/${territorio.slug}#destinazione`,
        name: territorio.nome,
        url: `${base}/territorio/${territorio.slug}`,
        description: territorio.sommario,
        image: `${base}${territorio.immagine.src}`,
        touristType: territorio.gruppo,
        containedInPlace: { "@type": "Place", name: "Calabria, Italia" },
      },
      breadcrumbList([
        { nome: "Home", path: "/" },
        { nome: "Territorio", path: "/territorio" },
        { nome: territorio.nome, path: `/territorio/${territorio.slug}` },
      ]),
    ],
  });

  return (
    <main className="min-h-screen bg-slate-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: territorioJsonLd }} />
      <Header />

      <article className="w-full py-4 md:py-8">
        <div className="px-3 sm:px-5">
          <Link
            href="/#territorio"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Scopri i territori
          </Link>
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:items-stretch lg:gap-6">
          {/* Fotografia con titolo e racconto in sovrimpressione */}
          <section
            aria-labelledby="titolo-territorio"
            className="relative isolate flex min-h-[440px] flex-col overflow-hidden bg-slate-900 sm:min-h-[500px] lg:min-h-[600px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={territorio.immagine.src}
              alt={territorio.immagine.alt}
              className="absolute inset-0 -z-20 h-full w-full object-cover"
              loading="eager"
            />
            {/* Velo SOLO dietro il testo in alto: il resto della fotografia
                resta libero e pieno di colore. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.92)_0%,rgba(2,6,23,0.8)_30%,rgba(2,6,23,0.38)_56%,transparent_80%)]"
            />

            <div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-10 lg:px-10 lg:pb-10 lg:pt-14">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-white/75">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {territorio.gruppo}
              </p>
              {/* Nome del luogo in una forma gialla, come la CTA della scheda */}
              <h1
                id="titolo-territorio"
                className="mt-4 flex w-fit max-w-full items-center rounded-lg bg-yellow-400 px-3 py-1.5 text-xl font-black leading-tight tracking-tight text-blue-950 shadow-sm sm:text-2xl lg:text-3xl"
              >
                {territorio.nome}
              </h1>

              <div className="max-w-[44rem]">
                <RaccontoTerritorio paragrafi={territorio.racconto} variante="scura" />
              </div>
            </div>
          </section>

          {/* Prodotti del territorio: nessun titolo, le schede salgono a filo della foto */}
          <section
            aria-label={`Prodotti di ${territorio.nome}`}
            className="flex flex-col px-3 sm:px-5 lg:pl-0 lg:pr-6"
          >
            {prodotti.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-0">
                {prodotti.map((prodotto) => {
                  const prodottoId = String(prodotto.id);
                  return (
                    <ProdottoTerritorioCard
                      key={prodottoId}
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
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm lg:mt-0">
                I prodotti di {territorio.nome} non sono disponibili in questo momento.
              </div>
            )}
          </section>
        </div>

        {/* Riconoscimenti */}
        <section className="mx-3 mt-6 rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm sm:mx-5 md:p-8">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-700" aria-hidden />
            <h2 className="text-lg font-black tracking-tight text-slate-900 md:text-xl">
              Riconoscimenti
            </h2>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
            DOP, IGP e STG sono denominazioni europee; PAT è un riconoscimento regionale; DE.CO. è
            una denominazione comunale.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {territorio.riconoscimenti.map((r, indice) => {
              const logo = LOGHI_RICONOSCIMENTO[r.sigla];
              return (
                <li
                  key={`${r.sigla}-${indice}`}
                  className="flex gap-3 rounded-2xl border border-yellow-200 bg-yellow-50/70 p-3"
                >
                  {logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logo.src}
                      alt={logo.alt}
                      className="mt-0.5 h-9 w-9 shrink-0 object-contain"
                    />
                  ) : (
                    <span className="mt-0.5 inline-flex h-7 shrink-0 items-center rounded-md bg-yellow-400 px-2 text-[11px] font-black tracking-wide text-blue-950">
                      {r.sigla}
                    </span>
                  )}
                  <p className="text-sm leading-6 text-slate-700">{r.descrizione}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {altriTerritori.length > 0 && (
          <nav aria-label={`Altri territori: ${territorio.gruppo}`} className="mx-3 mt-6 sm:mx-5">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
              Altri territori — {territorio.gruppo}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {altriTerritori.map((altro) => (
                <li key={altro.slug}>
                  <Link
                    href={`/territorio/${altro.slug}`}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-yellow-300 hover:text-blue-800"
                  >
                    {altro.nome}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
    </main>
  );
}
