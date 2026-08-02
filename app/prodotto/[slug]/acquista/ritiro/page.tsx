import { permanentRedirect } from "next/navigation";
import { risolviProdottoPubblico, getNegozio } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import RitiroForm from "@/components/acquista/RitiroForm";

type Params = { slug: string };

export default async function RitiroPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  const { prodotto, slugLegacy } = await risolviProdottoPubblico(slug);
  if (slugLegacy) permanentRedirect(`${slugLegacy}/acquista/ritiro`);
  if (!prodotto) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-600">Prodotto non trovato.</p>
      </div>
    );
  }

  const id = prodotto.id as string;
  const negozio = await getNegozio(String(prodotto.negozio_id));
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
    <RitiroForm
        prodottoId={id}
        nome={nome}
        prezzo={prezzo}
        imageUrl={imageUrl}
        negozio={negozio ? {
          nome: negozio.nome as string,
          indirizzo: (negozio.indirizzo as string) ?? null,
          telefono: (negozio.telefono as string) ?? null,
          whatsapp: (negozio.whatsapp as string) ?? null,
        } : null}
      />
  );
}
