import Header from "@/components/Header/Header";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { getNegoziInEvidenza, getProdottiInEvidenza } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";

export default async function Home() {
  const [negozi, prodottiInEvidenza] = await Promise.all([
    getNegoziInEvidenza(6),
    getProdottiInEvidenza(8),
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      {/* HERO COMPATTO ED ELEGANTE */}
      <section className="bg-gradient-to-r from-blue-700 to-blue-600 py-10 md:py-14 text-white px-4">
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

        <div className="grid grid-cols-4 gap-2 md:gap-3">
          <Link href="/ricerca?q=Negozi" className="group flex flex-col items-center gap-2 rounded-xl bg-white p-3 md:p-4 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 ring-1 ring-slate-100">
            <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 transition-all duration-200 group-hover:from-blue-50 group-hover:to-blue-100 group-hover:scale-110">
              <Image src="/icons/store.png" alt="" width={24} height={24} className="md:w-7 md:h-7" />
            </div>
            <span className="text-[11px] md:text-xs font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Negozi</span>
          </Link>

          <Link href="/ricerca?q=Food" className="group flex flex-col items-center gap-2 rounded-xl bg-white p-3 md:p-4 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 ring-1 ring-slate-100">
            <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 transition-all duration-200 group-hover:from-orange-50 group-hover:to-orange-100 group-hover:scale-110">
              <Image src="/icons/food.png" alt="" width={24} height={24} className="md:w-7 md:h-7" />
            </div>
            <span className="text-[11px] md:text-xs font-semibold text-slate-700 group-hover:text-orange-500 transition-colors">Food</span>
          </Link>

          <Link href="/ricerca?q=Moda" className="group flex flex-col items-center gap-2 rounded-xl bg-white p-3 md:p-4 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 ring-1 ring-slate-100">
            <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 transition-all duration-200 group-hover:from-fuchsia-50 group-hover:to-fuchsia-100 group-hover:scale-110">
              <Image src="/icons/fashion.png" alt="" width={24} height={24} className="md:w-7 md:h-7" />
            </div>
            <span className="text-[11px] md:text-xs font-semibold text-slate-700 group-hover:text-fuchsia-500 transition-colors">Moda</span>
          </Link>

          <Link href="/ricerca?q=Servizi" className="group flex flex-col items-center gap-2 rounded-xl bg-white p-3 md:p-4 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 ring-1 ring-slate-100">
            <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 transition-all duration-200 group-hover:from-slate-100 group-hover:to-slate-200 group-hover:scale-110">
              <Image src="/icons/services.png" alt="" width={24} height={24} className="md:w-7 md:h-7" />
            </div>
            <span className="text-[11px] md:text-xs font-semibold text-slate-700 group-hover:text-slate-600 transition-colors">Servizi</span>
          </Link>
        </div>
      </section>

      {/* ATTIVITÀ IN EVIDENZA */}
      <section className="bg-white py-12 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-slate-900">
              Attività in evidenza
            </h2>
            <Link href="/negozi" className="text-blue-600 font-semibold text-sm hover:underline">
              Vedi tutti i negozi &rarr;
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
                  className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-white hover:shadow-sm transition flex flex-col justify-between"
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
                    <Link href={`/negozio/${negozio.id}`}>
                      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm transition">
                        Scopri
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
