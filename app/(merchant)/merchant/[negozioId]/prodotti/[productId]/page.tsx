import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductForStore, getMerchantStoreForUser } from "@/lib/merchant/data";
import { contaInteressati } from "@/lib/prodotti-avvisami";

export default async function MerchantEditProductPage({
  params,
}: {
  params: Promise<{ negozioId: string; productId: string }>;
}) {
  const { negozioId, productId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return (
      <MerchantEmptyState
        title="Configurazione database richiesta"
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area amministratore."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non puoi modificare prodotti per questo negozio."
      />
    );
  }

  const productResult = await getMerchantProductForStore(user.id, negozioId, productId);

  if (!productResult.data) {
    return (
      <MerchantEmptyState
        title="Prodotto non trovato"
        description="Il prodotto richiesto non è disponibile o non ti appartiene."
      />
    );
  }

  const product = productResult.data;
  const interessati = await contaInteressati(productId);

  return (
    <div className="space-y-4">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link
          href={`/merchant/${negozioId}/prodotti`}
          className="transition hover:text-blue-600"
        >
          Prodotti
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-slate-700 truncate max-w-[200px]">
          {product.nome}
        </span>
      </nav>

      {/* Header */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Pencil className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Modifica prodotto
            </p>
            <h1 className="mt-2 max-w-full break-words text-xl font-black tracking-tight text-slate-900 line-clamp-2">
              {product.nome}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {product.categoria ?? "Categoria"} · {product.attivo ? "Attivo" : "Bozza"}
            </p>
            {interessati > 0 && (
              <p className="mt-1 text-sm font-semibold text-blue-700">
                {interessati} {interessati === 1 ? "persona vuole essere avvisata" : "persone vogliono essere avvisate"} quando torna disponibile
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <MerchantProductForm
        negozioId={negozioId}
        productId={productId}
        initialData={product}
        submitLabel="Aggiorna prodotto"
        onSuccessRedirect={`/merchant/${negozioId}/prodotti`}
      />

    </div>
  );
}
