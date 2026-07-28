import { getProdotto, getNegozio } from "@/lib/negozi";
import { getProdottoDemoById } from "@/lib/negozi-demo";
import AcquistaLayout from "./layout";
import { DeliveryOptionCard } from "@/components/prodotti/DeliveryOptionCard";
import { ProductImage } from "@/components/prodotti/ProductImage";
import { PriceDisplay } from "@/components/prodotti/PriceDisplay";
import { QuantitySelector } from "@/components/prodotti/QuantitySelector";
import { OrderSummary } from "@/components/prodotti/OrderSummary";

function formatPrezzo(p: number): number {
  return Number(p);
}

async function getProductData(id: string) {
  const prodottoReale = await getProdotto(id);
  const prodottoDemo = prodottoReale ? null : getProdottoDemoById(id);
  const prodotto = prodottoReale ?? prodottoDemo;

  if (!prodotto) return null;

  const negozio = await getNegozio(String(prodotto.negozio_id));
  const prezzo = formatPrezzo(
    "prezzo" in prodotto ? Number(prodotto.prezzo) : 0,
  );
  const quantita = "quantita_disponibile" in prodotto ? Number(prodotto.quantita_disponibile) : null;

  return { prodotto, negozio, prezzo, quantita };
}

export default async function AcquistaPage({
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

  const { prodotto, negozio, prezzo, quantita } = data;
  const nome = "nome" in prodotto ? (prodotto.nome as string) : "Prodotto";
  const disponibile = quantita !== null && quantita > 0;

  return (
    <AcquistaLayout>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <ProductImage
            prodottoId={prodotto.id}
            categoria={
              "categoria" in prodotto ? (prodotto.categoria as string | null) : null
            }
            nome={nome}
          />

          <div>
            <h2 className="text-lg font-black text-slate-900">{nome}</h2>
            <PriceDisplay price={prezzo} />
            {quantita !== null && (
              <p className="mt-1 text-xs text-slate-500">
                {disponibile ? `${quantita} disponibili` : "Non disponibile"}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">Quantità</h3>
            <div className="mt-3">
              <QuantitySelector
                value={1}
                onChange={() => {}}
                min={1}
                max={disponibile ? (quantita ?? 1) : 1}
              />
            </div>
          </div>

          <OrderSummary
            items={[
              {
                nome,
                prezzo,
                quantita: 1,
              },
            ]}
          />

          <div className="space-y-3">
            <DeliveryOptionCard
              icon="🏪"
              title="Ritiro in negozio"
              description={`Ritira il tuo ordine presso ${negozio?.nome ?? "negozio"}.`}
              actionLabel="Continua"
              href={`/prodotto/${id}/acquista/ritiro`}
            />
            <DeliveryOptionCard
              icon="🚚"
              title="Spedizione a domicilio"
              description="Ricevi il prodotto direttamente a casa tramite corriere."
              actionLabel="Continua"
              href={`/prodotto/${id}/acquista/spedizione`}
            />
          </div>
        </div>
      </div>
    </AcquistaLayout>
  );
}