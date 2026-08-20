import Header from "@/components/Header/Header";
import Link from "next/link";
import { Search } from "lucide-react";
import HomeAssistantButton from "@/components/assistant/HomeAssistantButton";
import { getCategorieConNegozi, getNegoziInEvidenza, getProdottiInEvidenza } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { chiavePreferito, getStatoPreferitiPerPagina } from "@/lib/cliente/favorites";
import FavoritoButton from "@/components/cliente/preferiti/FavoritoButton";
import CategoryTile, { TutteCategorieTile } from "@/components/home/CategoryTile";

// La homepage deve riflettere in tempo reale i negozi in evidenza flaggati
// dal merchant (il toggle "In evidenza" della dashboard), quindi non viene
// prerenderizzata staticamente a build.
export const dynamic = "force-dynamic";

// Numero di categorie mostrate in homepage (le altre sono in /categorie).
const NUMERO_CATEGORIE_HOME = 8;

export default async function Home() {
  const [negozi, prodottiInEvidenza, categorieConNegozi, statoPreferiti] = await Promise.all([
    getNegoziInEvidenza(8),
    getProdottiInEvidenza(8),
    getCategorieConNegozi(),
    getStatoPreferitiPerPagina(),
  ]);

  // Le categorie arrivano GIÀ ordinate alfabeticamente (A→Z) dalla fonte
  // unica lib/categorie-negozio.ts tramite getCategorieConNegozi(): nessun
  // secondo ordinamento qui, lo stesso elenco ordinato vale per /categorie.
  const categorieOrdinate = categorieConNegozi;

  return (
    <main className="min-h-screen bg-[#eef3f8]">
      <Header />

      {/* HERO FOTOGRAFICA — stessa altezza della vecchia fascia blu */}
      <section className="relative overflow-hidden rounded-b-[2rem] bg-slate-900 px-4 py-12 text-white shadow-lg shadow-slate-900/10 sm:rounded-b-[2.5rem] md:py-16">
        {/* La foto copre tutta la HERO e non ne determina l'altezza. */}
        <img
          src="/hero-via-roma-castrovillari-1400x1050.jpg"
          alt="Via Roma a Castrovillari"
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        {/* Gradiente leggero solo nella zona del testo: la parte bassa resta luminosa. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/20 to-transparent"
        />

        <div className="relative z-10 mx-auto max-w-4xl text-left">
          <h1 className="relative -top-4 text-2xl font-black tracking-tight drop-shadow-lg md:text-4xl">
            Tutto quello che cerchi... <span className="text-yellow-300">è già</span> nella tua città.
          </h1>

          <p className="mt-3 max-w-xl text-sm text-white drop-shadow-md md:text-base">
            Trova negozi, professionisti, offerte e servizi locali in pochi secondi.
          </p>

          {/* Motore di ricerca invariato: stessa action GET e stesso parametro q. */}
          <div className="mx-auto mt-6 flex max-w-xl items-center gap-2 sm:gap-3 md:mx-0">
            <form action="/ricerca" method="GET" className="min-w-0 flex-1">
              <div className="flex items-center rounded-full bg-white/95 p-1.5 shadow-lg shadow-black/25 transition focus-within:ring-2 focus-within:ring-yellow-300">
                <Search className="ml-3 h-5 w-5 shrink-0 text-slate-400 sm:ml-4" />
                <input
                  type="text"
                  name="q"
                  placeholder="Cerca prodotto, negozio o servizio..."
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none sm:px-4 sm:text-base"
                />
                <button
                  type="submit"
                  className="hidden shrink-0 items-center gap-2 rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-900 transition hover:bg-yellow-300 active:scale-95 sm:inline-flex"
                >
                  <Search className="h-4 w-4" />
                  Cerca
                </button>
                <button
                  type="submit"
                  aria-label="Cerca"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-blue-900 transition hover:bg-yellow-300 active:scale-95 sm:hidden"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </form>

            {/* Assistente AI — accessibile SOLO dalla homepage */}
            <HomeAssistantButton />
          </div>
        </div>
      </section>

      {/* CATEGORIE */}
      <section className="max-w-4xl mx-auto px-4 py-10 md:px-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px flex-1 bg-slate-200" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Categorie
          </h2>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 md:gap-3 lg:grid-cols-6">
          {categorieOrdinate.slice(0, NUMERO_CATEGORIE_HOME).map(({ categoria, count }, index) => (
            <CategoryTile key={categoria.id} categoria={categoria} index={index} count={count} />
          ))}
          <TutteCategorieTile index={NUMERO_CATEGORIE_HOME} />
        </div>
      </section>

      {/* ⭐ NEGOZI IN EVIDENZA (solo se ce ne sono) */}
      {negozi.length > 0 && (
        <section className="bg-white py-12 border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-slate-900">
                ⭐ Negozi in evidenza
              </h2>
              <Link
                href="/negozi?featured=1"
                className="text-blue-600 font-semibold text-sm hover:underline"
              >
                Vedi tutti &rarr;
              </Link>
            </div>

          <div className="grid md:grid-cols-3 gap-6">
            {negozi.map((negozio) => {
              const imageUrl = getNegozioCardImmagine({
                logo_url: negozio.logo_url,
                categoria: negozio.categoria,
              });

              return (
                <div
                  key={negozio.id}
                  className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <Link
                    href={`/negozio/${negozio.slug}`}
                    aria-label={`Vai al negozio ${negozio.nome}`}
                    className="group flex flex-1 flex-col justify-between"
                  >
                    <div>
                      <div className="relative w-full h-48 bg-slate-100 overflow-hidden">
                        <div
                          role="img"
                          aria-label={negozio.nome}
                          className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-105"
                          style={{ backgroundImage: `url(${imageUrl})` }}
                        />
                      </div>

                      <div className="p-5">
                        <h3 className="text-xl font-bold text-slate-900 transition group-hover:text-blue-700">
                          {negozio.nome}
                        </h3>

                        <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                          {negozio.descrizione || "Scopri le migliori offerte e prodotti selezionati."}
                        </p>
                      </div>
                    </div>

                    <div className="p-5 pt-0">
                      <span className="block w-full rounded-xl bg-yellow-400 py-2.5 text-center text-sm font-bold text-blue-900 shadow-sm transition group-hover:bg-yellow-300">
                        Scopri
                      </span>
                    </div>
                  </Link>

                  <FavoritoButton
                    tipo="negozio"
                    riferimentoId={negozio.id}
                    attivo={statoPreferiti.chiavi.has(chiavePreferito("negozio", negozio.id))}
                    autenticato={statoPreferiti.autenticato}
                    className="absolute right-2.5 top-2.5 z-10"
                    label={negozio.nome}
                  />
                </div>
              );
            })}
          </div>
          </div>
        </section>
      )}
    </main>
  );
}
