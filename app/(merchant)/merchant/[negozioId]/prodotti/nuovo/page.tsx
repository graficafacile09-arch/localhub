import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductAiWizard from "@/components/merchant/ai/MerchantProductAiWizard";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export default async function MerchantNewProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ negozioId: string }>;
  searchParams: Promise<{ manual?: string }>;
}) {
  const { negozioId } = await params;
  const { manual } = await searchParams;
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
        description="Non puoi creare prodotti per questo negozio."
      />
    );
  }

  // Se ?manual=1 mostra il form manuale, altrimenti il wizard AI con fotocamera
  if (manual === "1") {
    return <MerchantProductForm negozioId={negozioId} />;
  }

  return <MerchantProductAiWizard negozioId={negozioId} />;
}
