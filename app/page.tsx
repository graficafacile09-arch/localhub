import Header from "@/components/Header/Header";
import Link from "next/link";
import { Search } from "lucide-react";
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

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      {/* HERO COMPATTO ED ELEGANTE */}
      <section className="relative overflow-hidden bg-gradient-to-r from-blue-700 to-blue-600 py-10 md:py-14 text-white px-4 rounded-b-[2.5rem] sm:rounded-b-[3.5rem] md:rounded-b-[4.5rem] shadow-xl shadow-blue-900/20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl md:text-4xl font-black tracking-tight">
            Tutto quello che cerchi... è già nella tua città.
          </h1>

          <p className="mt-2 text-xs md:text-sm text-blue-100 max-w-xl mx-auto">
            Trova negozi, professionisti, offerte e servizi locali in pochi secondi.
          </p>

          <form action="/ricerca" method="GET" className="mt-6 max-w-xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-400 rounded-full opacity-0 group-focus-within:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative flex items-center bg-gradient-to-b from-yellow-300 to-yellow-400 rounded-full shadow-lg shadow-yellow-400/30 ring-1 ring-yellow-300 focus-within:ring-2 focus-within:ring-blue-400/50 focus-within:shadow-blue-500/20 transition-all duration-300 before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/25 before:to-transparent before:rounded-full before:pointer-events-none">
                <Search className="ml-5 h-5 w-5 text-blue-600 shrink-0" />
                <input
                  type="text"
                  name="q"
                  placeholder="Cerca prodotto, negozio o servizio..."
                  className="flex-1 bg-transparent px-4 py-3.5 sm:py-4 text-sm sm:text-base text-slate-900 placeholder:text-slate-600 focus:outline-none min-w-0"
                />
                <div className="hidden sm:block h-7 w-px bg-yellow-300 shrink-0" />
                <button type="submit" className="mr-2 my-2 hidden sm:inline-flex items-center gap-2 bg-gradient-to-b from-blue-500 to-blue-700 text-white font-semibold px-5 py-2 rounded-full text-sm transition-all duration-200 active:scale-95 shadow-[0_4px_12px_rgba(37,99,235,0.4)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.55)] relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/20 before:to-transparent before:rounded-full">
                  <Search className="h-4 w-4 relative" />
                  <span className="relative">Cerca</span>
                </button>
                <button type="submit" className="sm:hidden mr-2 my-2 inline-flex items-center justify-center h-9 w-9 bg-gradient-to-b from-blue-500 to-blue-700 text-white rounded-full transition-all duration-200 active:scale-95 shadow-[0_4px_12px_rgba(37,99,235,0.4)] shrink-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/20 before:to-transparent before:rounded-full">
                  <Search className="h-4 w-4 relative" />
                </button>
              </div>
            </div>
          </form>
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
          {categorieConNegozi.slice(0, NUMERO_CATEGORIE_HOME).map(({ categoria, count }, index) => (
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
                  className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-white hover:shadow-sm transition flex flex-col justify-between"
                >
                  <div>
                    <div className="relative w-full h-48 bg-slate-100 overflow-hidden">
                      <div
                        role="img"
                        aria-label={negozio.nome}
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${imageUrl})` }}
                      />
                    </div>

                    <div className="p-5">
                      <h3 className="text-xl font-bold text-slate-900">
                        {negozio.nome}
                      </h3>

                      <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                        {negozio.descrizione || "Scopri le migliori offerte e prodotti selezionati."}
                      </p>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <Link href={`/negozio/${negozio.slug}`}>
                      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm transition">
                        Scopri
                      </button>
                    </Link>
                  </div>

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
