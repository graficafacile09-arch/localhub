import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export default async function MerchantNewProductPage({
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
        description={storeResult.errorMessage ?? "Attiva prima la Merchant Foundation nel database."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non puoi creare prodotti per questo negozio."
      />
    );
  }

  return <MerchantProductForm negozioId={negozioId} />;
}
