import PayoutVenditoreClient from "@/components/merchant/PayoutVenditoreClient";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export const dynamic = "force-dynamic";

/**
 * Pagina "Payout" dell'area venditore: calcolo e tracciamento del netto da
 * erogare per periodo. OWNERSHIP server-side (canManageStore + RLS): il
 * venditore vede esclusivamente i payout dei propri negozi; ogni importo è
 * calcolato dal server (RPC service-role) e mai inviato dal browser.
 */
export default async function MerchantPayoutPage({
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
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area amministratore."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso ai payout di questo negozio."
      />
    );
  }

  return <PayoutVenditoreClient apiUrl={`/api/merchant/stores/${negozioId}/payout`} />;
}
