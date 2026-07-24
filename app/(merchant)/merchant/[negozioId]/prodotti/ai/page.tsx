import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductAiWizard from "@/components/merchant/ai/MerchantProductAiWizard";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export default async function MerchantProductAiPage({
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
        title="Negozio non disponibile"
        description="Non puoi creare prodotti tramite AI per questo negozio."
      />
    );
  }

  return (
    <MerchantProductAiWizard negozioId={negozioId} />
  );
}
