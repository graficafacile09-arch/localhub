import IncassiClient from "@/components/incassi/IncassiClient";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export const dynamic = "force-dynamic";

/**
 * Pagina "Incassi" dell'area venditore: rendicontazione economica del
 * negozio (totale pagato, commissioni, rimborsi, netto venditore) + elenco
 * ordini con dettaglio. OWNERSHIP server-side (canManageStore + RLS): il
 * venditore vede esclusivamente i propri ordini; i calcoli arrivano
 * dall'API protetta /api/merchant/stores/[negozioId]/incassi.
 */
export default async function MerchantIncassiPage({
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
        description="Non hai accesso agli incassi di questo negozio."
      />
    );
  }

  return (
    <IncassiClient
      apiUrl={`/api/merchant/stores/${negozioId}/incassi`}
      dettaglioBase={`/merchant/${negozioId}/ordini`}
      intestazione="Area venditore"
    />
  );
}
