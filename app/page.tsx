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

{/* HERO — composizione blu istituzionale + fotografia Via Roma */}
      <section className="relative overflow-hidden rounded-b-[2rem] sm:rounded-b-[2.5rem] text-white shadow-lg shadow-slate-900/10">
        {/* Fotografia a tutta sezione: visibile e luminosa sul lato destro
            (desktop) e nella parte bassa (mobile), mai deformata. */}
        <img
          src="/hero-via-roma-castrovillari-1400x1050.jpg"
          alt="Via Roma a Castrovillari"
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        {/* Velo blu istituzionale con transizione morbida verso la fotografia:
            pieno a sinistra, sfuma gradualmente a destra (desktop) e verso il
            basso (mobile), senza coprire la foto con una macchia pesante. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(30,58,138,0.95)_0%,rgba(30,58,138,0.88)_30%,rgba(37,99,235,0.62)_50%,rgba(59,130,246,0.32)_68%,rgba(59,130,246,0)_100%)] md:bg-[linear-gradient(to_right,rgba(30,58,138,0.97)_0%,rgba(30,58,138,0.90)_28%,rgba(37,99,235,0.74)_50%,rgba(59,130,246,0.34)_66%,rgba(59,130,246,0)_78%)]"
        />

        <div className="relative z-10 mx-auto flex min-h-[460px] w-full max-w-7xl flex-col justify-center px-5 py-14 sm:min-h-[500px] sm:px-8 md:min-h-[560px] md:px-10 md:py-16">
          <div className="max-w-xl text-center md:max-w-lg md:text-left">
            <h1 className="mx-auto text-3xl font-black leading-[1.12] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(15,23,42,0.5)] sm:text-4xl md:mx-0 md:text-[2.75rem]">
              Tutto quello che cerchi... è già nella tua città.
            </h1>

            <p className="mx-auto mt-4 max-w-md text-sm font-medium text-blue-50 drop-shadow-[0_1px_6px_rgba(15,23,42,0.55)] sm:text-base md:mx-0">
              Trova negozi, professionisti, offerte e servizi locali in pochi secondi.
            </p>

            {/* Riga azioni homepage: ricerca + Assistente AI nello STESSO rigo
                (flex-nowrap, niente wrapping su mobile). Il pulsante AI è una
                normale azione della homepage: giallo, compatto, solo logo. */}
            <div className="mx-auto mt-8 flex max-w-xl items-center gap-2.5 sm:mt-10 sm:gap-3 md:mx-0">
              <form action="/ricerca" method="GET" className="min-w-0 flex-1">
                <div className="flex h-14 items-center rounded-full border border-white/70 bg-white/95 p-1.5 shadow-[0_18px_45px_-15px_rgba(15,23,42,0.55)] transition duration-200 hover:border-brand/40 hover:shadow-[0_20px_50px_-15px_rgba(37,99,235,0.45)] focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/25 sm:h-16">
                  <Search className="ml-3 h-5 w-5 shrink-0 text-slate-400 sm:ml-4 sm:h-6 sm:w-6" />
                  <input
                    type="text"
                    name="q"
                    placeholder="Cerca prodotto, negozio o servizio..."
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-slate-900 placeholder:text-slate-500 focus:outline-none sm:px-4 sm:text-base"
                  />
                  <button
                    type="submit"
                    className="hidden h-full shrink-0 items-center gap-2 rounded-full bg-brand px-6 text-sm font-bold text-white transition hover:bg-brand-dark active:scale-95 sm:inline-flex"
                  >
                    <Search className="h-4 w-4" />
                    Cerca
                  </button>
                  <button
                    type="submit"
                    aria-label="Cerca"
                    className="inline-flex h-full w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-dark active:scale-95 sm:hidden"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                </div>
              </form>

              {/* Assistente AI — accessibile SOLO dalla homepage */}
              <HomeAssistantButton className="h-14 w-14 sm:h-16 sm:w-16" />
            </div>
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
