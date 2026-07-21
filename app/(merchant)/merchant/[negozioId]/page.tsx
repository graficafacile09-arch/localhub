import MerchantDashboardCards from "@/components/merchant/MerchantDashboardCards";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import MerchantQuickActions from "@/components/merchant/MerchantQuickActions";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantProductsForStore, getMerchantStoreForUser } from "@/lib/merchant/data";

export default async function MerchantStorePage({
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
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL della Merchant Foundation per attivare la dashboard."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso a questo negozio oppure non esiste una membership attiva collegata al tuo account."
      />
    );
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);
  const prodotti = productsResult.data;
  const attivi = prodotti.filter((item) => item.attivo).length;
  const manuali = prodotti.filter((item) => (item.origine_pubblicazione ?? "manuale") === "manuale").length;

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Dashboard negozio
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
          {storeResult.data.nome}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {storeResult.data.descrizione ?? "Gestisci catalogo, prodotti e impostazioni del negozio da un'unica area riservata."}
        </p>
      </div>

      <MerchantDashboardCards
        totals={{
          prodotti: prodotti.length,
          attivi,
          inVetrina: manuali,
        }}
      />

      <MerchantQuickActions storeId={negozioId} />
    </div>
  );
}
