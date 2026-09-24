import MerchantEmptyState from "@/components/merchant/MerchantEmptyState";
import PrenotazioniModule from "@/components/merchant/modules/PrenotazioniModule";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

export default async function MerchantAgendaPage({
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
        description={storeResult.errorMessage ?? "Completa la migrazione SQL prima di usare l'Agenda."}
      />
    );
  }

  if (!storeResult.data) {
    return (
      <MerchantEmptyState
        title="Agenda non disponibile"
        description="Non hai accesso a questo negozio."
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5 lg:px-8">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-700">
          Gestione appuntamenti
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
          Agenda di {storeResult.data.nome}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Calendario, disponibilità e appuntamenti. L&apos;Agenda è separata dalla modalità di vendita.
        </p>
      </div>

      <PrenotazioniModule storeId={negozioId} markReadAgenda />
    </div>
  );
}
