import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
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

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
        Impostazioni negozio
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
        {storeResult.data.nome}
      </h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Categoria</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{storeResult.data.categoria ?? "Non definita"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Stato</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{storeResult.data.attivo ? "Attivo" : "Non attivo"}</p>
        </div>
      </div>
      <p className="mt-6 text-sm leading-6 text-slate-600">
        Questa sezione è il punto giusto per estendere logo, contatti, descrizione commerciale e futura configurazione di Pubblica con AI.
      </p>
    </div>
  );
}
