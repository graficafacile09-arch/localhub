import Link from "next/link";
import Header from "@/components/Header/Header";
import BackLink from "@/components/ui/BackLink";
import { getNegozio, getProdottiNegozio } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import {
  getNegozioDemoById,
  getProdottiDemoByNegozioId,
} from "@/lib/negozi-demo";

export default async function PaginaNegozio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const negozioReale = await getNegozio(id);
  const negozioDemo = negozioReale ? null : getNegozioDemoById(id);
  const negozio = negozioReale ?? negozioDemo;

  if (!negozio) {
    return (
      <main className="min-h-screen bg-gray-100">
        <Header />
        <div className="max-w-5xl mx-auto py-20 text-center">
          <h1 className="text-4xl font-bold">
            Negozio non trovato
          </h1>
          <Link href="/negozi" className="mt-6 inline-block text-blue-700 hover:underline">
            Torna ai negozi
          </Link>
        </div>
      </main>
    );
  }

  const prodotti = negozioReale
    ? await getProdottiNegozio(id)
    : getProdottiDemoByNegozioId(id);

  console.log("================================");
  console.log("ID RICEVUTO:", id);
  console.log("NEGOZIO:", negozio);
  console.log("PRODOTTI:", prodotti);
  console.log("================================");

  return (
    <main className="min-h-screen bg-gray-100">
      <Header />

      <div className="max-w-6xl mx-auto py-10 px-6">

      <BackLink href="/negozi" label="Torna ai negozi" />

      <div className="overflow-hidden rounded-3xl bg-white shadow-lg">
        <div className="relative aspect-video max-h-135 overflow-hidden">
          <div
            role="img"
            aria-label={`Fotografia del negozio ${negozio.nome}`}
            className="h-full w-full bg-cover bg-center"
            style={{
              backgroundImage: `url(${getNegozioCardImmagine({
                immagine: negozio.immagine,
                categoria: negozio.categoria,
              })})`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/55 via-black/10 to-transparent" />
        </div>
      </div>

      <h1 className="text-5xl font-bold mt-8">
        {negozio.nome}
      </h1>

      <p className="text-xl text-gray-600 mt-4">
        {negozio.descrizione}
      </p>

      <div className="mt-8 space-y-3 text-lg">

        <p>📍 <strong>Indirizzo:</strong> {negozio.indirizzo}</p>

        <p>📞 <strong>Telefono:</strong> {negozio.telefono}</p>

        <p>✉️ <strong>Email:</strong> {negozio.email}</p>

        <p>💬 <strong>WhatsApp:</strong> {negozio.whatsapp}</p>

        <p>🌐 <strong>Sito Web:</strong> {negozio.sito_web}</p>

        <p>🕒 <strong>Orari:</strong> {negozio.orari}</p>

      </div>

      <section className="mt-16">

        <h2 className="text-3xl font-bold mb-8">
          I nostri prodotti
        </h2>

        {prodotti.length === 0 ? (
          <p className="text-red-600 text-xl">
            Nessun prodotto trovato.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">

            {prodotti.map((prodotto) => (

              <div
                key={prodotto.id}
                className="bg-white rounded-2xl shadow-lg p-6"
              >
                <h3 className="text-2xl font-bold">
                  {prodotto.nome}
                </h3>

                <p className="mt-2 text-gray-600">
                  {prodotto.descrizione}
                </p>

                <div className="flex justify-between mt-6">

                  <span className="text-blue-700 font-semibold">
                    {prodotto.categoria}
                  </span>

                  <span className="text-2xl font-bold">
                    € {prodotto.prezzo}
                  </span>

                </div>

              </div>

            ))}

          </div>
        )}

      </section>

      </div>
    </main>
  );
}