import Header from "@/components/Header/Header";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100">

      <Header />

      {/* HERO */}

      <section className="bg-gradient-to-r from-blue-700 to-blue-500 py-24 text-white">

        <div className="max-w-6xl mx-auto px-6 text-center">

          <h1 className="text-6xl font-extrabold">
            Tutto quello che cerchi...
          </h1>

          <h2 className="text-6xl font-extrabold mt-2">
            è già nella tua città.
          </h2>

          <p className="mt-8 text-xl text-blue-100 max-w-3xl mx-auto">
            LocalHub ti permette di trovare negozi, professionisti,
            offerte, servizi e attività locali in pochi secondi.
          </p>

          <div className="mt-14 flex flex-col md:flex-row gap-4 justify-center">

            <input
              type="text"
              placeholder="Cerca un prodotto, un negozio o un servizio..."
              className="bg-white rounded-xl p-5 text-black text-lg shadow-xl w-full md:w-[650px]"
            />

            <button className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-10 rounded-xl transition">
              Cerca
            </button>

          </div>

        </div>

      </section>

      {/* CATEGORIE */}

      <section className="max-w-7xl mx-auto py-20 px-6">

        <h2 className="text-4xl font-bold text-center mb-12">
          Esplora le categorie
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">

          <div className="bg-white rounded-3xl shadow-lg p-10 text-center hover:shadow-2xl hover:-translate-y-2 transition">
            <div className="text-6xl">🛍️</div>
            <h3 className="mt-6 text-xl font-bold">
              Negozi
            </h3>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-10 text-center hover:shadow-2xl hover:-translate-y-2 transition">
            <div className="text-6xl">🍕</div>
            <h3 className="mt-6 text-xl font-bold">
              Food
            </h3>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-10 text-center hover:shadow-2xl hover:-translate-y-2 transition">
            <div className="text-6xl">👕</div>
            <h3 className="mt-6 text-xl font-bold">
              Moda
            </h3>
          </div>

          <div className="bg-white rounded-3xl shadow-lg p-10 text-center hover:shadow-2xl hover:-translate-y-2 transition">
            <div className="text-6xl">🔧</div>
            <h3 className="mt-6 text-xl font-bold">
              Servizi
            </h3>
          </div>

        </div>

      </section>

      {/* ATTIVITÀ IN EVIDENZA */}

      <section className="bg-white py-20">

        <div className="max-w-7xl mx-auto px-6">

          <h2 className="text-4xl font-bold mb-12">
            🔥 Attività in evidenza
          </h2>

          <div className="grid md:grid-cols-3 gap-8">

            <div className="rounded-3xl overflow-hidden shadow-xl bg-gray-50">
              <div className="h-56 bg-blue-200 flex items-center justify-center text-6xl">
                🥖
              </div>

              <div className="p-8">
                <h3 className="text-2xl font-bold">
                  Panificio Rossi
                </h3>

                <p className="mt-3 text-gray-600">
                  Pane fresco, dolci e prodotti artigianali ogni giorno.
                </p>

                <button className="mt-6 bg-blue-700 text-white px-6 py-3 rounded-xl">
                  Scopri
                </button>
              </div>
            </div>

            <div className="rounded-3xl overflow-hidden shadow-xl bg-gray-50">
              <div className="h-56 bg-pink-200 flex items-center justify-center text-6xl">
                👗
              </div>

              <div className="p-8">
                <h3 className="text-2xl font-bold">
                  Fashion Style
                </h3>

                <p className="mt-3 text-gray-600">
                  Abbigliamento uomo, donna e accessori.
                </p>

                <button className="mt-6 bg-blue-700 text-white px-6 py-3 rounded-xl">
                  Scopri
                </button>
              </div>
            </div>

            <div className="rounded-3xl overflow-hidden shadow-xl bg-gray-50">
              <div className="h-56 bg-green-200 flex items-center justify-center text-6xl">
                💻
              </div>

              <div className="p-8">
                <h3 className="text-2xl font-bold">
                  Tech Store
                </h3>

                <p className="mt-3 text-gray-600">
                  Smartphone, PC, assistenza tecnica e accessori.
                </p>

                <button className="mt-6 bg-blue-700 text-white px-6 py-3 rounded-xl">
                  Scopri
                </button>
              </div>
            </div>

          </div>

        </div>

      </section>

    </main>
  );
}