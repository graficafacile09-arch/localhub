import SearchBar from "./SearchBar";

export default function Hero() {
  return (
    <section className="bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 text-white">

      <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">

        <div className="max-w-4xl mx-auto text-center">

          <span className="inline-block bg-white/20 backdrop-blur-sm px-5 py-2 rounded-full text-sm font-semibold mb-6">
            🇮🇹 Acquista nella tua città
          </span>

          <h1 className="text-2xl sm:text-3xl md:text-6xl font-extrabold leading-tight">
            Tutto quello che cerchi...
          </h1>

          <h2 className="text-2xl sm:text-3xl md:text-6xl font-extrabold mt-2 text-yellow-300 leading-tight">
            è già nella tua città.
          </h2>

          <p className="mt-6 text-base sm:text-lg md:text-xl text-blue-100 max-w-3xl mx-auto">
            Trova negozi, prodotti, professionisti, offerte e servizi locali
            in pochi secondi.
          </p>

          <div className="mt-10">
            <SearchBar />
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">

            {[
              "🍕 Pizza",
              "🥖 Pane",
              "💊 Farmacia",
              "👕 Moda",
              "☕ Bar",
              "🚗 Auto",
            ].map((item) => (
              <button
                key={item}
                className="bg-white/15 hover:bg-white/25 backdrop-blur-sm px-5 py-2 rounded-full transition"
              >
                {item}
              </button>
            ))}

          </div>

        </div>

      </div>

    </section>
  );
}