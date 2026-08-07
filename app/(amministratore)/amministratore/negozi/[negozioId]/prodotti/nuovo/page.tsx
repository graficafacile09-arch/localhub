import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantProductAiWizard from "@/components/merchant/ai/MerchantProductAiWizard";
import MerchantProductForm from "@/components/merchant/MerchantProductForm";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export const metadata = {
  title: "Nuovo prodotto — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Nuovo prodotto per il negozio nell'Area Amministratore.
 * Riusa il form condiviso (MerchantProductForm) o il wizard AI (MerchantProductAiWizard)
 * con redirect verso la lista prodotti del negozio in area admin.
 */
export default async function AdminStoreNewProductPage({
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
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area."}
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

  const backHref = `/amministratore/negozi/${negozioId}/edit`;
  const successoHref = `/amministratore/negozi/${negozioId}/prodotti`;

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Torna all&apos;editor del negozio
      </Link>

      {manual === "1" ? (
        <MerchantProductForm
          negozioId={negozioId}
          submitLabel="Salva prodotto"
          onSuccessRedirect={successoHref}
        />
      ) : (
        <MerchantProductAiWizard
          negozioId={negozioId}
          backHref={backHref}
          onSuccessRedirect={successoHref}
        />
      )}
    </div>
  );
}