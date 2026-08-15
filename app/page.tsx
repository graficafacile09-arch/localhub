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

      {/* HERO COMPATTO ED ELEGANTE */}
      <section className="relative overflow-hidden bg-blue-700 py-12 px-4 text-white md:py-16 rounded-b-[2rem] sm:rounded-b-[2.5rem] shadow-lg shadow-blue-900/10">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl md:text-4xl font-black tracking-tight">
            Tutto quello che cerchi... è già nella tua città.
          </h1>

          <p className="mt-3 text-sm md:text-base text-blue-100 max-w-xl mx-auto">
            Trova negozi, professionisti, offerte e servizi locali in pochi secondi.
          </p>

          {/* Riga azioni homepage: ricerca + Assistente AI nello STESSO rigo
              (flex-nowrap, niente wrapping su mobile). Il pulsante AI è una
              normale azione della homepage: giallo, compatto, solo logo. */}
          <div className="mt-6 mx-auto flex max-w-xl items-center gap-2 sm:gap-3">
            <form action="/ricerca" method="GET" className="min-w-0 flex-1">
              <div className="flex items-center rounded-full bg-white p-1.5 shadow-lg shadow-blue-900/20 transition focus-within:ring-2 focus-within:ring-yellow-400">
                <Search className="ml-3 h-5 w-5 shrink-0 text-slate-400" />
                <input
                  type="text"
                  name="q"
                  placeholder="Cerca prodotto, negozio o servizio..."
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95"
                >
                  <Search className="h-4 w-4" />
                  Cerca
                </button>
                <button
                  type="submit"
                  aria-label="Cerca"
                  className="sm:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition active:scale-95"
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
