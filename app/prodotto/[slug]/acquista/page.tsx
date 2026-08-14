import { permanentRedirect } from "next/navigation";
import { risolviProdottoPubblico, getNegozio } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { richiediVariantePerProdotto } from "@/lib/varianti-pubbliche";
import Link from "next/link";

function formatPrezzo(p: number): number {
  return Number(p);
}

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

export default async function AcquistaChoicePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const varianteIdRaw = sp.varianteId;
  const varianteId =
    typeof varianteIdRaw === "string" && varianteIdRaw.trim()
      ? varianteIdRaw.trim()
      : null;

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

  // FASE E4 — varianti: per i prodotti con varianti il varianteId è
  // OBBLIGATORIO e viene validato server-side (esistenza, appartenenza al
  // prodotto, variante attiva). I prodotti legacy non richiedono variante.
  const esitoVariante = await richiediVariantePerProdotto(id, varianteId);
  const varianteValida =
    esitoVariante.stato === "valida" ||
    esitoVariante.stato === "non_necessaria";

  if (!varianteValida) {
    return (
      <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-yellow-800">
          Seleziona una variante del prodotto per continuare l&apos;acquisto.
        </p>
        <Link
          href={`/prodotto/${slugProdotto}`}
          className="mt-4 inline-block rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:bg-yellow-300"
        >
          Torna al prodotto
        </Link>
      </div>
    );
  }

  const qs =
    esitoVariante.stato === "valida"
      ? `?varianteId=${encodeURIComponent(esitoVariante.variante.id)}`
      : "";

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
            <p className="text-2xl font-black text-blue-700">
              €{prezzo.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/prodotto/${slugProdotto}/acquista/ritiro${qs}`}
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
            href={`/prodotto/${slugProdotto}/acquista/spedizione${qs}`}
            className="group block rounded-xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-blue-400 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🚚</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                  Spedizione a domicilio
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ricevi il prodotto all&apos;indirizzo desiderato.
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
