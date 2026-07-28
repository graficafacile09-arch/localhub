import { getProdotto, getNegozio } from "@/lib/negozi";
import { getProdottoDemoById } from "@/lib/negozi-demo";
import AcquistaLayout from "../layout";
import { ProductImage } from "@/components/prodotti/ProductImage";
import { PriceDisplay } from "@/components/prodotti/PriceDisplay";
import { QuantitySelector } from "@/components/prodotti/QuantitySelector";
import { OrderSummary } from "@/components/prodotti/OrderSummary";
import { StoreInfoCard } from "@/components/prodotti/StoreInfoCard";

async function getProductData(id: string) {
  console.log("[RITIRO] getProductData START, id:", id);
  const prodottoReale = await getProdotto(id);
  console.log("[RITIRO] getProdotto result:", prodottoReale ? "found" : "null");
  const prodottoDemo = prodottoReale ? null : getProdottoDemoById(id);
  const prodotto = prodottoReale ?? prodottoDemo;
  console.log("[RITIRO] prodotto:", prodotto ? prodotto.id : "null");

  if (!prodotto) return null;

  const negozio = await getNegozio(String(prodotto.negozio_id));
  console.log("[RITIRO] negozio:", negozio ? negozio.id : "null");
  const prezzo = Number("prezzo" in prodotto ? prodotto.prezzo : 0);
  console.log("[RITIRO] prezzo:", prezzo, typeof prezzo);
  const quantita = "quantita_disponibile" in prodotto
    ? Number(prodotto.quantita_disponibile)
    : null;
  console.log("[RITIRO] quantita:", quantita);

  return { prodotto, negozio, prezzo, quantita };
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

          {negozio && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <h3 className="text-sm font-bold text-emerald-800">
                ✔ Ritiro gratuito
              </h3>
              {negozio.indirizzo && (
                <p className="mt-1 text-xs text-emerald-700">
                  {negozio.indirizzo}
                </p>
              )}
            </div>
          )}

          <StoreInfoCard negozio={negozio} />

          <button
            type="button"
            disabled={!disponibile}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          >
            CONFERMA RITIRO
          </button>
        </div>
      </div>
    </AcquistaLayout>
  );
}
