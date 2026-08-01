import { getProdotto, getNegozio } from "@/lib/negozi";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import AcquistaLayout from "../layout";
import RitiroForm from "@/components/acquista/RitiroForm";

async function getProductData(id: string) {
  const prodotto = await getProdotto(id);

  if (!prodotto) return null;

  const negozio = await getNegozio(String(prodotto.negozio_id));
  const prezzo = Number("prezzo" in prodotto ? prodotto.prezzo : 0);

  return { prodotto, negozio, prezzo };
}

export default async function RitiroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getProductData(id);

  if (!data) {
    return (
      <AcquistaLayout>
        <div className="py-12 text-center">
          <p className="text-slate-600">Prodotto non trovato.</p>
        </div>
      </AcquistaLayout>
    );
  }

  const { prodotto, negozio, prezzo } = data;
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
    <AcquistaLayout>
      <RitiroForm
        prodottoId={id}
        nome={nome}
        prezzo={prezzo}
        imageUrl={imageUrl}
        negozio={negozio ? {
          nome: negozio.nome,
          indirizzo: negozio.indirizzo,
          telefono: negozio.telefono,
          whatsapp: negozio.whatsapp,
        } : null}
      />
    </AcquistaLayout>
  );
}
