import Link from "next/link";
import { Sparkles } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";

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
        description={storeResult.errorMessage ?? "La tabella merchant_memberships non è ancora disponibile."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Accesso non disponibile"
        description="Questo negozio non è collegato al tuo account merchant."
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
              href={`/merchant/${negozioId}/prodotti/nuovo`}
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
                href={`/merchant/${negozioId}/prodotti/nuovo`}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Aggiungi manualmente
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {productsResult.data.map((product) => (
            <div key={product.id} className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    product.attivo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {product.attivo ? "Attivo" : "Bozza"}
                </span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {product.categoria ?? "Categoria"}
                </span>
                {product.origine_pubblicazione === "ai" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                    <Sparkles className="h-3 w-3" />
                    AI
                  </span>
                )}
                {product.stato_condizione && product.stato_condizione !== "nuovo" && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    {product.stato_condizione}
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
                {product.nome}
              </h2>

              {product.sottocategoria && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {product.sottocategoria}
                </p>
              )}

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {product.descrizione ?? "Nessuna descrizione disponibile."}
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                <span>
                  Prezzo:{" "}
                  <strong className="text-slate-900">€ {product.prezzo ?? 0}</strong>
                </span>
                <span>
                  Disponibilità:{" "}
                  <strong className="text-slate-900">
                    {product.quantita_disponibile ?? "n/d"}
                  </strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
