import { permanentRedirect } from "next/navigation";
import { risolviProdottoPubblico } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import SpedizioneForm from "@/components/acquista/SpedizioneForm";

type Params = { slug: string };

export default async function SpedizionePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

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
  const prezzo = Number("prezzo" in prodotto ? prodotto.prezzo : 0);
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
    <SpedizioneForm
        prodottoId={id}
        nome={nome}
        prezzo={prezzo}
        imageUrl={imageUrl}
      />
  );
}
