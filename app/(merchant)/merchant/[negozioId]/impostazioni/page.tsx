import { Settings } from "lucide-react";
import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import ModulesPage from "./ModulesPage";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export default async function MerchantSettingsPage({
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
        description={storeResult.errorMessage ?? "Completa la migrazione SQL prima di usare le impostazioni."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Negozio non disponibile"
        description="Non hai accesso alle impostazioni di questo negozio."
      />
    );
  }

  const store = storeResult.data;

  return (
    <div className="mx-auto max-w-5xl px-3 py-3 sm:px-5">
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Gestione negozio
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {store.nome ?? "Negozio"}
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-slate-500">{store.categoria ?? "Categoria non definita"}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${store.attivo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${store.attivo ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {store.attivo ? "Attivo" : "Non attivo"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <ModulesPage storeId={negozioId} />
      </div>
    </div>
  );
}
