import Header from "@/components/Header/Header";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default async function NegoziPage() {
  const { data: negozi, error } = await supabase
    .from("negozi")
    .select("*");

  return (
    <main className="min-h-screen bg-gray-100">
      <Header />

      <section className="max-w-7xl mx-auto px-6 py-16">
        <h1 className="text-5xl font-bold text-gray-900">
          Tutti i negozi
        </h1>

        <p className="mt-4 text-lg text-gray-600">
          Scopri le attività commerciali presenti su InCittà.
        </p>

        {error && (
          <p className="mt-6 text-red-600">
            Errore nel caricamento dei negozi.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {negozi?.map((negozio) => (
            <div
              key={negozio.id}
              className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition"
            >
              <div className="h-56 bg-blue-200 flex items-center justify-center text-7xl">
                🏪
              </div>

              <div className="p-6">
                <h2 className="text-2xl font-bold">
                  {negozio.nome}
                </h2>

                <p className="mt-2 text-blue-700 font-semibold">
                  {negozio.categoria}
                </p>

                <p className="mt-3 text-gray-600">
                  {negozio.descrizione}
                </p>

                <p className="mt-4 text-gray-500">
                  📍 {negozio.indirizzo}
                </p>

                <p className="mt-2 text-gray-500">
                  ☎ {negozio.telefono}
                </p>

                <Link href={`/negozio/${negozio.id}`}>
                  <button className="mt-6 w-full bg-blue-700 text-white py-3 rounded-xl hover:bg-blue-800 transition">
                    Visualizza negozio
                  </button>
                </Link>

              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}