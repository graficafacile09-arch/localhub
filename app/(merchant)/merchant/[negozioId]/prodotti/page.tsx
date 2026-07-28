import Link from "next/link";
import Image from "next/image";
import { Sparkles, Pencil } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductDeleteButton from "@/components/merchant/MerchantProductDeleteButton";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";

export default async function MerchantProductsPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area commercianti."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Accesso non disponibile"
        description="Questo negozio non è collegato al tuo account."
      />
    );
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);

  if (productsResult.errorMessage) {
    return (
      <MerchantEmptyState
        title="Impossibile caricare i prodotti"
        description={productsResult.errorMessage}
      />
    );
  }

  return (
    <div className="space-y-6">

      {/* Header con titolo e pulsanti azione */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Catalogo merchant
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Prodotti di {storeResult.data.nome}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Gestisci il catalogo del negozio. Usa l&apos;AI per aggiungere prodotti in pochi secondi.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Pulsante AI — visibile e prominente */}
            <Link
              href={`/merchant/${negozioId}/prodotti/ai`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-blue-600 to-blue-500 px-5 text-sm font-bold text-white shadow-lg shadow-blue-400/40 transition hover:from-blue-500 hover:to-blue-400"
            >
              <Sparkles className="h-4 w-4" />
              Aggiungi con AI
            </Link>

            {/* Pulsante manuale — secondario */}
            <Link
              href={`/merchant/${negozioId}/prodotti/nuovo?manual=1`}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Aggiungi manualmente
            </Link>
          </div>
        </div>
      </div>

      {/* Banner promo AI — visibile solo se il catalogo è vuoto o ha pochi prodotti */}
      {productsResult.data.length === 0 && (
        <div className="overflow-hidden rounded-[2rem] border border-blue-200 bg-linear-to-r from-blue-600 to-blue-500 p-6 text-white shadow-lg shadow-blue-400/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-50">
                <Sparkles className="h-3.5 w-3.5" />
                Assistente AI
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight">
                Aggiungi il primo prodotto in 30 secondi
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-100">
                Scatta una foto — l&apos;AI riconosce il prodotto, compila titolo, descrizione, categoria e prezzo in automatico.
              </p>
            </div>
            <Link
              href={`/merchant/${negozioId}/prodotti/ai`}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-2xl bg-white px-6 text-sm font-bold text-blue-700 shadow-md transition hover:bg-blue-50"
            >
              <Sparkles className="h-4 w-4" />
              Prova l&apos;AI
            </Link>
          </div>
        </div>
      )}

      {/* Lista prodotti o empty state manuale */}
      {productsResult.data.length === 0 ? (
        <MerchantEmptyState
          title="Catalogo ancora vuoto"
          description="Aggiungi il primo prodotto tramite AI oppure manualmente."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href={`/merchant/${negozioId}/prodotti/ai`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Sparkles className="h-4 w-4" />
                Aggiungi con AI
              </Link>
              <Link
                href={`/merchant/${negozioId}/prodotti/nuovo?manual=1`}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Aggiungi manualmente
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {productsResult.data.map((product) => {
            const imageUrl = getProdottoImmagine({
              immagine_principale: product.immagine_principale,
              categoria: product.categoria,
            });

            return (
              <div
                key={product.id}
                className="flex gap-4 rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                {/* Thumbnail 80x80 */}
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  <Image
                    src={imageUrl}
                    alt={product.nome}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </div>

                {/* Info + azioni */}
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                  {/* Riga superiore: nome + badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">
                        {product.nome}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {product.categoria ?? "Categoria"}
                        {product.sottocategoria && ` · ${product.sottocategoria}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          product.attivo
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {product.attivo ? "Attivo" : "Bozza"}
                      </span>
                      {product.origine_pubblicazione === "ai" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                          <Sparkles className="h-3 w-3" />
                          AI
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Riga inferiore: prezzo, disponibilità, azioni */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">
                        € {Number(product.prezzo ?? 0).toFixed(2)}
                      </span>
                      <span>
                        {product.quantita_disponibile != null
                          ? `${product.quantita_disponibile} disponibili`
                          : "n/d"}
                      </span>
                      {product.stato_condizione && product.stato_condizione !== "nuovo" && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {product.stato_condizione}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/merchant/${negozioId}/prodotti/${product.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifica
                      </Link>
                      <MerchantProductDeleteButton
                        negozioId={negozioId}
                        productId={product.id}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
