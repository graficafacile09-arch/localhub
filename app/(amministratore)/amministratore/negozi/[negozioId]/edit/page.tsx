import StoreEditor from "@/components/merchant/editor/StoreEditor";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export const metadata = {
  title: "Editor negozio — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Editor del negozio nell'Area Amministratore.
 * Riusa l'editor condiviso del venditore (StoreEditor): l'admin autorizzato
 * può modificare e salvare QUALSIASI negozio reale della piattaforma.
 * L'accesso è già garantito dal layout (sessione admin) e dalle API
 * (areaConsenteAccesso consente all'admin anche le risorse merchant).
 */
export default async function AdminEditNegozioPage({
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
        description={storeResult.errorMessage ?? "Completa la migrazione SQL prima di usare l'editor."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Il negozio non esiste oppure è stato eliminato o non è un negozio reale."
      />
    );
  }

  return <StoreEditor storeId={negozioId} basePath="/amministratore/negozi" area="admin" />;
}
