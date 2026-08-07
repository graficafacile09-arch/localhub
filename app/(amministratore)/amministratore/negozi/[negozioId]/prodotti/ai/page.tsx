import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductAiWizard from "@/components/merchant/ai/MerchantProductAiWizard";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export const metadata = {
  title: "Scanner AI — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Scanner AI prodotti per il negozio nell'Area Amministratore.
 * Riusa il wizard condiviso del venditore con redirect verso la lista
 * prodotti del negozio in area admin.
 */
export default async function AdminStoreProductAiPage({
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
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area."}
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
    <div className="space-y-4">
      <Link
        href={`/amministratore/negozi/${negozioId}/edit`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Torna all&apos;editor del negozio
      </Link>

      <MerchantProductAiWizard
        negozioId={negozioId}
        backHref={`/amministratore/negozi/${negozioId}/edit`}
        onSuccessRedirect={`/amministratore/negozi/${negozioId}/prodotti`}
      />
    </div>
  );
}