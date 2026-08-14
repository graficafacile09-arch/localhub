import Image from "next/image";
import Link from "next/link";
import { Pencil, Store as StoreIcon } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { getAdminNavItem } from "@/components/amministratore/navigation";
import { getProdottiAmministrazione } from "@/lib/amministratore/prodotti";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";

export const metadata = {
  title: "Prodotti — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Catalogo prodotti nell'Area Amministratore: supervisione globale dei
 * prodotti pubblicati dai commercianti. Ogni prodotto apre la modifica
 * condivisa (MerchantProductForm) via /amministratore/prodotti/[productId].
 */
export default async function AdminProdottiPage() {
  const item = getAdminNavItem("/amministratore/prodotti");
  const Icon = item.icon;
  const prodotti = await getProdottiAmministrazione();

  return (
    <div className="space-y-5">
      {/* Intestazione modulo */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Icon className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Pannello Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              {item.label}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {item.description}
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-500">
              {prodotti.length} {prodotti.length === 1 ? "prodotto" : "prodotti"} nel catalogo
            </p>
          </div>
        </div>
      </div>

      {/* Elenco prodotti */}
      {prodotti.length === 0 ? (
        <MerchantEmptyState
          title="Nessun prodotto nel catalogo"
          description="I prodotti pubblicati dai commercianti compariranno qui."
        />
      ) : (
        <div className="space-y-3">
          {prodotti.map((product) => {
            const imageUrl = getProdottoImmagine({
              immagine_principale: product.immaginePrincipale,
              categoria: product.categoria,
            });

            return (
              <div
                key={product.id}
                className="flex gap-4 rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                {/* Thumbnail */}
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">
                        {product.nome}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {product.categoria ?? "Categoria non definita"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {product.negozioDemo && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                          Demo
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          product.attivo
                            ? "bg-blue-50 text-blue-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {product.attivo ? "Attivo" : "Bozza"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">
                        € {Number(product.prezzo ?? 0).toFixed(2)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <StoreIcon className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                        <Link
                          href={`/amministratore/negozi/${product.negozioId}`}
                          className="transition hover:text-blue-700"
                        >
                          {product.negozioNome}
                        </Link>
                      </span>
                      {product.quantitaDisponibile != null && (
                        <span>{product.quantitaDisponibile} disponibili</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/amministratore/prodotti/${product.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifica
                      </Link>
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