import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductDeleteButton from "@/components/merchant/MerchantProductDeleteButton";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import { getNegozioIdProdotto } from "@/lib/amministratore/prodotti";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductForStore, getMerchantStoreForUser } from "@/lib/merchant/data";

export const metadata = {
  title: "Modifica prodotto — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Modifica di un prodotto nell'Area Amministratore.
 * Riusa il form condiviso del venditore (MerchantProductForm): l'admin
 * autorizzato può modificare QUALSIASI prodotto della piattaforma. Le API
 * merchant consentono la sessione admin (lib/auth/area.ts), quindi salvataggio
 * ed eliminazione funzionano senza duplicare la logica.
 */
export default async function AdminEditProdottoPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const user = await requireCurrentUser("/login");

  const negozioId = await getNegozioIdProdotto(productId);

  if (!negozioId) {
    return (
      <MerchantEmptyState
        title="Prodotto non trovato"
        description="Il prodotto richiesto non è disponibile."
      />
    );
  }

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
        description="Il negozio del prodotto non esiste oppure è stato eliminato."
      />
    );
  }

  const productResult = await getMerchantProductForStore(user.id, negozioId, productId);

  if (!productResult.data) {
    return (
      <MerchantEmptyState
        title="Prodotto non trovato"
        description="Il prodotto richiesto non è disponibile."
      />
    );
  }

  const product = productResult.data;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <Link href="/amministratore/prodotti" className="transition hover:text-blue-600">
          Prodotti
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-slate-700">{storeResult.data.nome}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="max-w-[200px] truncate font-medium text-slate-700">{product.nome}</span>
      </nav>

      {/* Header */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Package className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Area Amministratore — Modifica prodotto
            </p>
            <h1 className="mt-2 truncate text-2xl font-black tracking-tight text-slate-900">
              {product.nome}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {product.categoria ?? "Categoria"} · {storeResult.data.nome} ·{" "}
              {product.attivo ? "Attivo" : "Bozza"}
            </p>
          </div>
          <MerchantProductDeleteButton negozioId={negozioId} productId={productId} />
        </div>
      </div>

      {/* Form condiviso con il venditore */}
      <MerchantProductForm
        negozioId={negozioId}
        productId={productId}
        initialData={product}
        submitLabel="Aggiorna prodotto"
        onSuccessRedirect="/amministratore/prodotti"
      />
    </div>
  );
}