import { getProdotto, getNegozio } from "@/lib/negozi";
import { getProdottoDemoById } from "@/lib/negozi-demo";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import AcquistaLayout from "../layout";
import { PriceDisplay } from "@/components/prodotti/PriceDisplay";
import { QuantitySelector } from "@/components/prodotti/QuantitySelector";
import { OrderSummary } from "@/components/prodotti/OrderSummary";
import { StoreInfoCard } from "@/components/prodotti/StoreInfoCard";

interface ShippingFormData {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  note: string;
}

async function getProductData(id: string) {
  const prodottoReale = await getProdotto(id);
  const prodottoDemo = prodottoReale ? null : getProdottoDemoById(id);
  const prodotto = prodottoReale ?? prodottoDemo;

  if (!prodotto) return null;

  const negozio = await getNegozio(String(prodotto.negozio_id));
  const prezzo = Number("prezzo" in prodotto ? prodotto.prezzo : 0);
  const quantita = "quantita_disponibile" in prodotto
    ? Number(prodotto.quantita_disponibile)
    : null;

  return { prodotto, negozio, prezzo, quantita };
}

function FormField({
  label,
  id,
  type = "text",
  required = false,
}: {
  label: string;
  id: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-700"
      >
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        required={required}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      />
    </div>
  );
}

export default async function SpedizionePage({
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
  const totale = prezzo * 1;
  const costoSpedizione = 5.9;
  const totaleConSpedizione = totale + costoSpedizione;

  return (
    <AcquistaLayout>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl">
            <div className="relative aspect-square max-h-[400px] overflow-hidden bg-slate-100">
              <div
                role="img"
                aria-label={nome}
                className="h-full w-full bg-cover bg-center"
                style={{
                  backgroundImage: `url(${getProdottoImmagine({
                    immagine_principale: "immagine_principale" in prodotto ? (prodotto.immagine_principale as string | null) : null,
                    categoria: "categoria" in prodotto ? (prodotto.categoria as string | null) : null,
                  })})`,
                }}
              />
            </div>
          </div>

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

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <h3 className="text-sm font-bold text-slate-900">Spedizione</h3>
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>Corriere standard</span>
                <span>€{costoSpedizione.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                <span>Totale</span>
                <span>€{totaleConSpedizione.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <form className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Indirizzo di spedizione
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome" id="nome" required />
              <FormField label="Cognome" id="cognome" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Telefono" id="telefono" type="tel" required />
              <FormField label="Email" id="email" type="email" required />
            </div>
            <FormField label="Indirizzo" id="indirizzo" required />
            <div className="grid grid-cols-3 gap-3">
              <FormField label="CAP" id="cap" required />
              <FormField label="Città" id="citta" required />
              <FormField label="Provincia" id="provincia" required />
            </div>
            <FormField label="Note" id="note" />

            <StoreInfoCard negozio={negozio} />

            <button
              type="submit"
              disabled={!disponibile}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
            >
              CONTINUA AL PAGAMENTO
            </button>
          </form>
        </div>
      </div>
    </AcquistaLayout>
  );
}
