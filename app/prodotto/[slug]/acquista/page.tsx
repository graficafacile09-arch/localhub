import { permanentRedirect } from "next/navigation";
import { risolviProdottoPubblico, getNegozio } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import Link from "next/link";

function formatPrezzo(p: number): number {
  return Number(p);
}

type Params = { slug: string };

export default async function AcquistaChoicePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  const { prodotto, slugLegacy } = await risolviProdottoPubblico(slug);
  if (slugLegacy) permanentRedirect(`${slugLegacy}/acquista`);
  if (!prodotto) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-600">Prodotto non trovato.</p>
      </div>
    );
  }

  const id = prodotto.id as string;
  const slugProdotto = (prodotto.slug as string) ?? id;
  const negozio = await getNegozio(String(prodotto.negozio_id));
  const prezzo = formatPrezzo(
    "prezzo" in prodotto ? Number(prodotto.prezzo) : 0,
  );
  const nome = "nome" in prodotto ? (prodotto.nome as string) : "Prodotto";

  const imageUrl = getProdottoImmagine({
    immagine_principale: "immagine_principale" in prodotto
      ? (prodotto.immagine_principale as string | null)
      : null,
    categoria: "categoria" in prodotto
      ? (prodotto.categoria as string | null)
      : null,
  });

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl">
            <div className="relative aspect-square max-h-[400px] overflow-hidden bg-slate-100">
              <div
                role="img"
                aria-label={nome}
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${imageUrl})` }}
              />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-black text-slate-900">{nome}</h2>
            <p className="text-2xl font-black text-emerald-700">
              €{prezzo.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/prodotto/${slugProdotto}/acquista/ritiro`}
            className="group block rounded-xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-blue-400 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🏪</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                  Ritiro in negozio
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ritira gratuitamente presso il punto vendita.
                </p>
                <span className="mt-2 inline-block text-xs font-semibold text-blue-600">
                  Continua →
                </span>
              </div>
            </div>
          </Link>

          <Link
            href={`/prodotto/${slugProdotto}/acquista/spedizione`}
            className="group block rounded-xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-blue-400 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🚚</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                  Spedizione a domicilio
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ricevi il prodotto all'indirizzo desiderato.
                </p>
                <span className="mt-2 inline-block text-xs font-semibold text-blue-600">
                  Continua →
                </span>
              </div>
            </div>
          </Link>
        </div>
      </div>
  );
}
