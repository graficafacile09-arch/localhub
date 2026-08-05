import MediaManagerPage from "@/components/merchant/media/MediaManagerPage";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export const metadata = {
  title: "Libreria Media — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Libreria Media del negozio nell'Area Amministratore.
 * Riusa la libreria media del venditore per QUALSIASI negozio reale.
 */
export default async function AdminMediaNegozioPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired || !storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Il negozio non esiste oppure è stato eliminato."
      />
    );
  }

  return (
    <MediaManagerPage
      storeId={negozioId}
      backHref={`/amministratore/negozi/${negozioId}/edit`}
    />
  );
}
