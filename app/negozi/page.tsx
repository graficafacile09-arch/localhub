import Header from "@/components/Header/Header";
import BackLink from "@/components/ui/BackLink";
import { negoziDemo } from "@/lib/negozi-demo";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default async function NegoziPage() {
  const { data: negozi, error } = await supabase
    .from("negozi")
    .select("*");

  const negoziCompleti = [...(negozi ?? []), ...negoziDemo];

  return (
    <main className="min-h-screen bg-gray-100">
      <Header />

      <section className="max-w-7xl mx-auto px-6 py-16">
        <BackLink href="/" label="Torna alla Home" />

        <h1 className="text-5xl font-bold text-gray-900">
          Tutti i negozi
        </h1>

        <p className="mt-4 text-lg text-gray-600">
          Scopri le attività commerciali presenti su InCittà.
        </p>

        {error && (
          <p className="mt-6 text-red-600">
            Errore nel caricamento dei negozi dal database. Ti mostro comunque alcune demo.
          </p>
        )}

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {negoziCompleti.map((negozio) => {
            const imageUrl = getNegozioCardImmagine({
              immagine: negozio.immagine,
              categoria: negozio.categoria,
            });

            return (
              <article
                key={negozio.id}
                className="group overflow-hidden rounded-[28px] bg-white shadow-[0_18px_50px_-18px_rgba(15,23,42,0.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_-22px_rgba(15,23,42,0.36)]"
              >
                <div className="relative aspect-video overflow-hidden">
                  <div
                    role="img"
                    aria-label={`Fotografia della categoria ${negozio.categoria}`}
                    className="h-full w-full bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-black/15 to-transparent" />
                </div>

                <div className="p-6">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {negozio.nome}
                  </h2>

                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">
                    {negozio.categoria}
                  </p>

                  <p className="mt-3 text-[15px] leading-7 text-slate-600">
                    {negozio.descrizione}
                  </p>

                  <p className="mt-5 text-sm text-slate-500">
                    <span className="font-semibold text-slate-700">Indirizzo:</span>{" "}
                    {negozio.indirizzo}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    <span className="font-semibold text-slate-700">Telefono:</span>{" "}
                    {negozio.telefono}
                  </p>

                  <Link
                    href={`/negozio/${negozio.id}`}
                    className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-blue-800"
                  >
                    Visualizza negozio
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
