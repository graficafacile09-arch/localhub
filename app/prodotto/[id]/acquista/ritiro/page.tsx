import { getProdotto, getNegozio } from "@/lib/negozi";
import { getProdottoDemoById } from "@/lib/negozi-demo";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import AcquistaLayout from "../layout";

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

  const imageUrl = getProdottoImmagine({
    immagine_principale: "immagine_principale" in prodotto
      ? (prodotto.immagine_principale as string | null)
      : null,
    categoria: "categoria" in prodotto
      ? (prodotto.categoria as string | null)
      : null,
  });

  const subtotal = prezzo * 1;

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
                style={{ backgroundImage: `url(${imageUrl})` }}
              />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-black text-slate-900">{nome}</h2>
            <p className="text-2xl font-black text-emerald-700">
              €{prezzo.toFixed(2)}
            </p>
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
            <div className="mt-3 flex items-center gap-2">
              <span className="flex h-8 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900">
                1
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">Riepilogo ordine</h3>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex-1 text-slate-700">
                  {nome} × 1
                </span>
                <span className="font-semibold text-slate-900">
                  €{subtotal.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Totale</span>
                <span className="text-lg font-black text-slate-900">
                  €{subtotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

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

          <button
            type="button"
            disabled={!disponibile}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          >
            Conferma ritiro
          </button>
        </div>
      </div>
    </AcquistaLayout>
  );
}
