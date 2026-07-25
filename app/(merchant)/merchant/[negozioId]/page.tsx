import Link from "next/link";
import { Camera, Sparkles } from "lucide-react";
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
        description={storeResult.errorMessage ?? "Esegui la migrazione SQL per attivare l'area commercianti."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso a questo negozio oppure non esiste."
      />
    );
  }

  const productsResult = await getMerchantProductsForStore(user.id, negozioId);
  const prodotti = productsResult.data;
  const attivi = prodotti.filter((item) => item.attivo).length;
  const manuali = prodotti.filter((item) => (item.origine_pubblicazione ?? "manuale") === "manuale").length;

  return (
    <div className="space-y-4">
      {/* Header compatto */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
          Dashboard negozio
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
          {storeResult.data.nome}
        </h1>
        {storeResult.data.descrizione && (
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {storeResult.data.descrizione}
          </p>
        )}
      </div>

      {/* Scansione — azione principale, immediatamente visibile */}
      <Link
        href={`/merchant/${negozioId}/prodotti/ai`}
        className="flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-500 hover:to-blue-400 active:scale-[0.98]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
          <Camera className="h-5 w-5" />
        </div>
        <span>Scansiona prodotto</span>
      </Link>

      {/* Altre azioni rapide */}
      <MerchantQuickActions storeId={negozioId} />

      {/* Statistiche — comprimibili */}
      <MerchantDashboardCards
        totals={{
          prodotti: prodotti.length,
          attivi,
          inVetrina: manuali,
        }}
      />
    </div>
  );
}
