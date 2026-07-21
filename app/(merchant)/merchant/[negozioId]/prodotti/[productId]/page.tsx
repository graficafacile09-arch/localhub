import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductForStore, getMerchantStoreForUser } from "@/lib/merchant/data";

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
        description={storeResult.errorMessage ?? "Attiva prima la Merchant Foundation nel database."}
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

  return (
    <MerchantProductForm
      negozioId={negozioId}
      productId={productId}
      initialData={productResult.data}
      submitLabel="Aggiorna prodotto"
      onSuccessRedirect={`/merchant/${negozioId}/prodotti`}
    />
  );
}
