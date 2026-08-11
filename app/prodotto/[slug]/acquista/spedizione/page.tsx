import { permanentRedirect } from "next/navigation";
import Link from "next/link";
import { risolviProdottoPubblico } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import { richiediVariantePerProdotto } from "@/lib/varianti-pubbliche";
import { getMetodiPagamentoPubblici } from "@/lib/pagamenti/metodi-pubblici";
import SpedizioneForm from "@/components/acquista/SpedizioneForm";

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

export default async function SpedizionePage({
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
  if (slugLegacy) permanentRedirect(`${slugLegacy}/acquista/spedizione`);
  if (!prodotto) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-600">Prodotto non trovato.</p>
      </div>
    );
  }

  const id = prodotto.id as string;
  const slugProdotto = (prodotto.slug as string) ?? id;
  const prezzo = Number("prezzo" in prodotto ? prodotto.prezzo : 0);
  const nome = "nome" in prodotto ? (prodotto.nome as string) : "Prodotto";

  // FASE E4 — varianti: varianteId obbligatorio e validato server-side per i
  // prodotti con varianti; legacy → nessun vincolo.
  const esitoVariante = await richiediVariantePerProdotto(id, varianteId);
  const varianteValida =
    esitoVariante.stato === "valida" ||
    esitoVariante.stato === "non_necessaria";

  if (!varianteValida) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-amber-800">
          Seleziona una variante del prodotto per continuare l&apos;acquisto.
        </p>
        <Link
          href={`/prodotto/${slugProdotto}`}
          className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          Torna al prodotto
        </Link>
      </div>
    );
  }

  const varianteIdProp =
    esitoVariante.stato === "valida" ? esitoVariante.variante.id : null;

  const imageUrl = getProdottoImmagine({
    immagine_principale: "immagine_principale" in prodotto
      ? (prodotto.immagine_principale as string | null)
      : null,
    categoria: "categoria" in prodotto
      ? (prodotto.categoria as string | null)
      : null,
  });

  // FASE F1 — metodi di pagamento REALMENTE disponibili per questo negozio
  // (carta solo se Stripe è configurato; bonifico solo se configurato).
  const esitoMetodi = await getMetodiPagamentoPubblici(String(prodotto.negozio_id));
  const metodiPagamento = esitoMetodi.ok ? esitoMetodi.metodi : [];

  return (
    <SpedizioneForm
        prodottoId={id}
        nome={nome}
        prezzo={prezzo}
        imageUrl={imageUrl}
        varianteId={varianteIdProp}
        metodiPagamento={metodiPagamento}
      />
  );
}
